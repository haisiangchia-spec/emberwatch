/* Emberwatch combat event queue: serializable, pure, deterministic.
   Engine resolves work; UI supplies choices and can persist mid-interruption. */
(function(root,factory){
 const api=factory();
 if(typeof module==='object'&&module.exports)module.exports=api;
 if(root)root.EmberwatchCombatQueue=api;
})(typeof window!=='undefined'?window:null,function(){
 'use strict';
 const copy=value=>JSON.parse(JSON.stringify(value));
 const TYPES=new Set(['monsterTurn','monsterStart','monsterMove','monsterAttack','monsterFinish','heroAttackContinuation','heroActionComplete']);
 function create(owner,events){
   if(!['monster','hero'].includes(owner))throw Error('Unsupported combat queue owner');
   if(!Array.isArray(events)||!events.length)throw Error('Combat queue requires events');
   for(const ev of events){
     if(!ev||!TYPES.has(ev.type)||typeof ev.actorId!=='string'||!ev.actorId)
       throw Error('Invalid combat queue event');
   }
   return {version:1,owner,events:copy(events),index:0,paused:false,pauseReason:null};
 }
 function validate(q){
   if(!q||q.version!==1||!Array.isArray(q.events)||!Number.isInteger(q.index)||
       q.index<0||q.index>q.events.length||!['monster','hero'].includes(q.owner))
       throw Error('Invalid combat queue');
 }
 function next(q){
   validate(q);
   if(q.paused)return {queue:copy(q),event:null,done:false,paused:true};
   if(q.index===q.events.length)return {queue:copy(q),event:null,done:true,paused:false};
   const out=copy(q),event=copy(out.events[out.index++]);
   return {queue:out,event,done:out.index===out.events.length,paused:false};
 }
 function pause(q,reason){
   validate(q);if(q.paused)throw Error('Queue already paused');
   if(typeof reason!=='string'||!reason)throw Error('Pause reason required');
   const out=copy(q);out.paused=true;out.pauseReason=reason;return out;
 }
 function resume(q){
   validate(q);if(!q.paused)throw Error('Queue is not paused');
   const out=copy(q);out.paused=false;out.pauseReason=null;return out;
 }
 return Object.freeze({create,next,pause,resume});
});
