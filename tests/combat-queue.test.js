const assert = require('node:assert/strict');
const q = require('../engine/combat-queue.js');
const original=[
 {type:'monsterTurn',actorId:'ash-1',monsterType:'Ash Raider'},
 {type:'monsterTurn',actorId:'ash-2',monsterType:'Ash Raider'}
];
const created=q.create('monster',original);
original[0].actorId='mutated';
assert.equal(created.events[0].actorId,'ash-1');
const first=q.next(created);
assert.equal(first.event.actorId,'ash-1');
assert.equal(first.queue.index,1);
assert.equal(created.index,0);
const paused=q.pause(first.queue,'damage');
assert.equal(q.next(paused).event,null);
assert.equal(q.next(paused).queue.index,1);
const replay=q.resume(JSON.parse(JSON.stringify(paused)));
const second=q.next(replay);
assert.equal(second.event.actorId,'ash-2');
assert.equal(second.queue.index,2);
assert.equal(q.next(second.queue).done,true);
assert.throws(()=>q.create('monster',[]),/requires events/);
assert.throws(()=>q.create('monster',[{type:'unknown',actorId:'x'}]),/Invalid/);
assert.throws(()=>q.resume(first.queue),/not paused/);
assert.throws(()=>q.pause(paused,'damage'),/already paused/);
const hero=q.create('hero',[{type:'heroAttackContinuation',actorId:'p0',targetId:'e0',action:{which:'top',targetIds:['e0']}}]);
const heroSnapshot=q.next(q.resume(q.pause(hero,'damage')));
assert.equal(heroSnapshot.event.action.which,'top');
assert.deepEqual(heroSnapshot.event.action.targetIds,['e0']);
console.log('Combat event queue assertions passed');
