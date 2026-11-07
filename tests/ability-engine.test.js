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

const oldMonster=abilities.monsterSteps({move:2,attack:2,range:1},{move:1,attack:1,range:0,condition:'wound'});
assert.deepEqual(oldMonster,[{type:'move',value:3},{type:'attack',value:3,range:1,condition:'wound'}]);
const scriptedMonster=abilities.monsterSteps({move:2,attack:2,range:1},{
 move:-99,attack:-99,abilities:[{type:'move',value:3},{type:'attack',value:3,range:1,condition:'wound'}]
});
assert.deepEqual(scriptedMonster,oldMonster);
const monsterScene={units:{ash:{id:'ash',team:'monsters',q:1,r:1,hp:6,maxHp:6},
 hero:{id:'hero',team:'heroes',q:2,r:1,hp:10,maxHp:10}}};
const monsterQueue=abilities.beginSequence(monsterScene,'ash',scriptedMonster);
const monsterMove=abilities.resumeSequence(monsterQueue,{path:[]});
assert.equal(monsterMove.cursor.index,1);
const monsterAttack=abilities.resumeSequence(monsterMove,{targets:['hero']});
assert.equal(monsterAttack.state.units.hero.hp,7);
assert.equal(monsterAttack.done,true);

const calculate=abilities.hitDamage;
assert.deepEqual(calculate({power:5,guard:2,shield:1,poison:true}),{raw:6,guard:2,shield:1,damage:3});
assert.equal(calculate({power:2,guard:5,shield:3}).damage,0);
assert.equal(calculate({power:0,poison:true}).damage,1);
assert.throws(()=>calculate({power:-1}),/negative/);
assert.throws(()=>calculate({power:Infinity}),/finite/);
const retaliationOrigin={q:1,r:1,hp:10,active:[{type:'retaliate',value:2,range:1},{type:'retaliate',value:1,range:1}]};
assert.equal(abilities.retaliation(retaliationOrigin,{q:2,r:1,hp:6}),3);
assert.equal(abilities.retaliation(retaliationOrigin,{q:3,r:1,hp:6}),0);
assert.equal(abilities.retaliation({...retaliationOrigin,hp:0},{q:2,r:1,hp:6}),0);

assert.equal(calculate({power:0,poison:true,miss:true}).damage,0,'null hit overrides poison');
assert.equal(calculate({power:6,poison:true,shield:2,miss:true}).damage,0);


const optionalScene=state();
const optionalSteps=[
 {type:'shield',value:2,duration:'round',optional:true},
 {type:'heal',value:3,range:2,optional:true},
 {type:'attack',value:2,range:2,optional:true}
];
let opt=abilities.beginSequence(optionalScene,'hero',optionalSteps);
const optWait=abilities.resumeSequence(opt);
assert.equal(optWait.awaiting.optional,true,'optional automatic effect requires an explicit decision');
assert.equal(optWait.cursor.index,0);
assert.deepEqual(optWait.state,optionalScene);
const serialized=JSON.parse(JSON.stringify(optWait));
opt=abilities.resumeSequence(serialized,{skip:true});
assert.equal(opt.cursor.index,1);
assert.equal(opt.state.units.hero.active,undefined);
assert.deepEqual(opt.events,[{type:'skipped',stepIndex:0}]);
const healWait=abilities.resumeSequence(JSON.parse(JSON.stringify(opt)));
assert.equal(healWait.awaiting.type,'heal');
assert.equal(healWait.awaiting.optional,true);
opt=abilities.resumeSequence(healWait,{targets:['ally']});
assert.equal(opt.cursor.index,2);
assert.equal(opt.state.units.ally.hp,10,'healing caps at max HP');
const attackWait=abilities.resumeSequence(JSON.parse(JSON.stringify(opt)));
assert.equal(attackWait.awaiting.type,'attack');
opt=abilities.resumeSequence(attackWait,{skip:true});
assert.equal(opt.done,true);
assert.equal(opt.cursor,null);
assert.deepEqual(opt.events.map(x=>x.type),['skipped','heal','skipped']);
assert.equal(opt.state.units.e1.hp,8,'skipped attack never draws or changes target');
assert.equal(abilities.healAmount({hp:8,maxHp:10},5),2);
assert.equal(abilities.healAmount({hp:10,maxHp:10},3),0);
assert.throws(()=>abilities.healAmount({hp:8,maxHp:10},-1),/Invalid heal/);
assert.throws(()=>abilities.healAmount({hp:8,maxHp:10},NaN),/Invalid heal/);
console.log('F2 optional-step checkpoint and healing conformance assertions passed');


const linkedSteps=abilities.linkedAttackSteps({
 condition:'poison',followupType:'pull',asBasic:false
});
assert.deepEqual(linkedSteps,[{type:'condition',condition:'poison'},
 {type:'pull',value:1}],'linked instructions preserve condition before forced displacement');
