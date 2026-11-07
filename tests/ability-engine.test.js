const assert=require('node:assert/strict');
const {apply,clearEffects,validTargets,neighbors,distance}=require('../engine/abilities.js');
function state(){return {units:{
 hero:{id:'hero',team:'heroes',q:1,r:1,hp:10,maxHp:10},
 ally:{id:'ally',team:'heroes',q:1,r:2,hp:8,maxHp:10},
 e1:{id:'e1',team:'monsters',q:2,r:1,hp:8,maxHp:8},
 e2:{id:'e2',team:'monsters',q:2,r:2,hp:8,maxHp:8},
 blocker:{id:'blocker',team:'monsters',q:4,r:1,hp:8,maxHp:8}
 },blocked:['0,0'],elements:{}}}
const s=state();
assert.equal(distance(s.units.hero,s.units.e1),1);
assert.equal(neighbors(s.units.e1).length,6);
let result=apply(s,'hero',[
 {type:'shield',value:2,duration:'round'},
 {type:'attack',value:3,range:2,targets:2},
 {type:'heal',value:2,range:2,targets:1}
 ],[{}, {targets:['e1','e2']}, {targets:['ally']}],{modifier:()=>0});
assert.equal(result.state.units.e1.hp,5);
assert.equal(result.state.units.e2.hp,5);
assert.equal(result.state.units.ally.hp,10);
assert.equal(result.state.units.hero.active[0].value,2);
assert.equal(s.units.e1.hp,8,'input must remain immutable');
assert.equal(clearEffects(result.state,'round').units.hero.active.length,0);
assert.equal(result.events.length,4);
assert.throws(()=>apply(s,'hero',[{type:'attack',value:4,targets:2}],[{targets:['e1','e1']}]),/unique/);
assert.throws(()=>apply(s,'hero',[{type:'attack',value:4,range:1}],[{targets:['blocker']}]),/Invalid target/);
assert.throws(()=>apply(s,'hero',[{type:'attack',value:4}],[{targets:['ally']}]),/Invalid target/);
assert.throws(()=>apply(s,'hero',[{type:'attack',value:4}],[{targets:[]}]),/No target/);
result=apply(s,'hero',[{type:'attack',value:4,range:1}],[{targets:['e1']}],{modifier:()=>-1});
assert.equal(result.state.units.e1.hp,5);
let defended=state();
defended.units.e1.active=[{type:'shield',value:2,duration:'round'},{type:'retaliate',value:2,range:1,duration:'round'}];
result=apply(defended,'hero',[{type:'attack',value:4,range:1}],[{targets:['e1']}]);
assert.equal(result.state.units.e1.hp,6,'shield reduces attack damage');
assert.equal(result.state.units.hero.hp,8,'retaliate damages living attacker without shield');
defended.units.e1.hp=2;
result=apply(defended,'hero',[{type:'attack',value:4,range:1}],[{targets:['e1']}]);
assert.equal(result.state.units.hero.hp,10,'dead defender cannot retaliate');
let movement=state();movement.units.e2.hp=0; // removes interfering occupied tile
result=apply(movement,'hero',[{type:'push',value:2,range:2}],[{targets:['e1'],paths:{e1:[{q:3,r:1},{q:4,r:2}]}}]);
assert.deepEqual([result.state.units.e1.q,result.state.units.e1.r],[4,2]);
assert.throws(()=>apply(movement,'hero',[{type:'pull',value:1,range:2}],[{targets:['e1'],paths:{e1:[{q:3,r:1}]}}]),/decrease/);
assert.throws(()=>apply(movement,'hero',[{type:'push',value:1,range:2}],[{targets:['e1'],paths:{e1:[{q:3,r:1},{q:4,r:2}]}}]),/exceeded/);
result=apply(s,'hero',[{type:'infuse',element:'fire'},{type:'condition',condition:'wound',range:2}],[{}, {targets:['e1']}]);
assert.equal(result.state.elements.fire,2);
assert.equal(result.state.units.e1.conditions.wound,true);
// Linked attack timing: damage -> push/pull/condition -> retaliation.
let linked=state();
linked.units.e1.active=[{type:'retaliate',value:3,range:1,duration:'round'}];
let sequence=apply(linked,'hero',[
 {type:'attack',value:1,range:1,after:[{type:'push',value:1},{type:'condition',condition:'wound'}]}
],[{targets:['e1'],after:{e1:[{path:[{q:3,r:1}]},{}]}}]);
assert.deepEqual(sequence.events.map(e=>e.type),['attack','push','condition']);
assert.equal(sequence.state.units.hero.hp,10,'retaliate out of range after push does not occur');
assert.equal(sequence.state.units.e1.q,3);
assert.equal(sequence.state.units.e1.conditions.wound,true);
assert.equal(sequence.state.units.e1.hp,7);
sequence=apply(linked,'hero',[
 {type:'attack',value:1,range:1,after:[{type:'condition',condition:'poison'}]}
],[{targets:['e1']}]);
assert.deepEqual(sequence.events.map(e=>e.type),['attack','condition','retaliate']);
assert.equal(sequence.state.units.hero.hp,7);
let killed=state();killed.units.e1.hp=2;killed.units.e1.active=[{type:'retaliate',value:3,range:1,duration:'round'}];
sequence=apply(killed,'hero',[{type:'attack',value:3,range:1,after:[{type:'push',value:1}]}],[{targets:['e1']}]);
assert.deepEqual(sequence.events.map(e=>e.type),['attack'],'dead target has no linked effects or retaliation');
assert.throws(()=>apply(linked,'hero',[{type:'attack',value:1,range:1,after:[{type:'push',value:1}]}],
 [{targets:['e1'],after:{e1:[{path:[{q:1,r:1}]}]}}]),/occupied|increase|adjacent/);
