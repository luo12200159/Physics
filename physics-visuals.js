(() => {
  "use strict";

  const EPSILON = 1e-9;

  function number(value, fallback = 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  function positive(value, fallback = 1) {
    const parsed = number(value, fallback);
    return parsed > 0 ? parsed : fallback;
  }

  function clamp(value, minimum, maximum) {
    return Math.max(minimum, Math.min(maximum, number(value, minimum)));
  }

  function format(value, digits = 3) {
    if (!Number.isFinite(value)) return "—";
    return Number(value.toFixed(digits)).toString();
  }

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, (character) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      "\"": "&quot;",
      "'": "&#39;",
    })[character]);
  }

  function forceDiagram(input = {}) {
    const forces = (Array.isArray(input.forces) ? input.forces : [])
      .map((force, index) => ({
        label: String(force?.label || `F${index + 1}`),
        x: number(force?.x),
        y: number(force?.y),
      }));
    const resultant = forces.reduce((sum, force) => ({
      x: sum.x + force.x,
      y: sum.y + force.y,
    }), { x: 0, y: 0 });
    resultant.magnitude = Math.hypot(resultant.x, resultant.y);
    resultant.angle = resultant.magnitude > EPSILON
      ? Math.atan2(resultant.y, resultant.x) * 180 / Math.PI
      : 0;

    const width = 420;
    const height = 270;
    const cx = 210;
    const cy = 135;
    const maximum = Math.max(1, resultant.magnitude, ...forces.map((force) => Math.hypot(force.x, force.y)));
    const scale = 92 / maximum;
    const arrows = forces.map((force, index) => {
      const endX = cx + force.x * scale;
      const endY = cy - force.y * scale;
      const labelX = endX + (force.x >= 0 ? 8 : -8);
      const anchor = force.x >= 0 ? "start" : "end";
      return `<g class="force-item force-item-${index + 1}"><line x1="${cx}" y1="${cy}" x2="${format(endX, 2)}" y2="${format(endY, 2)}" marker-end="url(#physics-force-arrow)"></line><text x="${format(labelX, 2)}" y="${format(endY - 7, 2)}" text-anchor="${anchor}">${escapeHtml(force.label)} ${format(Math.hypot(force.x, force.y))} N</text></g>`;
    }).join("");
    const resultEndX = cx + resultant.x * scale;
    const resultEndY = cy - resultant.y * scale;
    const resultArrow = resultant.magnitude > EPSILON
      ? `<line class="force-resultant" x1="${cx}" y1="${cy}" x2="${format(resultEndX, 2)}" y2="${format(resultEndY, 2)}" marker-end="url(#physics-force-result-arrow)"></line><text class="force-resultant-label" x="${format(resultEndX, 2)}" y="${format(resultEndY - 10, 2)}" text-anchor="middle">ΣF ${format(resultant.magnitude)} N</text>`
      : `<text class="force-resultant-label" x="${cx}" y="36" text-anchor="middle">ΣF = 0 N</text>`;
    const svg = `<svg class="physics-visual force-diagram" viewBox="0 0 ${width} ${height}" role="img" aria-label="参数驱动受力图，合力 ${format(resultant.magnitude)} 牛"><defs><marker id="physics-force-arrow" markerWidth="8" markerHeight="8" refX="7" refY="3" orient="auto"><path d="M0,0 L0,6 L8,3 z"></path></marker><marker id="physics-force-result-arrow" markerWidth="9" markerHeight="9" refX="8" refY="3.5" orient="auto"><path d="M0,0 L0,7 L9,3.5 z"></path></marker></defs><path class="visual-axis" d="M28,${cy} H392 M${cx},24 V246"></path><circle class="force-object" cx="${cx}" cy="${cy}" r="22"></circle>${arrows}${resultArrow}</svg>`;
    return { forces, resultant, svg };
  }

  function kinematics(input = {}) {
    const x0 = number(input.x0);
    const v0 = number(input.v0);
    const a = number(input.a);
    const duration = Math.max(0.1, positive(input.duration, 5));
    const t = clamp(input.t, 0, duration);
    const position = x0 + v0 * t + 0.5 * a * t ** 2;
    const velocity = v0 + a * t;
    const sampleCount = 60;
    const samples = Array.from({ length: sampleCount + 1 }, (_, index) => {
      const time = duration * index / sampleCount;
      return {
        t: time,
        x: x0 + v0 * time + 0.5 * a * time ** 2,
        v: v0 + a * time,
        a,
      };
    });
    const width = 720;
    const height = 270;
    const panelWidth = 220;
    const panelHeight = 205;
    const top = 40;
    const graph = (key, title, offset) => {
      const values = samples.map((sample) => sample[key]);
      const minimum = Math.min(0, ...values);
      const maximum = Math.max(0, ...values);
      const span = Math.max(EPSILON, maximum - minimum);
      const padX = 24;
      const padY = 24;
      const sx = (time) => offset + padX + time / duration * (panelWidth - padX * 2);
      const sy = (value) => top + panelHeight - padY - (value - minimum) / span * (panelHeight - padY * 2);
      const points = samples.map((sample) => `${format(sx(sample.t), 2)},${format(sy(sample[key]), 2)}`).join(" ");
      const zeroY = sy(0);
      const cursorX = sx(t);
      const cursorValue = key === "x" ? position : key === "v" ? velocity : a;
      const cursorY = sy(cursorValue);
      return `<g class="kinematics-panel kinematics-${key}"><text class="visual-title" x="${offset + panelWidth / 2}" y="24" text-anchor="middle">${title}</text><rect class="visual-frame" x="${offset}" y="${top}" width="${panelWidth}" height="${panelHeight}" rx="8"></rect><path class="visual-axis" d="M${offset + padX},${format(zeroY, 2)} H${offset + panelWidth - padX} M${offset + padX},${top + padY} V${top + panelHeight - padY}"></path><polyline class="kinematics-line" points="${points}" filter="url(#feynman-chart-shadow)"></polyline><line class="visual-cursor" x1="${format(cursorX, 2)}" y1="${top + padY}" x2="${format(cursorX, 2)}" y2="${top + panelHeight - padY}"></line><circle class="visual-live-point" cx="${format(cursorX, 2)}" cy="${format(cursorY, 2)}" r="5"></circle><text class="visual-scale-label" x="${offset + 5}" y="${top + 16}">${format(maximum)}</text><text class="visual-scale-label" x="${offset + 5}" y="${top + panelHeight - 6}">${format(minimum)}</text></g>`;
    };
    const svg = `<svg class="physics-visual kinematics-diagram" viewBox="0 0 ${width} ${height}" role="img" aria-label="匀变速运动 x-t 图、v-t 图和 a-t 图，同步时刻 ${format(t)} 秒"><defs><linearGradient id="feynman-kinematics-gradient" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#43b88a"></stop><stop offset="1" stop-color="#075d43"></stop></linearGradient><filter id="feynman-chart-shadow" x="-20%" y="-30%" width="140%" height="160%"><feDropShadow dx="0" dy="3" stdDeviation="2.5" flood-color="#0b4e3a" flood-opacity=".28"></feDropShadow></filter></defs>${graph("x", "x-t 图", 5)}${graph("v", "v-t 图", 250)}${graph("a", "a-t 图", 495)}</svg>`;
    return { x0, v0, a, t, duration, position, velocity, acceleration: a, samples, svg };
  }

  function circuit(input = {}) {
    const voltage = positive(input.voltage, 12);
    const resistances = (Array.isArray(input.resistances) && input.resistances.length
      ? input.resistances : [10, 20]).slice(0, 2).map((value) => positive(value, 1));
    while (resistances.length < 2) resistances.push(1);
    const mode = input.mode === "parallel" ? "parallel" : "series";
    const totalResistance = mode === "series"
      ? resistances.reduce((sum, value) => sum + value, 0)
      : 1 / resistances.reduce((sum, value) => sum + 1 / value, 0);
    const totalCurrent = voltage / totalResistance;
    const branchCurrents = mode === "series"
      ? resistances.map(() => totalCurrent)
      : resistances.map((resistance) => voltage / resistance);
    const branchVoltages = mode === "series"
      ? resistances.map((resistance, index) => resistance * branchCurrents[index])
      : resistances.map(() => voltage);
    const branchPowers = resistances.map((resistance, index) => branchCurrents[index] ** 2 * resistance);
    const totalPower = voltage * totalCurrent;
    const labels = resistances.map((resistance, index) => `<text x="${index ? 438 : 245}" y="${mode === "series" ? 77 : 102 + index * 80}" text-anchor="middle">R${index + 1}=${format(resistance)}Ω · I${index + 1}=${format(branchCurrents[index])}A</text>`).join("");
    const diagram = mode === "series"
      ? `<path class="circuit-wire" d="M90,70 H195 M295,70 H385 M485,70 H570 V220 H350 M290,220 H90 V70"></path><rect class="circuit-resistor" x="195" y="48" width="100" height="44" rx="5"></rect><rect class="circuit-resistor" x="385" y="48" width="100" height="44" rx="5"></rect>`
      : `<path class="circuit-wire" d="M90,50 H570 V225 H350 M290,225 H90 V50 M170,50 V105 H520 V50 M170,105 V185 H520 V105"></path><rect class="circuit-resistor" x="385" y="82" width="110" height="42" rx="5"></rect><rect class="circuit-resistor" x="385" y="162" width="110" height="42" rx="5"></rect>`;
    const svg = `<svg class="physics-visual circuit-diagram" viewBox="0 0 660 280" role="img" aria-label="${mode === "series" ? "串联" : "并联"}直流电路，总电流 ${format(totalCurrent)} 安"><defs><linearGradient id="feynman-resistor-gradient" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f7f0c5"></stop><stop offset=".5" stop-color="#d8ba59"></stop><stop offset="1" stop-color="#9c7421"></stop></linearGradient><filter id="feynman-circuit-shadow" x="-20%" y="-30%" width="140%" height="170%"><feDropShadow dx="0" dy="5" stdDeviation="4" flood-color="#173f32" flood-opacity=".24"></feDropShadow></filter></defs><g filter="url(#feynman-circuit-shadow)"><path class="circuit-wire battery-branch" d="M290,225 H350"></path><line class="battery-long" x1="310" y1="195" x2="310" y2="250"></line><line class="battery-short" x1="335" y1="205" x2="335" y2="240"></line>${diagram}</g>${labels}<text x="322" y="274" text-anchor="middle">U=${format(voltage)}V · R总=${format(totalResistance)}Ω · P总=${format(totalPower)}W</text></svg>`;
    return { voltage, resistances, mode, totalResistance, totalCurrent, branchCurrents, branchVoltages, branchPowers, totalPower, svg };
  }

  function scatterSvg(points, fit) {
    const width = 560;
    const height = 300;
    const pad = 42;
    const xs = points.map((point) => point.x);
    const ys = points.map((point) => point.y);
    const rawMinX = Math.min(...xs, 0);
    const rawMaxX = Math.max(...xs, 1);
    const rawMinY = Math.min(...ys, 0);
    const rawMaxY = Math.max(...ys, 1);
    const xSpan = Math.max(rawMaxX - rawMinX, 1);
    const ySpan = Math.max(rawMaxY - rawMinY, 1);
    const sx = (value) => pad + (value - rawMinX) / xSpan * (width - pad * 2);
    const sy = (value) => height - pad - (value - rawMinY) / ySpan * (height - pad * 2);
    const circles = points.map((point) => `<circle cx="${format(sx(point.x), 2)}" cy="${format(sy(point.y), 2)}" r="5"><title>(${format(point.x)}, ${format(point.y)})</title></circle>`).join("");
    const line = fit.valid
      ? `<line class="fit-line" x1="${format(sx(rawMinX), 2)}" y1="${format(sy(fit.slope * rawMinX + fit.intercept), 2)}" x2="${format(sx(rawMaxX), 2)}" y2="${format(sy(fit.slope * rawMaxX + fit.intercept), 2)}"></line>`
      : "";
    return `<svg class="physics-visual scatter-fit-diagram" viewBox="0 0 ${width} ${height}" role="img" aria-label="散点图${fit.valid ? `，线性拟合 R 方 ${format(fit.r2)}` : "，当前数据不能进行线性拟合"}"><path class="visual-axis" d="M${pad},${height - pad} H${width - pad} M${pad},${pad} V${height - pad}"></path>${line}${circles}</svg>`;
  }

  function scatterFit(input = {}) {
    const points = (Array.isArray(input.points) ? input.points : [])
      .map((point) => ({ x: number(point?.x, NaN), y: number(point?.y, NaN) }))
      .filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y));
    if (points.length < 2) {
      const result = { valid: false, reason: "至少需要两组有效数据", count: points.length, slope: null, intercept: null, r2: null };
      return { ...result, points, svg: scatterSvg(points.length ? points : [{ x: 0, y: 0 }], result) };
    }
    const xMean = points.reduce((sum, point) => sum + point.x, 0) / points.length;
    const yMean = points.reduce((sum, point) => sum + point.y, 0) / points.length;
    const denominator = points.reduce((sum, point) => sum + (point.x - xMean) ** 2, 0);
    if (denominator <= EPSILON) {
      const result = { valid: false, reason: "x 数据无变化，线性回归斜率无定义", count: points.length, slope: null, intercept: null, r2: null };
      return { ...result, points, svg: scatterSvg(points, result) };
    }
    const numerator = points.reduce((sum, point) => sum + (point.x - xMean) * (point.y - yMean), 0);
    const slope = numerator / denominator;
    const intercept = yMean - slope * xMean;
    const total = points.reduce((sum, point) => sum + (point.y - yMean) ** 2, 0);
    const residual = points.reduce((sum, point) => sum + (point.y - (slope * point.x + intercept)) ** 2, 0);
    const r2 = total <= EPSILON ? 1 : 1 - residual / total;
    const result = { valid: true, reason: "", count: points.length, slope, intercept, r2 };
    return { ...result, points, svg: scatterSvg(points, result) };
  }

  function rayDiagram(input = {}) {
    const mode = input.mode === "reflection" ? "reflection" : "refraction";
    const incidenceAngle = clamp(input.incidenceAngle, 0, 89.9);
    const n1 = positive(input.n1, 1);
    const n2 = positive(input.n2, 1.5);
    const radians = incidenceAngle * Math.PI / 180;
    const sine = n1 / n2 * Math.sin(radians);
    const totalInternalReflection = mode === "refraction" && sine > 1;
    const refractionAngle = mode === "refraction" && !totalInternalReflection
      ? Math.asin(clamp(sine, -1, 1)) * 180 / Math.PI
      : null;
    const reflectionAngle = incidenceAngle;
    const cx = 330;
    const cy = 145;
    const length = 120;
    const incidentX = cx - Math.sin(radians) * length;
    const incidentY = cy - Math.cos(radians) * length;
    const reflectedX = cx + Math.sin(radians) * length;
    const reflectedY = incidentY;
    const transmittedRadians = (refractionAngle || 0) * Math.PI / 180;
    const transmittedX = cx + Math.sin(transmittedRadians) * length;
    const transmittedY = cy + Math.cos(transmittedRadians) * length;
    const secondaryRay = mode === "reflection" || totalInternalReflection
      ? `<line class="ray reflected-ray" x1="${cx}" y1="${cy}" x2="${format(reflectedX, 2)}" y2="${format(reflectedY, 2)}" marker-end="url(#physics-ray-arrow)"></line><text x="${format(reflectedX + 8, 2)}" y="${format(reflectedY, 2)}">反射角 ${format(reflectionAngle)}°</text>`
      : `<line class="ray refracted-ray" x1="${cx}" y1="${cy}" x2="${format(transmittedX, 2)}" y2="${format(transmittedY, 2)}" marker-end="url(#physics-ray-arrow)"></line><line class="ray reflected-ray secondary" x1="${cx}" y1="${cy}" x2="${format(reflectedX, 2)}" y2="${format(reflectedY, 2)}"></line><text x="${format(transmittedX + 8, 2)}" y="${format(transmittedY, 2)}">折射角 ${format(refractionAngle)}°</text>`;
    const status = totalInternalReflection ? "发生全反射" : mode === "reflection" ? "反射定律 i=r" : `n₁sin i=n₂sin r`;
    const svg = `<svg class="physics-visual ray-diagram" viewBox="0 0 660 300" role="img" aria-label="基础光路，入射角 ${format(incidenceAngle)} 度，${status}"><defs><marker id="physics-ray-arrow" markerWidth="8" markerHeight="8" refX="7" refY="3" orient="auto"><path d="M0,0 L0,6 L8,3 z"></path></marker></defs><rect class="ray-medium ray-medium-one" x="20" y="20" width="620" height="125" rx="8"></rect><rect class="ray-medium ray-medium-two" x="20" y="145" width="620" height="135" rx="8"></rect><line class="ray-boundary" x1="20" y1="${cy}" x2="640" y2="${cy}"></line><line class="ray-normal" x1="${cx}" y1="20" x2="${cx}" y2="280"></line><line class="ray incident-ray" x1="${format(incidentX, 2)}" y1="${format(incidentY, 2)}" x2="${cx}" y2="${cy}" marker-end="url(#physics-ray-arrow)"></line>${secondaryRay}<text x="34" y="48">n₁=${format(n1)}</text><text x="34" y="176">n₂=${format(n2)}</text><text class="ray-status" x="620" y="278" text-anchor="end">${status}</text></svg>`;
    return { mode, incidenceAngle, n1, n2, reflectionAngle, refractionAngle, totalInternalReflection, svg };
  }

  function uniformMotion(input = {}) {
    return { model: "uniform", ...kinematics(input) };
  }

  function newtonSecondLaw(input = {}) {
    const mass = positive(input.mass, 2);
    const appliedForce = number(input.appliedForce, 10);
    const opposingForce = Math.max(0, number(input.opposingForce, 2));
    const netForce = appliedForce - opposingForce;
    const acceleration = netForce / mass;
    const t = Math.max(0, number(input.t, 1));
    const x0 = number(input.x0);
    const v0 = number(input.v0);
    const velocity = v0 + acceleration * t;
    const position = x0 + v0 * t + 0.5 * acceleration * t ** 2;
    const force = forceDiagram({ forces: [
      { label: "F", x: appliedForce, y: 0 },
      { label: "f", x: -opposingForce, y: 0 },
      { label: "N", x: 0, y: mass * 9.8 },
      { label: "mg", x: 0, y: -mass * 9.8 },
    ] });
    const motion = kinematics({ x0, v0, a: acceleration, t, duration: positive(input.duration, 5) });
    return { model: "newton", mass, appliedForce, opposingForce, netForce, acceleration, t, velocity, position, force, motion, svg: `<div class="physics-visual-pair">${force.svg}${motion.svg}</div>` };
  }

  function mechanicalEnergy(input = {}) {
    const mass = positive(input.mass, 2);
    const g = positive(input.g, 9.8);
    const initialHeight = positive(input.initialHeight, 10);
    const height = clamp(input.height, 0, initialHeight);
    const dissipationRatio = clamp(input.dissipationRatio, 0, 1);
    const initialEnergy = mass * g * initialHeight;
    const potentialEnergy = mass * g * height;
    const releasedEnergy = initialEnergy - potentialEnergy;
    const dissipatedEnergy = releasedEnergy * dissipationRatio;
    const kineticEnergy = releasedEnergy - dissipatedEnergy;
    const mechanicalEnergy = potentialEnergy + kineticEnergy;
    const speed = Math.sqrt(Math.max(0, 2 * kineticEnergy / mass));
    const chartHeight = 175;
    const bar = (x, value, label, className) => {
      const rendered = value / Math.max(initialEnergy, EPSILON) * chartHeight;
      return `<g class="energy-bar ${className}" filter="url(#feynman-energy-shadow)"><rect x="${x}" y="${230 - rendered}" width="80" height="${format(rendered, 2)}" rx="5"></rect><path class="energy-highlight" d="M${x + 7},${230 - rendered + 7} H${x + 73}"></path><text x="${x + 40}" y="252" text-anchor="middle">${label}</text><text x="${x + 40}" y="${Math.max(28, 220 - rendered)}" text-anchor="middle">${format(value)} J</text></g>`;
    };
    const svg = `<svg class="physics-visual energy-diagram" viewBox="0 0 560 280" role="img" aria-label="机械能转化，动能 ${format(kineticEnergy)} 焦，势能 ${format(potentialEnergy)} 焦，耗散 ${format(dissipatedEnergy)} 焦"><defs><filter id="feynman-energy-shadow" x="-30%" y="-20%" width="160%" height="150%"><feDropShadow dx="5" dy="6" stdDeviation="4" flood-color="#133d31" flood-opacity=".22"></feDropShadow></filter></defs><path class="visual-axis" d="M45,230 H525"></path>${bar(70, potentialEnergy, "重力势能", "potential")}${bar(190, kineticEnergy, "动能", "kinetic")}${bar(310, dissipatedEnergy, "耗散", "dissipated")}${bar(430, initialEnergy, "初始总能", "total")}</svg>`;
    return { model: "energy", mass, g, initialHeight, height, dissipationRatio, initialEnergy, potentialEnergy, releasedEnergy, dissipatedEnergy, kineticEnergy, mechanicalEnergy, speed, svg };
  }

  function collision1D(input = {}) {
    const m1 = positive(input.m1, 1);
    const m2 = positive(input.m2, 1);
    const u1 = number(input.u1, 3);
    const u2 = number(input.u2);
    const type = input.type === "inelastic" ? "inelastic" : "elastic";
    let v1;
    let v2;
    if (type === "inelastic") {
      v1 = (m1 * u1 + m2 * u2) / (m1 + m2);
      v2 = v1;
    } else {
      v1 = ((m1 - m2) * u1 + 2 * m2 * u2) / (m1 + m2);
      v2 = (2 * m1 * u1 + (m2 - m1) * u2) / (m1 + m2);
    }
    const momentumBefore = m1 * u1 + m2 * u2;
    const momentumAfter = m1 * v1 + m2 * v2;
    const kineticBefore = 0.5 * m1 * u1 ** 2 + 0.5 * m2 * u2 ** 2;
    const kineticAfter = 0.5 * m1 * v1 ** 2 + 0.5 * m2 * v2 ** 2;
    const kineticLoss = kineticBefore - kineticAfter;
    const speedScale = 24 / Math.max(1, Math.abs(u1), Math.abs(u2), Math.abs(v1), Math.abs(v2));
    const cart = (x, y, mass, velocity, label, joined = false) => {
      const end = x + velocity * speedScale;
      return `<g class="collision-cart${joined ? " joined" : ""}"><rect x="${x - 35}" y="${y - 28}" width="70" height="42" rx="7"></rect><circle cx="${x - 22}" cy="${y + 20}" r="7"></circle><circle cx="${x + 22}" cy="${y + 20}" r="7"></circle><text x="${x}" y="${y - 6}" text-anchor="middle">${label} ${format(mass)}kg</text><line class="velocity-arrow" x1="${x}" y1="${y - 42}" x2="${format(end, 2)}" y2="${y - 42}" marker-end="url(#physics-collision-arrow)"></line><text x="${format(end, 2)}" y="${y - 50}" text-anchor="middle">${format(velocity)}m/s</text></g>`;
    };
    const after = type === "inelastic"
      ? `${cart(470, 205, m1 + m2, v1, "m₁+m₂", true)}`
      : `${cart(420, 205, m1, v1, "m₁")}${cart(570, 205, m2, v2, "m₂")}`;
    const svg = `<svg class="physics-visual collision-diagram" viewBox="0 0 700 300" role="img" aria-label="一维${type === "elastic" ? "弹性" : "完全非弹性"}碰撞，动量守恒"><defs><marker id="physics-collision-arrow" markerWidth="8" markerHeight="8" refX="7" refY="3" orient="auto"><path d="M0,0 L0,6 L8,3 z"></path></marker></defs><text class="visual-title" x="175" y="30" text-anchor="middle">碰撞前</text><text class="visual-title" x="520" y="30" text-anchor="middle">碰撞后</text><line class="collision-divider" x1="350" y1="18" x2="350" y2="270"></line><path class="collision-ground" d="M30,240 H325 M375,240 H670"></path>${cart(110, 205, m1, u1, "m₁")}${cart(250, 205, m2, u2, "m₂")}${after}<text x="350" y="290" text-anchor="middle">p前=${format(momentumBefore)} kg·m/s · p后=${format(momentumAfter)} kg·m/s · ΔEk=${format(kineticLoss)} J</text></svg>`;
    return { model: "collision", type, m1, m2, u1, u2, v1, v2, momentumBefore, momentumAfter, kineticBefore, kineticAfter, kineticLoss, svg };
  }

  function waveModel(input = {}) {
    const speed = positive(input.speed, 20);
    const frequency = positive(input.frequency, 5);
    const amplitude = positive(input.amplitude, 1);
    const time = number(input.time);
    const wavelength = speed / frequency;
    const period = 1 / frequency;
    const width = 700;
    const height = 280;
    const left = 45;
    const right = 665;
    const centerY = 140;
    const visibleLength = wavelength * 2;
    const points = Array.from({ length: 121 }, (_, index) => {
      const distance = visibleLength * index / 120;
      const displacement = amplitude * Math.sin(2 * Math.PI * (distance / wavelength - frequency * time));
      const x = left + index / 120 * (right - left);
      const y = centerY - displacement / amplitude * 72;
      return `${format(x, 2)},${format(y, 2)}`;
    }).join(" ");
    const lambdaPixels = (right - left) / 2;
    const svg = `<svg class="physics-visual wave-diagram" viewBox="0 0 ${width} ${height}" role="img" aria-label="机械波，波速 ${format(speed)} 米每秒，频率 ${format(frequency)} 赫兹，波长 ${format(wavelength)} 米"><defs><marker id="physics-wave-arrow" markerWidth="8" markerHeight="8" refX="7" refY="3" orient="auto"><path d="M0,0 L0,6 L8,3 z"></path></marker><linearGradient id="feynman-wave-gradient" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#64cf9f"></stop><stop offset=".48" stop-color="#097551"></stop><stop offset="1" stop-color="#e08749"></stop></linearGradient><filter id="feynman-wave-shadow" x="-10%" y="-30%" width="120%" height="160%"><feDropShadow dx="0" dy="5" stdDeviation="3" flood-color="#0a503a" flood-opacity=".3"></feDropShadow></filter></defs><path class="visual-axis" d="M${left},${centerY} H${right}"></path><polyline class="wave-line" points="${points}" filter="url(#feynman-wave-shadow)"></polyline><line class="wave-amplitude" x1="${left + 18}" y1="${centerY}" x2="${left + 18}" y2="${centerY - 72}"></line><text x="${left + 25}" y="${centerY - 38}">A=${format(amplitude)}</text><path class="wave-wavelength" d="M${left},245 V258 M${left},252 H${left + lambdaPixels} M${left + lambdaPixels},245 V258"></path><text x="${left + lambdaPixels / 2}" y="274" text-anchor="middle">λ=${format(wavelength)}m</text><line class="wave-direction" x1="520" y1="38" x2="635" y2="38" marker-end="url(#physics-wave-arrow)"></line><text x="515" y="30">传播方向 v=${format(speed)}m/s</text></svg>`;
    return { model: "wave", speed, frequency, amplitude, time, wavelength, period, svg };
  }

  function metadataText(value) {
    if (value == null) return "";
    if (Array.isArray(value)) return value.map(metadataText).filter(Boolean).join(" ");
    if (typeof value === "object") {
      return ["model", "modelType", "type", "representation", "representationType", "kind", "name", "label", "id", "topic", "knowledgePointId"]
        .map((key) => metadataText(value[key]))
        .filter(Boolean)
        .join(" ");
    }
    return String(value);
  }

  function canonicalModel(value) {
    const text = metadataText(value).normalize("NFKC").toLocaleLowerCase("en-US");
    if (!text) return "";
    if (/collision|momentum|碰撞|动量/.test(text)) return "collision";
    if (/wave|wavelength|frequency|机械波|波速|波长|频率|横波|纵波/.test(text)) return "wave";
    if (/circuit|electricity|ohm|resistor|电路|欧姆|电阻|电流|电压/.test(text)) return "circuit";
    if (/projectile|parabolic|平抛|斜抛|抛体/.test(text)) return "projectile";
    if (/incline|slope|斜面/.test(text)) return "incline";
    if (/newton|free[- ]?body|force[- ]?diagram|(^|[^a-z])force([^a-z]|$)|牛顿第二|合力|受力/.test(text)) return "newton";
    if (/mechanical[- ]?energy|energy|机械能|动能|势能|功能关系|能量守恒/.test(text)) return "energy";
    if (/kinematic|uniform[- ]?(acceleration|motion)|acceleration|x[- ]?t|v[- ]?t|a[- ]?t|匀变速|匀加速|匀减速|自由落体|加速度|运动图像/.test(text)) return "uniform";
    return "";
  }

  function modelForQuestion(question = {}) {
    const explicitCandidates = [
      question.visualSpec?.model,
      question.visualSpec?.modelType,
      question.offlineModel,
      question.model,
      question.modelType,
      question.modelDefinitionId,
      question.modelFamilyId,
    ];
    for (const candidate of explicitCandidates) {
      const model = canonicalModel(candidate);
      if (model) return model;
    }
    return canonicalModel([
      question.visualSpec,
      question.representationType,
      question.knowledge,
      question.knowledgePoints,
      question.knowledgePointId,
      question.attachments,
      question.topic,
      question.title,
      question.content,
      question.textbookUnit,
      question.examPoints,
    ]);
  }

  const api = Object.freeze({
    forceDiagram,
    kinematics,
    circuit,
    scatterFit,
    rayDiagram,
    uniformMotion,
    newtonSecondLaw,
    mechanicalEnergy,
    collision1D,
    waveModel,
    modelForQuestion,
  });

  if (typeof globalThis !== "undefined") globalThis.PHYSICS_VISUALS = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})();
