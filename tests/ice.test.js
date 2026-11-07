const assert=require('node:assert/strict');
const {slide}=require('../engine/ice.js');
const from={q:0,r:4},entry={q:1,r:4},ice=[[1,4],[2,4],[3,4]];
const free=p=>p.q>=0&&p.q<8&&p.r>=0&&p.r<6;
assert.deepEqual(slide(from,entry,{icy:ice,canEnter:free}),[{q:2,r:4},{q:3,r:4},{q:4,r:4}],
 'chain through icy hexes and leave ice one free additional hex');
assert.deepEqual(slide(from,entry,{icy:ice,canEnter:p=>free(p)&&p.q<3}),[{q:2,r:4}],
 'stop when a wall, obstacle or occupied hex blocks next slide');
assert.deepEqual(slide(from,entry,{icy:ice,canEnter:free,mode:'jump'}),[]);
assert.deepEqual(slide(from,entry,{icy:ice,canEnter:free,mode:'fly'}),[]);
assert.deepEqual(slide(from,entry,{icy:ice,canEnter:free,mode:'teleport'}),[]);
assert.deepEqual(slide(from,entry,{icy:ice,canEnter:free,mode:'forced'}),
 [{q:2,r:4},{q:3,r:4},{q:4,r:4}], 'forced movement inherits sliding');
assert.deepEqual(slide(from,entry,{icy:[],canEnter:free}),[]);
assert.deepEqual(slide({q:1,r:3},{q:2,r:4},{icy:[[2,4]],canEnter:free}),
 [{q:2,r:5}], 'odd-row offset hex direction stays consistent');
assert.throws(()=>slide({q:0,r:0},{q:3,r:0},{icy:ice,canEnter:free}),/adjacent/);
console.log('Icy sliding assertions passed');
