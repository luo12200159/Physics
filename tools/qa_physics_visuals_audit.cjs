const assert = require('node:assert/strict');
const {test} = require('node:test');
const v = require('../physics-visuals.js');
const near = (a,b)=>assert.ok(Math.abs(a-b)<1e-9);
for(const mode of ['series','parallel']) test(mode+' topology and numerical laws',()=>{
 const r=v.circuit({mode,voltage:12,resistances:[10,20]});
 near(r.totalCurrent,mode==='series'?.4:1.8);
 assert.deepEqual(r.branchVoltages,mode==='series'?[4,8]:[12,12]);
 near(r.branchPowers.reduce((a,b)=>a+b,0),r.totalPower);
 assert.ok(r.topology,'circuit must expose the same topology used for rendering');
 const {nodes,components,wires}=r.topology;
 assert.equal((r.svg.match(/class="circuit-wire"/g)||[]).length,wires.length,'SVG has an unmodeled conductor');
 const terminals=components.flatMap(c=>c.terminals.map((point,index)=>({point,node:c.nodes[index]})));
 const vertices=[...wires.flatMap(w=>w.segments.flat()),...terminals.map(t=>t.point)];
 const on=(p,a,b)=>((p[0]===a[0]&&a[0]===b[0]&&p[1]>=Math.min(a[1],b[1])&&p[1]<=Math.max(a[1],b[1]))||(p[1]===a[1]&&a[1]===b[1]&&p[0]>=Math.min(a[0],b[0])&&p[0]<=Math.max(a[0],b[0])));
 const graph=new Map(vertices.map(p=>[p.join(),new Set()]));
 for(const w of wires)for(const [a,b]of w.segments){const ps=vertices.filter(p=>on(p,a,b));for(const p of ps)for(const q of ps)graph.get(p.join()).add(q.join());}
 const connected=(a,b)=>{const pending=[a.join()],seen=new Set();while(pending.length){const p=pending.pop();if(p===b.join())return true;if(seen.has(p))continue;seen.add(p);pending.push(...graph.get(p));}return false;};
 for(const a of terminals)for(const b of terminals)assert.equal(connected(a.point,b.point),a.node===b.node,'physical conductor connectivity differs from electrical node model');
 const source=components.find(c=>c.type==='source');
 const rs=components.filter(c=>c.type==='resistor');
 assert.deepEqual(rs.map(c=>c.resistance),[10,20]);
 assert.deepEqual(rs.map(c=>c.voltage),r.branchVoltages);
 if(mode==='parallel') for(const c of rs) assert.deepEqual(c.nodes,source.nodes);
 else {assert.equal(rs[0].nodes[1],rs[1].nodes[0]); assert.equal(components.filter(c=>c.nodes.includes(rs[0].nodes[1])).length,2);}
 for(const w of wires){
  assert.equal(w.nodes[0],w.nodes[1]); assert.ok(nodes.includes(w.nodes[0]));
  assert.ok(r.svg.includes(`data-wire-id="${w.id}" d="${w.path}"`));
  for(const [a,b] of w.segments) assert.ok(!(a[1]===225&&b[1]===225&&Math.min(a[0],b[0])<335&&Math.max(a[0],b[0])>310),'battery gap crossed');
 }
 for(const c of components){assert.ok(r.svg.includes(`data-component-id="${c.id}"`)); for(const [x,y] of c.terminals) assert.ok(wires.some(w=>w.endpoints.some(p=>p[0]===x&&p[1]===y)),c.id+' unconnected');}
});
test('zero voltage and unsupported parameters',()=>{const r=v.circuit({voltage:0});assert.equal(r.voltage,0);assert.equal(r.totalCurrent,0); for(const i of [{voltage:NaN},{resistances:[0,20]}])assert.throws(()=>v.circuit(i),RangeError);});
for(const [t,wt,wx] of [[0,0,0],[5,5,50],[10,5,50]])test('Newton time '+t,()=>{const r=v.newtonSecondLaw({t,duration:5});assert.equal(r.t,wt);assert.equal(r.position,wx);assert.equal(r.t,r.motion.t);assert.equal(r.position,r.motion.position);assert.equal(r.velocity,r.motion.velocity);});
test('zero force and invalid duration',()=>{const r=v.newtonSecondLaw({appliedForce:0,opposingForce:0,v0:0});assert.equal(r.position,0);assert.equal(r.velocity,0);assert.throws(()=>v.kinematics({duration:0}),RangeError);});
const points=r=>r.svg.match(/class="wave-line" points="([^"]*)"/)[1];
test('fixed wave scale and zero amplitude',()=>{assert.notEqual(points(v.waveModel({amplitude:1})),points(v.waveModel({amplitude:2})));assert.notEqual(points(v.waveModel({speed:20})),points(v.waveModel({speed:40})));const r=v.waveModel({amplitude:0,speed:0});assert.equal(r.amplitude,0);assert.equal(r.speed,0);assert.ok(points(r).split(' ').every(p=>p.split(',')[1]==='140'));assert.ok(!r.svg.includes('NaN'));});
test('auto scaling has units and explicit label',()=>{const r=v.waveModel({scaleMode:'auto'});assert.match(r.svg,/自动缩放/);assert.match(r.svg,/y\/m/);assert.match(r.svg,/x\/m/);});
test('fixed comparison scale accommodates the page amplitude range',()=>{
 const ys=points(v.waveModel({amplitude:5})).split(' ').map(p=>Number(p.split(',')[1]));
 assert.ok(ys.every(y=>y>=68&&y<=212));
 assert.match(v.waveModel({speed:40,frequency:2}).svg,/超出当前显示范围/);
});
test('invalid initial motion parameters are not silently replaced',()=>{
 for(const input of [{x0:NaN},{v0:'invalid'},{a:Infinity}])assert.throws(()=>v.kinematics(input),RangeError);
 assert.throws(()=>v.newtonSecondLaw({v0:'invalid'}),RangeError);
});
