"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const context = { console };
context.globalThis = context;
vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(root, "physics-visuals.js"), "utf8"), context, { filename: "physics-visuals.js" });

const visuals = context.PHYSICS_VISUALS;
assert.ok(visuals, "physics visual API must load");

const slow = visuals.kinematics({ v0: 1, a: 1, t: 2, duration: 5 });
const fast = visuals.kinematics({ v0: 8, a: -2, t: 4, duration: 5 });
assert.notEqual(slow.svg, fast.svg, "x-t/v-t/a-t curves must update when motion variables change");
assert.notEqual(slow.position, fast.position, "live position must be recalculated");
assert.match(fast.svg, /feynman-kinematics-gradient/);
assert.match(fast.svg, /visual-live-point/);

const lowForce = visuals.newtonSecondLaw({ mass: 2, appliedForce: 12, opposingForce: 4 });
const highFriction = visuals.newtonSecondLaw({ mass: 2, appliedForce: 12, opposingForce: 10 });
assert.equal(lowForce.acceleration, 4);
assert.equal(highFriction.acceleration, 1);
assert.notEqual(lowForce.svg, highFriction.svg, "force and motion views must update with friction");

const lowWave = visuals.waveModel({ speed: 20, frequency: 2, time: 0 });
const highWave = visuals.waveModel({ speed: 20, frequency: 8, time: 0.1 });
assert.equal(lowWave.wavelength, 10);
assert.equal(highWave.wavelength, 2.5);
assert.notEqual(lowWave.svg, highWave.svg, "wave curve must update with frequency and time");
assert.match(highWave.svg, /feynman-wave-gradient/);

const energyTop = visuals.mechanicalEnergy({ mass: 2, initialHeight: 10, height: 9 });
const energyBottom = visuals.mechanicalEnergy({ mass: 2, initialHeight: 10, height: 1 });
assert.ok(energyBottom.kineticEnergy > energyTop.kineticEnergy);
assert.notEqual(energyTop.svg, energyBottom.svg, "energy bars must update with height");
assert.match(energyBottom.svg, /feynman-energy-shadow/);

const learningLabSource = fs.readFileSync(path.join(root, "learning-lab.js"), "utf8");
assert.match(learningLabSource, /physics-visual|PHYSICS_VISUALS|renderVisual/i, "v3.3 learning laboratory must retain the shared visual-model entry");

console.log("Dynamic, parameter-driven physics visual checks passed");
