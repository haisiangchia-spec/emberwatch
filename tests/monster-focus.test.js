const assert=require('node:assert/strict');
const {choose}=require('../engine/monster-focus.js');
const candidates=[
 {targetId:'p2',cost:3,distance:2,initiative:20,seat:2,row:2,col:4},
 {targetId:'p0',cost:2,distance:3,initiative:70,seat:0,row:3,col:2},
 {targetId:'p1',cost:2,distance:2,initiative:15,seat:1,row:2,col:3}
];
const result=choose(candidates);
assert.equal(result.chosen.targetId,'p1','lowest movement cost, then distance');
assert.equal(result.ranking[1].targetId,'p0');
assert.equal(candidates[0].targetId,'p2','input unchanged');
const tied=[
 {targetId:'p1',cost:1,distance:2,initiative:20,seat:1,row:2,col:1},
 {targetId:'p0',cost:1,distance:2,initiative:20,seat:0,row:3,col:2},
 {targetId:'p2',cost:1,distance:2,initiative:19,seat:2,row:5,col:5}
];
assert.equal(choose(tied).chosen.targetId,'p2','initiative before seat');
tied[2].initiative=20;
assert.equal(choose(tied).chosen.targetId,'p0','seat tie breaker');
assert.deepEqual(choose([]),{chosen:null,ranking:[]});
assert.deepEqual(choose(JSON.parse(JSON.stringify(tied))).ranking,choose(tied).ranking);
assert.throws(()=>choose(null),/array/);
assert.throws(()=>choose([{targetId:'p0',cost:-2,distance:0,initiative:1,seat:0,row:1,col:1}]),/Invalid/);
console.log('Monster focus decision assertions passed');
const negativeChoices=[
 {targetId:'near-trap',negative:1,cost:1,distance:1,initiative:1,seat:0,row:1,col:1},
 {targetId:'far-safe',negative:0,cost:8,distance:5,initiative:80,seat:1,row:3,col:4},
 {targetId:'far-danger',negative:2,cost:1,distance:1,initiative:1,seat:2,row:2,col:2}
];
assert.equal(choose(negativeChoices).chosen.targetId,'far-safe',
 'zero negative terrain precedes shortest movement and target proximity');
assert.equal(choose(negativeChoices).ranking[2].targetId,'far-danger');
assert.throws(()=>choose([{...negativeChoices[0],negative:-1}]),/Invalid/);
console.log('Monster negative-hex priority assertions passed');

const {rangedRetreat}=require('../engine/monster-focus.js');
const baseRetreat={origin:{distance:1},focus:{id:'p0'},range:3,move:3,
 candidates:[
  {q:2,r:1,cost:2,negative:0,distance:2,lineOfSight:true,occupied:false},
  {q:1,r:2,cost:1,negative:0,distance:2,lineOfSight:true,occupied:false},
  {q:3,r:1,cost:1,negative:1,distance:2,lineOfSight:true,occupied:false},
  {q:1,r:3,cost:1,negative:0,distance:2,lineOfSight:true,occupied:true}
 ]};
assert.deepEqual(rangedRetreat(baseRetreat),{q:1,r:2,cost:1},
  'retreat to minimum-movement safe unoccupied hex');
assert.deepEqual(rangedRetreat({...baseRetreat,muddled:true}),null,
  'already muddled monster does not reposition to escape disadvantage');
assert.deepEqual(rangedRetreat({...baseRetreat,muddled:true,strengthened:true}),
  {q:1,r:2,cost:1},'strengthen counteracts muddle');
assert.equal(rangedRetreat({...baseRetreat,origin:{distance:2}}),null,
  'do not change position if already not adjacent to focus');
assert.equal(rangedRetreat({...baseRetreat,move:0}),null);
assert.equal(rangedRetreat({...baseRetreat,range:1}),null);
assert.equal(rangedRetreat({...baseRetreat,candidates:baseRetreat.candidates.map(x=>({...x,negative:1}))}),null,
  'must not move across negative terrain just to avoid disadvantage');
assert.equal(rangedRetreat({...baseRetreat,candidates:baseRetreat.candidates.map(x=>({...x,lineOfSight:false}))}),null);
assert.throws(()=>rangedRetreat({...baseRetreat,candidates:null}),/Invalid/);
console.log('Ranged monster retreat assertions passed');

const {multiTargetPosition}=require('../engine/monster-focus.js');
const multiFixtures=[
 {q:0,r:0,cost:0,negative:0,occupied:false,targets:[
   {id:'p0',seat:0,disadvantaged:true}]},
 {q:1,r:0,cost:1,negative:0,occupied:false,targets:[
   {id:'p0',seat:0,disadvantaged:false},
   {id:'p1',seat:1,disadvantaged:false}]},
 {q:2,r:0,cost:2,negative:0,occupied:false,targets:[
   {id:'p0',seat:0,disadvantaged:false},
   {id:'p1',seat:1,disadvantaged:false},
   {id:'p2',seat:2,disadvantaged:true}]},
 {q:3,r:0,cost:1,negative:1,occupied:false,targets:[
   {id:'p0',seat:0,disadvantaged:false},
   {id:'p1',seat:1,disadvantaged:false},
   {id:'p2',seat:2,disadvantaged:false}]},
 {q:4,r:0,cost:1,negative:0,occupied:false,targets:[
   {id:'p1',seat:1,disadvantaged:false},
   {id:'p2',seat:2,disadvantaged:false}]}
];
let chosen=multiTargetPosition({focusId:'p0',maxTargets:2,move:2,candidates:multiFixtures});
assert.deepEqual(chosen,{q:1,r:0,cost:1,negative:0,targets:['p0','p1'],count:2,disadvantage:0},
 'prioritize safe max targets and zero disadvantage with minimum movement');
chosen=multiTargetPosition({focusId:'p0',maxTargets:3,move:2,candidates:multiFixtures});
assert.deepEqual(chosen.targets,['p0','p1','p2'],
 'max additional targets before disadvantage');
assert.equal(chosen.q,2);
chosen=multiTargetPosition({focusId:'p0',maxTargets:3,move:1,candidates:multiFixtures});
assert.equal(chosen.q,1,'only reachable positions this turn');
chosen=multiTargetPosition({focusId:'p0',maxTargets:2,move:0,candidates:multiFixtures});
assert.equal(chosen.q,0,'stationary attack when out of movement');
assert.equal(multiTargetPosition({focusId:'unreachable',maxTargets:2,move:2,candidates:multiFixtures}),null);
assert.equal(multiTargetPosition({focusId:'p0',maxTargets:2,move:2,candidates:
 multiFixtures.map(x=>({...x,occupied:true}))}),null);
assert.throws(()=>multiTargetPosition({focusId:'p0',maxTargets:1,move:2,candidates:[]}),/Invalid/);
console.log('Multi-target movement ranking assertions passed');
