(() => {
  "use strict";

  let qrCameraStream = null;
  let qrCameraTimer = 0;

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, (character) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;",
    })[character]);
  }

  function formatDate(value, includeTime = false) {
    const date = new Date(value || 0);
    if (!Number.isFinite(date.getTime())) return "—";
    return new Intl.DateTimeFormat("zh-CN", includeTime
      ? { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }
      : { year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
  }

  function edition() {
    try {
      const nativeValue = globalThis.PhysicsStudioAndroid?.getAppEdition?.();
      const browserEntry = !globalThis.PhysicsStudioAndroid
        ? globalThis.document?.body?.dataset?.edition
        : "";
      const value = String(nativeValue || globalThis.PHYSICS_STUDIO_APP_EDITION || browserEntry || "legacy");
      return value === "student" || value === "teacher" ? value : "legacy";
    } catch {
      return "legacy";
    }
  }

  function assertEdition(expected) {
    const actual = edition();
    if (actual === expected) return true;
    document.body.innerHTML = `<main class="edition-fatal"><h1>应用包配置错误</h1><p>当前入口要求 ${escapeHtml(expected)}，原生包声明为 ${escapeHtml(actual)}。为防止权限界面混用，应用已停止加载。</p></main>`;
    throw new Error(`edition_mismatch:${actual}:${expected}`);
  }

  function toast(message, kind = "info") {
    let element = document.querySelector("#roleToast");
    if (!element) {
      element = document.createElement("div");
      element.id = "roleToast";
      element.className = "role-toast";
      element.setAttribute("role", "status");
      document.body.append(element);
    }
    element.dataset.kind = kind;
    element.textContent = String(message || "");
    element.classList.add("visible");
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => element.classList.remove("visible"), 3200);
  }

  function errorMessage(error) {
    return String(error?.message || error || "操作失败，请稍后重试。").slice(0, 240);
  }

  function setButtonBusy(button, busy, busyLabel = "处理中…") {
    if (!button) return;
    if (busy) {
      button.dataset.previousLabel = button.textContent;
      button.textContent = busyLabel;
      button.disabled = true;
    } else {
      button.textContent = button.dataset.previousLabel || button.textContent;
      button.disabled = false;
      delete button.dataset.previousLabel;
    }
  }

  async function restoreOnlineSession() {
    const client = globalThis.PhysicsStudioClassroom;
    if (!client?.restoreSession || !client.status().restorableSession) return client?.status?.() || null;
    try {
      await client.restoreSession();
    } catch (error) {
      if (!["network_error", "request_timeout", "service_not_configured"].includes(error?.code)) throw error;
    }
    return client.status();
  }

  function qrMultiply(left, right) {
    let a = left;
    let b = right;
    let result = 0;
    while (b > 0) {
      if (b & 1) result ^= a;
      b >>>= 1;
      a <<= 1;
      if (a & 0x100) a ^= 0x11d;
    }
    return result & 0xff;
  }

  function qrPower(exponent) {
    let value = 1;
    for (let index = 0; index < exponent; index += 1) value = qrMultiply(value, 2);
    return value;
  }

  function qrGeneratorPolynomial(degree) {
    let polynomial = [1];
    for (let exponent = 0; exponent < degree; exponent += 1) {
      const next = new Array(polynomial.length + 1).fill(0);
      polynomial.forEach((coefficient, index) => {
        next[index] ^= coefficient;
        next[index + 1] ^= qrMultiply(coefficient, qrPower(exponent));
      });
      polynomial = next;
    }
    return polynomial;
  }

  function qrErrorCorrection(data, degree) {
    const generator = qrGeneratorPolynomial(degree);
    const message = [...data, ...new Array(degree).fill(0)];
    for (let offset = 0; offset < data.length; offset += 1) {
      const factor = message[offset];
      if (!factor) continue;
      generator.forEach((coefficient, index) => { message[offset + index] ^= qrMultiply(coefficient, factor); });
    }
    return message.slice(-degree);
  }

  function qrAppendBits(target, value, length) {
    for (let bit = length - 1; bit >= 0; bit -= 1) target.push(Boolean((value >>> bit) & 1));
  }

  function qrBchDigit(value) {
    let digit = 0;
    for (let current = value; current !== 0; current >>>= 1) digit += 1;
    return digit;
  }

  function qrFormatBits(maskPattern) {
    const formatData = (1 << 3) | maskPattern;
    let remainder = formatData << 10;
    const generator = 0x537;
    while (qrBchDigit(remainder) - qrBchDigit(generator) >= 0) {
      remainder ^= generator << (qrBchDigit(remainder) - qrBchDigit(generator));
    }
    return ((formatData << 10) | remainder) ^ 0x5412;
  }

  function buildInviteQrMatrix(payload) {
    const code = String(payload || "");
    if (!code || code.length > 108) throw new Error("二维码内容过长或为空。 ");
    const version = code.length <= 22 ? 2 : code.length <= 80 ? 4 : 5;
    const size = 17 + version * 4;
    const dataCodewordCount = version === 2 ? 34 : version === 4 ? 80 : 108;
    const correctionCodewordCount = version === 2 ? 10 : version === 4 ? 20 : 26;
    const bits = [];
    qrAppendBits(bits, 0b0100, 4);
    qrAppendBits(bits, code.length, 8);
    for (let index = 0; index < code.length; index += 1) qrAppendBits(bits, code.charCodeAt(index), 8);
    const maximumBits = dataCodewordCount * 8;
    for (let index = 0; index < 4 && bits.length < maximumBits; index += 1) bits.push(false);
    while (bits.length % 8) bits.push(false);
    const data = [];
    for (let offset = 0; offset < bits.length; offset += 8) {
      let value = 0;
      for (let bit = 0; bit < 8; bit += 1) value = (value << 1) | Number(bits[offset + bit]);
      data.push(value);
    }
    for (let pad = 0; data.length < dataCodewordCount; pad += 1) data.push(pad % 2 === 0 ? 0xec : 0x11);
    const codewords = [...data, ...qrErrorCorrection(data, correctionCodewordCount)];
    const dataBits = [];
    codewords.forEach((value) => qrAppendBits(dataBits, value, 8));
    const matrix = Array.from({ length: size }, () => new Array(size).fill(null));
    const setupFinder = (row, column) => {
      for (let rowOffset = -1; rowOffset <= 7; rowOffset += 1) {
        for (let columnOffset = -1; columnOffset <= 7; columnOffset += 1) {
          const targetRow = row + rowOffset;
          const targetColumn = column + columnOffset;
          if (targetRow < 0 || targetRow >= size || targetColumn < 0 || targetColumn >= size) continue;
          matrix[targetRow][targetColumn] = rowOffset >= 0 && rowOffset <= 6
            && columnOffset >= 0 && columnOffset <= 6
            && (rowOffset === 0 || rowOffset === 6 || columnOffset === 0 || columnOffset === 6
              || (rowOffset >= 2 && rowOffset <= 4 && columnOffset >= 2 && columnOffset <= 4));
        }
      }
    };
    setupFinder(0, 0);
    setupFinder(size - 7, 0);
    setupFinder(0, size - 7);
    const alignment = version === 2 ? 18 : version === 4 ? 26 : 30;
    [6, alignment].forEach((row) => [6, alignment].forEach((column) => {
      if (matrix[row][column] !== null) return;
      for (let rowOffset = -2; rowOffset <= 2; rowOffset += 1) {
        for (let columnOffset = -2; columnOffset <= 2; columnOffset += 1) {
          matrix[row + rowOffset][column + columnOffset] = Math.abs(rowOffset) === 2
            || Math.abs(columnOffset) === 2 || (rowOffset === 0 && columnOffset === 0);
        }
      }
    }));
    for (let index = 8; index < size - 8; index += 1) {
      if (matrix[index][6] === null) matrix[index][6] = index % 2 === 0;
      if (matrix[6][index] === null) matrix[6][index] = index % 2 === 0;
    }
    const setFormatInfo = (value) => {
      for (let index = 0; index < 15; index += 1) {
        const dark = Boolean((value >>> index) & 1);
        if (index < 6) matrix[index][8] = dark;
        else if (index < 8) matrix[index + 1][8] = dark;
        else matrix[size - 15 + index][8] = dark;
        if (index < 8) matrix[8][size - index - 1] = dark;
        else if (index === 8) matrix[8][7] = dark;
        else matrix[8][15 - index - 1] = dark;
      }
      matrix[size - 8][8] = true;
    };
    setFormatInfo(0);
    let row = size - 1;
    let direction = -1;
    let bitIndex = 0;
    for (let rightColumn = size - 1; rightColumn > 0; rightColumn -= 2) {
      if (rightColumn === 6) rightColumn -= 1;
      while (true) {
        for (let offset = 0; offset < 2; offset += 1) {
          const column = rightColumn - offset;
          if (matrix[row][column] !== null) continue;
          let dark = bitIndex < dataBits.length ? dataBits[bitIndex] : false;
          if ((row + column) % 2 === 0) dark = !dark;
          matrix[row][column] = dark;
          bitIndex += 1;
        }
        row += direction;
        if (row >= 0 && row < size) continue;
        row -= direction;
        direction = -direction;
        break;
      }
    }
    setFormatInfo(qrFormatBits(0));
    return matrix;
  }

  function renderInviteQr(canvas, payload) {
    if (!canvas) throw new Error("二维码画布不存在。 ");
    const matrix = buildInviteQrMatrix(payload);
    const quietZone = 4;
    const moduleSize = 6;
    const pixelSize = (matrix.length + quietZone * 2) * moduleSize;
    canvas.width = pixelSize;
    canvas.height = pixelSize;
    const context = canvas.getContext("2d", { alpha: false });
    context.imageSmoothingEnabled = false;
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, pixelSize, pixelSize);
    context.fillStyle = "#111111";
    matrix.forEach((modules, row) => modules.forEach((dark, column) => {
      if (dark) context.fillRect((column + quietZone) * moduleSize, (row + quietZone) * moduleSize, moduleSize, moduleSize);
    }));
  }

  function invitePayload(value) {
    try {
      const parsed = globalThis.PhysicsStudioClassroom?.parseInvitePayload?.(String(value || "").trim());
      return parsed?.serverUrl || parsed?.classId ? String(value).trim() : parsed?.code || "";
    } catch {
      return "";
    }
  }

  async function imageSource(file) {
    if (typeof createImageBitmap === "function") return createImageBitmap(file);
    const url = URL.createObjectURL(file);
    try {
      const image = new Image();
      image.src = url;
      await image.decode();
      return image;
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  async function decodeInviteQr(file) {
    if (!(file instanceof Blob) || !String(file.type || "").startsWith("image/")) throw new Error("请选择二维码图片。 ");
    if (file.size > 12 * 1024 * 1024) throw new Error("二维码图片不能超过 12 MB。 ");
    if (typeof globalThis.jsQR !== "function") throw new Error("二维码识别模块未加载。 ");
    const source = await imageSource(file);
    try {
      const width = source.width || source.naturalWidth;
      const height = source.height || source.naturalHeight;
      const scale = Math.min(1, 1600 / Math.max(width, height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(width * scale));
      canvas.height = Math.max(1, Math.round(height * scale));
      const context = canvas.getContext("2d", { willReadFrequently: true });
      context.drawImage(source, 0, 0, canvas.width, canvas.height);
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
      const decoded = globalThis.jsQR(pixels.data, pixels.width, pixels.height, { inversionAttempts: "attemptBoth" });
      const payload = invitePayload(decoded?.data);
      if (!payload) throw new Error("未识别到有效班级邀请码。 ");
      return payload;
    } finally {
      source.close?.();
    }
  }

  function stopQrCamera() {
    if (qrCameraTimer) clearTimeout(qrCameraTimer);
    qrCameraTimer = 0;
    qrCameraStream?.getTracks?.().forEach((track) => track.stop());
    qrCameraStream = null;
  }

  async function scanInviteQr(video, canvas, onDecoded) {
    stopQrCamera();
    if (!navigator.mediaDevices?.getUserMedia || typeof globalThis.jsQR !== "function") {
      throw new Error("当前设备不支持摄像头扫描，请选择二维码图片或手动输入。 ");
    }
    qrCameraStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
    video.srcObject = qrCameraStream;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    const scan = () => {
      if (!qrCameraStream) return;
      if (!video.videoWidth) {
        qrCameraTimer = setTimeout(scan, 120);
        return;
      }
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      context.drawImage(video, 0, 0);
      const frame = context.getImageData(0, 0, canvas.width, canvas.height);
      const decoded = globalThis.jsQR(frame.data, frame.width, frame.height, { inversionAttempts: "attemptBoth" });
      const payload = invitePayload(decoded?.data);
      if (payload) {
        stopQrCamera();
        onDecoded(payload);
        return;
      }
      qrCameraTimer = setTimeout(scan, 120);
    };
    video.addEventListener("loadedmetadata", scan, { once: true });
    scan();
  }

  globalThis.FeynmanDualApp = Object.freeze({
    escapeHtml,
    formatDate,
    edition,
    assertEdition,
    toast,
    errorMessage,
    setButtonBusy,
    restoreOnlineSession,
    renderInviteQr,
    decodeInviteQr,
    scanInviteQr,
    stopQrCamera,
  });
})();
