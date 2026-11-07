const assert=require('node:assert/strict');
const {choose}=require('../engine/reactive-route.js');
const fixtures=[
 {q:3,r:1,cost:3,negative:0,focusId:'p0',attackable:true},
 {q:4,r:1,cost:2,negative:0,focusId:'p0',attackable:true},
 {q:2,r:2,cost:1,negative:1,focusId:'p0',attackable:true},
 {q:5,r:2,cost:1,negative:0,focusId:'p1',attackable:true},
 {q:6,r:2,cost:1,negative:0,focusId:'p0',attackable:true,occupied:true}
];
assert.equal(choose({goal:{q:3,r:1},focusId:'p0',candidates:fixtures}).q,3,
 'retain committed goal if still legal');
assert.equal(choose({goal:{q:9,r:9},focusId:'p0',candidates:fixtures}).q,4,
 'reroute to cheapest safe attack hex for existing focus');
assert.equal(choose({goal:{q:9,r:9},focusId:'p0',candidates:fixtures.slice(2)}).q,2,
 'dangerous path may be last resort if no safe option');
assert.equal(choose({goal:{q:9,r:9},focusId:'p0',candidates:fixtures.slice(3)}),null,
 'do not retarget a different player');
assert.equal(choose({goal:{q:9,r:9},focusId:'p0',candidates:[]}),null);
const tied=[{q:2,r:2,cost:1,negative:0,focusId:'p0',attackable:true},
 {q:3,r:2,cost:1,negative:0,focusId:'p0',attackable:true}];
assert.equal(choose({focusId:'p0',candidates:tied,random:()=>0}).q,2);
assert.equal(choose({focusId:'p0',candidates:tied,random:()=>0.999}).q,3);
assert.throws(()=>choose({focusId:'p0',candidates:tied,random:()=>1}),/Invalid random/);
console.log('Reactive route choice assertions passed');
