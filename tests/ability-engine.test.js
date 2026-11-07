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
assert.throws(()=>apply(s,'hero',[{type:'attack',value:1,after:[{type:'push',value:1}]}],[{targets:['e1']}]),/pending-hit/);
console.log('F2 ability interpreter conformance assertions passed');