assert.deepEqual(abilities.linkedAttackSteps({condition:'muddle',asBasic:true}),
 [{type:'condition',condition:'muddle'}]);
assert.deepEqual(abilities.linkedAttackSteps({followupType:'push',asBasic:true}),[]);
assert.throws(()=>abilities.linkedAttackSteps({followupType:'teleport'}),/Unsupported linked movement/);
assert.deepEqual(JSON.parse(JSON.stringify(linkedSteps)),linkedSteps);
console.log('F2 ordered attack-linked step assertions passed');


const optionalCandidatesScene=state();
assert.deepEqual(
 abilities.optionalTargetIds(optionalCandidatesScene,'hero',
   {type:'heal',value:2,range:2}).sort(),
 ['ally','hero']);
assert.deepEqual(
 abilities.optionalTargetIds(optionalCandidatesScene,'hero',
   {type:'condition',condition:'muddle',range:1}),
 ['e1','e2']);
const obscured=state();obscured.lineOfSight={'hero>e1':false,'hero>e2':true};
assert.deepEqual(abilities.optionalTargetIds(obscured,'hero',
 {type:'condition',condition:'muddle',range:2}),['e2']);
assert.throws(()=>abilities.optionalTargetIds(optionalCandidatesScene,'hero',
 {type:'shield',value:1}),/Unsupported optional targeting/);
assert.throws(()=>abilities.optionalTargetIds(optionalCandidatesScene,'hero',
 {type:'heal',range:-1}),/Invalid optional ability range/);
console.log('F2 shared optional target eligibility assertions passed');


const sequenceAction={kind:'guard',value:5,which:'bottom',cardIndex:2,asBasic:false};
const sequenceEvents=abilities.compileHeroQueue('p3',sequenceAction,[
 {type:'guard',value:'action'},
 {type:'shield',value:2,duration:'round'},
 {type:'heal',value:2,range:3,optional:true},
 {type:'condition',condition:'muddle',range:2,optional:true}
]);
assert.deepEqual(sequenceEvents.map(e=>e.type),[
 'heroGuard','heroAbilityEffect','heroAbilityEffect','heroAbilityEffect','heroActionComplete']);
assert.equal(sequenceEvents[0].value,5);
assert.equal(sequenceEvents[2].effect.optional,true);
assert.equal(sequenceEvents[3].effect.condition,'muddle');
assert.deepEqual(JSON.parse(JSON.stringify(sequenceEvents)),sequenceEvents);
assert.equal(sequenceEvents[4].action.cardIndex,2);
assert.throws(()=>abilities.compileHeroQueue('p3',sequenceAction,[
 {type:'teleport',value:1}]),/Unsupported hero instruction/);
assert.throws(()=>abilities.compileHeroQueue('p3',sequenceAction,[
 {type:'heal',value:2,range:2}]),/selected target/);
const selectedHeal=abilities.compileHeroQueue('p3',
 {kind:'heal',value:4,which:'top',cardIndex:1,asBasic:false},[
 {type:'heal',value:'action',range:3}
],{targetId:'p2'});
assert.deepEqual(selectedHeal.map(e=>e.type),['heroAbilityEffect','heroActionComplete']);
assert.equal(selectedHeal[0].targetId,'p2');
assert.equal(selectedHeal[0].effect.value,4);
assert.equal(selectedHeal[0].effect.range,3);
assert.deepEqual(JSON.parse(JSON.stringify(selectedHeal)),selectedHeal);
assert.throws(()=>abilities.compileHeroQueue('p3',sequenceAction,[
 {type:'guard',value:'missing'}]),/Invalid Guard/);
assert.throws(()=>abilities.compileHeroQueue('p3',sequenceAction,[
 {type:'guard',value:1,optional:true}]),/Guard cannot be optional/);
console.log('F2 structured hero card queue compilation conformance assertions passed');


const attackAction={kind:'attack',value:4,range:1,which:'top',
 cardIndex:2,asBasic:false,condition:'disarm',followupType:'push'};
const compiledAttack=abilities.compileHeroQueue('p0',attackAction,
 [{type:'attack',value:'action',range:1}],{targetId:'e0'});
assert.deepEqual(compiledAttack.map(e=>e.type),[
 'heroAttackHit','heroAttackLinked','heroAttackLinked','heroAttackPostHit']);
assert.deepEqual(compiledAttack.slice(1,3).map(e=>e.step.type),['condition','push']);
assert(compiledAttack.every(e=>e.actorId==='p0'&&e.targetId==='e0'));
assert.equal(compiledAttack[0].action.value,4);
assert.deepEqual(JSON.parse(JSON.stringify(compiledAttack)),compiledAttack);
assert.deepEqual(abilities.compileHeroQueue('p0',{...attackAction,asBasic:true,
 condition:null,followupType:null},
 [{type:'attack',value:2,range:1}],{targetId:'e0'}).map(e=>e.type),
 ['heroAttackHit','heroAttackPostHit']);
