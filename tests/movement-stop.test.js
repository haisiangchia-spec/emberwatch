const assert=require('node:assert/strict');
const {choose}=require('../engine/movement-stop.js');
const h=(q,r,slide=false)=>({q,r,...(slide?{slide:true}:{})});
assert.deepEqual(choose([h(0,0),h(1,0),h(2,0,true),h(3,0,true)],1),
 {stop:{q:3,r:0},spent:1},
 'never stop at ice entry or inside an unblocked slide chain');
assert.deepEqual(choose([h(0,0),h(1,0),h(2,0,true),h(3,0,true),h(4,0)],1),
 {stop:{q:3,r:0},spent:1},'cannot afford next paid step');
assert.deepEqual(choose([h(0,0),h(1,0),h(2,0,true),h(3,0,true),h(4,0)],2),
 {stop:{q:4,r:0},spent:2});
assert.deepEqual(choose([h(0,0),h(1,0),h(2,0,true)],1,{occupied:(q,r)=>q===2}),
 {stop:{q:0,r:0},spent:0},
 'cannot stop on occupied slide landing, and cannot illegally stop midway');
assert.deepEqual(choose([h(0,0),h(1,0),h(2,0)],2,{occupied:(q)=>q===1}),
 {stop:{q:2,r:0},spent:2},'can pass an ally and stop on an empty hex');
assert.deepEqual(choose([h(0,0),h(1,0),h(2,0)],2,{difficult:q=>q===1}),
 {stop:{q:1,r:0},spent:2},'difficult terrain consumes two points');
assert.deepEqual(choose([h(0,0),h(1,0),h(2,0,true)],0),
 {stop:{q:0,r:0},spent:0});
assert.throws(()=>choose([],1),/Invalid/);
console.log('Monster path endpoint assertions passed');
