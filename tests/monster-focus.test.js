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