assert.throws(()=>abilities.compileHeroQueue('p0',attackAction,
 [{type:'attack',value:4}]),/Attack requires selected target/);
assert.throws(()=>abilities.compileHeroQueue('p0',attackAction,
 [{type:'attack',value:4,optional:true}],{targetId:'e0'}),/Optional attack selection/);
assert.throws(()=>abilities.compileHeroQueue('p0',attackAction,
 [{type:'attack',value:4},{type:'move',value:1}],{targetId:'e0'}),
 /Move must precede supported post-move effects/);
assert.throws(()=>abilities.compileHeroQueue('p0',attackAction,
 [{type:'attack',value:-1}],{targetId:'e0'}),/Invalid Attack/);
console.log('F2 hero attack compiler and legacy continuation compatibility assertions passed');


const deferredMixed=abilities.compileHeroQueue('p1',{
 kind:'guard',value:2,which:'bottom',cardIndex:5,asBasic:false
},[
 {type:'guard',value:'action'},
 {type:'heal',value:1,range:2}
],{deferTargets:true});
assert.deepEqual(deferredMixed.map(e=>e.type),
 ['heroGuard','heroAbilityEffect','heroActionComplete']);
assert.equal(deferredMixed[1].needsTarget,true);
assert.equal(deferredMixed[1].effect.optional,undefined);
assert.deepEqual(JSON.parse(JSON.stringify(deferredMixed)),deferredMixed);
assert.throws(()=>abilities.compileHeroQueue('p1',{
 kind:'guard',value:2
},[{type:'guard',value:2},{type:'heal',value:1,range:2}]),
 /Mandatory targeted effects require selected target/);
console.log('F2 deferred mandatory target compiler assertions passed');


const mixedAttack=abilities.compileHeroQueue('p0',{
 kind:'attack',value:3,range:1,which:'top',cardIndex:0,asBasic:false,
 condition:'immobilize'
},[
 {type:'shield',value:1,duration:'round'},
 {type:'attack',value:'action',range:1}
],{targetId:'e0'});
assert.deepEqual(mixedAttack.map(e=>e.type),[
 'heroAbilityEffect','heroAttackHit','heroAttackLinked','heroAttackPostHit']);
assert.equal(mixedAttack[0].effect.value,1);
assert.equal(mixedAttack[1].action.value,3);
assert.equal(mixedAttack[2].step.condition,'immobilize');
assert.deepEqual(JSON.parse(JSON.stringify(mixedAttack)),mixedAttack);
assert.throws(()=>abilities.compileHeroQueue('p0',attackAction,[
 {type:'shield',value:1,optional:true},{type:'attack',value:3}
],{targetId:'e0'}),/Only one attack/);
assert.throws(()=>abilities.compileHeroQueue('p0',attackAction,[
 {type:'shield',value:Infinity},{type:'attack',value:3}
],{targetId:'e0'}),/Invalid pre-attack effect/);
console.log('F2 mixed ordered pre-attack effects and terminal hit conformance passed');


const postHit=abilities.compileHeroQueue('p0',{
 kind:'attack',value:5,range:1,which:'top',cardIndex:5,asBasic:false
},[
 {type:'attack',value:'action',range:1},
 {type:'shield',value:1,duration:'round',optional:true},
 {type:'heal',value:2,range:2,optional:true}
],{targetId:'e0',deferTargets:true});
assert.deepEqual(postHit.map(e=>e.type),
 ['heroAttackHit','heroAttackPostHit']);
assert.deepEqual(postHit[0].action.postAttackSteps,[
 {type:'shield',value:1,duration:'round',optional:true},
 {type:'heal',value:2,range:2,optional:true}
]);
assert.deepEqual(postHit[1].action.postAttackSteps,
 postHit[0].action.postAttackSteps);
const compiledTail=abilities.compileHeroQueue('p0',postHit[0].action,
 postHit[0].action.postAttackSteps,{deferTargets:true});
assert.deepEqual(compiledTail.map(e=>e.type),[
 'heroAbilityEffect','heroAbilityEffect','heroActionComplete']);
assert.deepEqual(JSON.parse(JSON.stringify(compiledTail)),compiledTail);
const repeatedAttacks=abilities.compileHeroQueue('p0',attackAction,[
 {type:'attack',value:'action',range:1},
 {type:'attack',value:2,range:2},
 {type:'shield',value:1,duration:'round',optional:true}
],{targetId:'e0'});
assert.deepEqual(repeatedAttacks.map(e=>e.type),[
 'heroAttackHit','heroAttackLinked','heroAttackLinked','heroAttackPostHit']);
