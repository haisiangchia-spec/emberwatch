const assert=require('node:assert/strict');
const {enter,damageAt}=require('../engine/terrain.js');
const sample=()=>({
 scenarioLevel:3,
 units:{monster:{id:'monster',hp:12,conditions:{}},flying:{id:'flying',hp:12,flying:true,conditions:{}}},
 traps:[[1,2],{q:2,r:2,damage:2,conditions:['wound']}],
 hazardous:[[3,2]]
});
assert.equal(damageAt(0,'trap'),2);
assert.equal(damageAt(3,'trap'),5);
assert.equal(damageAt(3,'hazardous'),2);
assert.equal(damageAt(7,'hazardous'),4);
let result=enter(sample(),'monster',{q:1,r:2});
assert.equal(result.state.units.monster.hp,7);
assert.deepEqual(result.state.traps,[{q:2,r:2,damage:2,conditions:['wound']}]);
assert.deepEqual(result.effects.map(e=>e.type),['trap']);
result=enter(result.state,'monster',{q:3,r:2});
assert.equal(result.state.units.monster.hp,5);
assert.deepEqual(result.state.hazardous,[[3,2]],'hazardous terrain remains');
result=enter(result.state,'monster',{q:3,r:2});
assert.equal(result.state.units.monster.hp,3,'re-entry triggers hazardous again');
result=enter(sample(),'monster',{q:2,r:2});
assert.equal(result.state.units.monster.hp,10);
assert.equal(result.state.units.monster.conditions.wound,true);
assert.deepEqual(result.effects.map(e=>e.type),['trap','condition']);
const original=sample();
result=enter(original,'flying',{q:1,r:2});
assert.equal(result.state.units.flying.hp,12);
assert.equal(result.state.traps.length,2);
result=enter(original,'monster',{q:1,r:2},{jump:true});
assert.equal(result.state.units.monster.hp,12);
result=enter(original,'monster',{q:1,r:2},{jump:true,endJump:true});
assert.equal(result.state.units.monster.hp,7);
assert.equal(original.units.monster.hp,12,'pure calculation leaves original unchanged');
result=enter({...sample(),units:{monster:{hp:1,conditions:{}}}},'monster',{q:1,r:2});
assert.equal(result.state.units.monster.hp,0,'damage cannot reduce HP below zero');
assert.throws(()=>damageAt(8,'trap'),/Invalid scenario level/);
assert.throws(()=>enter(sample(),'monster',{q:1.5,r:2}),/Invalid terrain entry/);
console.log('Terrain entry conformance assertions passed');
