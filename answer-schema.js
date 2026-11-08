(() => {
  "use strict";

  // Only these dimensions are supported by the structured offline grader.
  // An unfamiliar unit, qualitative conclusion or ambiguous direction is
  // deliberately sent to manual review instead of being guessed from prose.
  const units = Object.freeze({
    "kg/m³": "density", "g/cm³": "density", "m/s²": "acceleration",
    "km/h": "speed", "m/s": "speed", "cm²": "area", "mm²": "area",
    "m²": "area", "cm³": "volume", "m³": "volume", "kPa": "pressure",
    "kJ": "energy", "kW": "power", "mA": "current", "cm": "length",
    "mm": "length", "km": "length", "kg": "mass", "min": "time",
    "Hz": "frequency", "Pa": "pressure", "N": "force", "J": "energy",
    "W": "power", "V": "voltage", "A": "current", "Ω": "resistance",
    "C": "charge", "T": "magneticField", "Wb": "magneticFlux",
    "F": "capacitance", "μF": "capacitance", "pF": "capacitance",
    "eV": "energy", "N/C": "electricField", "V/m": "electricField",
    "N·s": "momentum", "kg·m/s": "momentum", "rad/s": "angularSpeed",
    "K": "temperatureKelvin", "℃": "temperatureCelsius", "mol": "amount",
    "m": "length", "s": "time", "h": "time", "g": "mass"
  });
  const unitPattern = Object.keys(units).sort((a, b) => b.length - a.length)
    .map((unit) => unit.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
  const numberPattern = "[-+]?(?:√\\d+(?:\\.\\d+)?(?:/\\d+(?:\\.\\d+)?)?|(?:\\d+(?:\\.\\d+)?|\\.\\d+)/(?:\\d+(?:\\.\\d+)?|\\.\\d+)|(?:\\d+(?:\\.\\d+)?|\\.\\d+)(?:e[-+]?\\d+)?)";
  const quantityPattern = new RegExp(`(${numberPattern})\\s*(${unitPattern})(?![A-Za-z/²³])`, "g");
  const directions = Object.freeze({
    "垂直纸面向里": "into-page", "垂直纸面向外": "out-of-page",
    "沿斜面向上": "incline-up", "沿斜面向下": "incline-down",
    "水平向右": "right", "水平向左": "left", "竖直向上": "up", "竖直向下": "down",
    "逆时针": "counterclockwise", "顺时针": "clockwise",
    "向右": "right", "向左": "left", "向上": "up", "向下": "down"
  });
  const directionNames = Object.keys(directions).sort((a, b) => b.length - a.length);

  function normalizeScientificText(text) {
    const superscript = { "⁻": "-", "⁺": "+", "⁰": "0", "¹": "1", "²": "2", "³": "3", "⁴": "4", "⁵": "5", "⁶": "6", "⁷": "7", "⁸": "8", "⁹": "9" };
    return String(text || "")
      .replace(/10([⁻⁺⁰¹²³⁴⁵⁶⁷⁸⁹]+)/g, (_, exponent) => `10^${[...exponent].map((char) => superscript[char]).join("")}`)
      .replace(/[−－]/g, "-")
      .replace(/[×·]\s*10\s*\^?\s*([+-]?\d+)/g, "e$1")
      .replace(/(^|[^\d])10\s*\^\s*([+-]?\d+)/g, "$11e$2");
  }

  function parseNumber(text) {
    const sign = text.startsWith("-") ? -1 : 1;
    const unsigned = text.replace(/^[-+]/, "");
    if (unsigned.startsWith("√")) {
      const [radicand, denominator = "1"] = unsigned.slice(1).split("/");
      return sign * Math.sqrt(Number(radicand)) / Number(denominator);
    }
    if (unsigned.includes("/")) {
      const [numerator, denominator] = unsigned.split("/");
      return sign * Number(numerator) / Number(denominator);
    }
    return Number(text);
  }

  function directionMatches(text) {
    const matches = [];
    for (const label of directionNames) {
      let start = text.indexOf(label);
      while (start !== -1) {
        const end = start + label.length;
        if (!matches.some((item) => start < item.end && end > item.start)) {
          matches.push({ label, value: directions[label], start, end });
        }
        start = text.indexOf(label, start + 1);
      }
    }
    return matches.sort((a, b) => a.start - b.start);
  }

  function quantities(text) {
    const value = normalizeScientificText(text);
    const found = [...value.matchAll(quantityPattern)].map((match) => ({
      value: parseNumber(match[1]), unit: match[2], start: match.index, end: match.index + match[0].length
    }));
    if (!found.length || found.some((item) => !Number.isFinite(item.value))) return [];
    let remainder = value;
    for (const item of [...found].reverse()) remainder = remainder.slice(0, item.start) + remainder.slice(item.end);
    // A remaining number means the answer contains data this schema did not cover.
    if (/[0-9]/.test(remainder)) return [];
    return found;
  }

  function validSchema(schema) {
    if (!schema || schema.answerSchemaVersion !== 1 || !Array.isArray(schema.parts) || !schema.parts.length) return false;
    const ids = new Set();
    return schema.parts.every((part) => {
      if (!part || typeof part.id !== "string" || !part.id || ids.has(part.id)) return false;
      ids.add(part.id);
      if (part.kind === "choice") return Array.isArray(part.expectedOptionIds)
        && part.expectedOptionIds.length > 0
        && new Set(part.expectedOptionIds).size === part.expectedOptionIds.length
        && part.expectedOptionIds.every((id) => /^[A-D]$/.test(id));
      return part.kind === "quantity" && units[part.expected?.unit] === part.quantity
        && Number.isFinite(part.expected?.value)
        && Number.isFinite(part.tolerance?.absolute) && part.tolerance.absolute >= 0
        && Number.isFinite(part.tolerance?.relative) && part.tolerance.relative >= 0
        && (!part.directionRequired || Object.values(directions).includes(part.expectedDirection));
    });
  }

  function manual(reason) {
    return { answerSchema: null, autoScorable: false, answerSchemaReviewStatus: reason };
  }

  function forQuestion(question) {
    if (question.autoScorable === false) return manual("题目要求人工复核");
    if (question.answerSchema) return validSchema(question.answerSchema)
      ? { answerSchema: question.answerSchema, autoScorable: true, answerSchemaReviewStatus: "规则校验通过，待教师抽检" }
      : manual("答案规范无效，待人工复核");

    const type = String(question.questionType || "");
    if (/实验|作图|简答|论证|探究|开放|证明/.test(type)) return manual("过程或解释需人工复核");
    const answer = String(question.answer || "").trim();
    if (/选择/.test(type)) {
      const choice = answer.match(/^(?:选\s*|答案[：:为]?\s*)?([A-D](?:[、,/和][A-D])*)(?:[。.]|$)/);
      if (!choice) return manual("参考答案不是明确的选项集合");
      const expectedOptionIds = [...new Set(choice[1].match(/[A-D]/g))];
      if (/单项/.test(type) && expectedOptionIds.length !== 1) return manual("单选答案包含多个选项");
      return {
        answerSchema: { answerSchemaVersion: 1, parts: [{ id: "part-1", kind: "choice", expectedOptionIds }] },
        autoScorable: true, answerSchemaReviewStatus: "规则校验通过，待教师抽检"
      };
    }
    if (!/计算|填空|数值/.test(type)) return manual("题型未建立可靠的自动评分规则");
    if (/吸热|放热|实像|虚像|增大|减小|不变|正确|错误|相同|相反|不能|仍|需要|应当|是否|不选|排除/.test(answer)) {
      return manual("答案包含不能仅凭数值评价的解释或判断");
    }
    const parts = quantities(answer);
    if (!parts.length || parts.length > 6) return manual("无法唯一提取参考物理量与单位");
    const directionMentions = directionMatches(answer);
    if ((answer.includes("方向") && directionMentions.length !== 1) || directionMentions.length > 1
      || (directionMentions.length && parts.length !== 1)) return manual("方向或多物理量归属不明确");
    const answerSchema = { answerSchemaVersion: 1, parts: parts.map((part, index) => ({
      id: `part-${index + 1}`, kind: "quantity", quantity: units[part.unit],
      expected: { value: part.value, unit: part.unit },
      tolerance: { absolute: 0, relative: 0.015 }, unitRequired: true,
      ...(directionMentions.length ? { directionRequired: true, expectedDirection: directionMentions[0].value } : {})
    })) };
    return validSchema(answerSchema)
      ? { answerSchema, autoScorable: true, answerSchemaReviewStatus: "规则校验通过，待教师抽检" }
      : manual("参考物理量不受当前评分器支持");
  }

  function normalizeResponse(question, response) {
    if (response && typeof response === "object" && Array.isArray(response.parts)) return response;
    const schema = question?.answerSchema;
    if (!validSchema(schema) || typeof response !== "string") return response;
    const text = response.trim();
    if (schema.parts.every((part) => part.kind === "choice")) {
      const explicit = text.match(/^(?:选\s*|答案[：:为]?\s*)([A-D](?:[、,/和][A-D])*)(?:[。.]|$)/);
      const plain = /^[A-D](?:[、,/和]?[A-D])*$/.test(text) ? text : null;
      const selected = explicit?.[1] || plain;
      if (!selected) return response;
      return { parts: [{ id: schema.parts[0].id, optionIds: [...new Set(selected.match(/[A-D]/g))] }] };
    }
    if (!schema.parts.every((part) => part.kind === "quantity")) return response;
    const normalizedText = normalizeScientificText(text);
    const values = quantities(text);
    if (values.length !== schema.parts.length) return response;
    const mentions = directionMatches(normalizedText);
    return { parts: schema.parts.map((part, index) => ({
      id: part.id, value: values[index].value, unit: values[index].unit,
      ...(part.directionRequired ? (() => {
        const start = values[index].end;
        const end = index + 1 < values.length ? values[index + 1].start : normalizedText.length;
        const relevant = mentions.filter((mention) => mention.start >= start && mention.end <= end);
        return relevant.length === 1 ? { direction: relevant[0].value } : {};
      })() : {})
    })) };
  }

  window.PHYSICS_ANSWER_SCHEMA = Object.freeze({ forQuestion, normalizeResponse, validSchema });
})();