assert.deepEqual(repeatedAttacks[0].action.postAttackSteps,[
 {type:'attack',value:2,range:2},
 {type:'shield',value:1,duration:'round',optional:true}
]);
assert.deepEqual(JSON.parse(JSON.stringify(repeatedAttacks)),repeatedAttacks);
assert.throws(()=>abilities.compileHeroQueue('p0',attackAction,[
 {type:'attack',value:4,range:1},{type:'attack',value:2}
],{targetId:'e0'}),/Invalid repeated Attack/);
assert.throws(()=>abilities.compileHeroQueue('p0',attackAction,[
 {type:'attack',value:4,range:1},{type:'shield',value:1},
 {type:'attack',value:2,range:1}
],{targetId:'e0'}),/Repeated attacks must be consecutive/);
assert.throws(()=>abilities.compileHeroQueue('p0',attackAction,[
 {type:'attack',value:4,range:1},{type:'attack',value:2,range:1},
 {type:'attack',value:2,range:1},{type:'attack',value:2,range:1}
],{targetId:'e0'}),/Repeated attacks must be consecutive/);
assert.throws(()=>abilities.compileHeroQueue('p0',attackAction,[
 {type:'attack',value:4},{type:'heal',value:2}
],{targetId:'e0'}),/Post-attack mandatory targets require deferred targeting/);
assert.throws(()=>abilities.compileHeroQueue('p0',attackAction,[
 {type:'attack',value:4},{type:'retaliate',value:-1}
],{targetId:'e0'}),/Invalid post-attack effect/);
console.log('F2 post-hit saved suffix compilation and replay safety assertions passed');


const moveAction={kind:'move',value:4,movementMode:'walk',
 which:'bottom',cardIndex:3,asBasic:false};
const moveEvents=abilities.compileHeroQueue('p0',moveAction,[
 {type:'move',value:'action'},
 {type:'shield',value:1,duration:'round',optional:true}
],{movePath:[{q:0,r:3},{q:0,r:2}],destination:{q:0,r:2}});
assert.deepEqual(moveEvents.map(e=>e.type),[
 'heroMoveStep','heroMoveStep','heroAbilityEffect','heroActionComplete']);
assert.equal(moveEvents[0].finalStep,false);
assert.equal(moveEvents[1].finalStep,true);
assert.equal(moveEvents[2].effect.optional,true);
assert.deepEqual(JSON.parse(JSON.stringify(moveEvents)),moveEvents);
assert.deepEqual(abilities.compileHeroQueue('p0',moveAction,
 [{type:'move',value:'action'}],{
 movePath:[{q:0,r:3}],destination:{q:0,r:3}
}).map(e=>e.type),['heroMoveStep','heroActionComplete']);
assert.throws(()=>abilities.compileHeroQueue('p0',moveAction,
 [{type:'move',value:'action'}]),/planned route/);
assert.throws(()=>abilities.compileHeroQueue('p0',moveAction,
 [{type:'move',value:'action'}],{
 movePath:[{q:0,r:3}],destination:{q:2,r:3}
}),/end at destination/);
assert.throws(()=>abilities.compileHeroQueue('p0',moveAction,[
 {type:'shield',value:1},{type:'move',value:2}
],{movePath:[{q:0,r:3}],destination:{q:0,r:3}}),/Move must precede/);
const moveAttack=abilities.compileHeroQueue('p0',moveAction,[
 {type:'move',value:'action'},{type:'attack',value:2,range:1}
],{movePath:[{q:0,r:3}],destination:{q:0,r:3}});
assert.deepEqual(moveAttack.map(e=>e.type),
 ['heroMoveStep','heroAttackTargetChoice']);
assert.equal(moveAttack[1].effect.value,2);
assert.equal(moveAttack[1].effect.range,1);
assert.equal(moveAttack[1].action.kind,'move');
assert.deepEqual(JSON.parse(JSON.stringify(moveAttack)),moveAttack);
assert.throws(()=>abilities.compileHeroQueue('p0',moveAction,[
 {type:'move',value:'action'},{type:'attack',value:2}
],{movePath:[{q:0,r:3}],destination:{q:0,r:3}}),/Invalid post-move Attack/);
assert.throws(()=>abilities.compileHeroQueue('p0',moveAction,[
 {type:'move',value:'action'},{type:'attack',value:2,range:1,optional:true}
],{movePath:[{q:0,r:3}],destination:{q:0,r:3}}),/Invalid post-move Attack/);
assert.throws(()=>abilities.compileHeroQueue('p0',moveAction,[
 {type:'move',value:2},{type:'attack',value:3},{type:'shield',value:1}
],{movePath:[{q:0,r:3}],destination:{q:0,r:3}}),/Move must precede/);
console.log('F2 compiled hero movement paths and effect suffix conformance passed');
