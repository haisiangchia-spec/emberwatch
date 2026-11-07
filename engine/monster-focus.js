/* Original Emberwatch monster focus decision module. Pure and serializable.
   This mirrors the prototype's current candidate ordering; it is NOT yet
   a complete implementation of Frosthaven monster focus rules. */
(function(root,factory){
 const api=factory();
 if(typeof module==='object'&&module.exports)module.exports=api;
 if(root)root.EmberwatchMonsterFocus=api;
})(typeof window!=='undefined'?window:null,function(){
 'use strict';
 function compare(a,b){
   for(const name of ['cost','distance','initiative','seat','row','col']){
     const lhs=a[name]??Number.MAX_SAFE_INTEGER,rhs=b[name]??Number.MAX_SAFE_INTEGER;
     if(lhs!==rhs)return lhs-rhs;
   }
   return String(a.targetId).localeCompare(String(b.targetId));
 }
 function choose(candidates){
   if(!Array.isArray(candidates))throw Error('Monster focus candidates must be an array');
   const clean=candidates.map(c=>{
     if(!c||!c.targetId||!Number.isFinite(c.cost)||c.cost<0||
       !Number.isFinite(c.distance)||!Number.isFinite(c.initiative)||
       !Number.isInteger(c.seat)||c.seat<0||!Number.isInteger(c.row)||!Number.isInteger(c.col))
       throw Error('Invalid monster focus candidate');
     return {targetId:String(c.targetId),cost:c.cost,distance:c.distance,
       initiative:c.initiative,seat:c.seat,row:c.row,col:c.col};
   });
   clean.sort(compare);
   return {chosen:clean[0]||null,ranking:clean};
 }
 return Object.freeze({choose,compare});
});