let stacked=state();stacked.units.e1.active=[{type:'retaliate',value:2,range:1,duration:'round'}];stacked.units.e2.active=[{type:'retaliate',value:2,range:1,duration:'round'}];
sequence=apply(stacked,'hero',[{type:'attack',value:1,range:2,targets:2,after:[{type:'condition',condition:'wound'}]}],
 [{targets:['e1','e2']}]);
assert.deepEqual(sequence.events.map(e=>e.type),['attack','condition','retaliate','attack','condition','retaliate']);
assert.equal(sequence.state.units.hero.hp,6);
// An area pattern is expressed as axial offsets from an odd-row hex anchor.
const splash=apply(state(),'hero',[{type:'areaAttack',value:2,range:2,area:[{q:0,r:0},{q:-1,r:1}]}],[{anchor:{q:2,r:1}}]);
assert.equal(splash.state.units.e1.hp,6);
assert.equal(splash.state.units.e2.hp,6);
assert.equal(splash.events.filter(e=>e.type==='attack').length,2);
assert.throws(()=>apply(state(),'hero',[{type:'areaAttack',value:2,range:1,area:[{q:0,r:0}]}],[{anchor:{q:7,r:7}}]),/beyond range/);
assert.throws(()=>apply(state(),'hero',[{type:'areaAttack',value:2,range:2,area:[]}],[{anchor:{q:2,r:1}}]),/shape/);
console.log('F2 ability interpreter conformance assertions passed');
const abilities=require('../engine/abilities.js');
const shape=abilities.areaHexes({q:2,r:4},[{q:0,r:0},{q:1,r:-1}]);
assert.deepEqual(shape,[{q:2,r:4},{q:2,r:3}],'odd-row coordinates from axial offsets');
const planned=abilities.beginSequence(state(),'hero',[
 {type:'shield',value:1,duration:'round'},
 {type:'attack',value:2,range:2,targets:2},
 {type:'heal',value:1,range:2}
]);
let cursor=abilities.resumeSequence(planned);
assert.equal(cursor.cursor.index,1);
const paused=abilities.resumeSequence(cursor);
assert.equal(paused.awaiting.type,'attack');
assert.equal(paused.cursor.index,1,'missing choice must not advance cursor');
cursor=abilities.resumeSequence(JSON.parse(JSON.stringify(paused)),{targets:['e1','e2']});
assert.equal(cursor.cursor.index,2);
assert.equal(cursor.state.units.e1.hp,6);
cursor=abilities.resumeSequence(JSON.parse(JSON.stringify(cursor)),{targets:['ally']});
assert.equal(cursor.done,true);
assert.equal(cursor.cursor,null);
assert.deepEqual(cursor.events.map(e=>e.type),['shield','attack','attack','heal']);
assert.equal(cursor.state.units.ally.hp,9);
assert.equal(planned.state.units.e1.hp,8,'serialized pipeline must not mutate original state');
assert.throws(()=>abilities.resumeSequence(paused,{targets:['ally']}),/Invalid target/);
