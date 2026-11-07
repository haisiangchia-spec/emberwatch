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
   for(const name of ['negative','cost','distance','initiative','seat','row','col']){
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
       !Number.isInteger(c.negative??0)||(c.negative??0)<0||
       !Number.isInteger(c.seat)||c.seat<0||!Number.isInteger(c.row)||!Number.isInteger(c.col))
       throw Error('Invalid monster focus candidate');
     return {targetId:String(c.targetId),negative:c.negative??0,cost:c.cost,distance:c.distance,
       initiative:c.initiative,seat:c.seat,row:c.row,col:c.col};
   });
   clean.sort(compare);
   return {chosen:clean[0]||null,ranking:clean};
 }
 // After focus has been fixed, a ranged monster already adjacent to its
 // primary focus may step to an unoccupied, safe attack hex. This decision
 // must NOT change the primary focus. The caller supplies legal reachable
 // positions, precomputed safe path costs, and line-of-sight results.
 function rangedRetreat({origin,focus,range,move,candidates,muddled=false,strengthened=false}){
   if(!origin||!focus||!Array.isArray(candidates))throw Error('Invalid ranged retreat data');
   if(!Number.isFinite(range)||!Number.isFinite(move))throw Error('Invalid retreat limits');
   if(range<=1||move<=0||origin.distance!==1||(muddled&&!strengthened))return null;
   const legal=candidates.filter(c=>Number.isFinite(c.cost)&&c.cost>0&&c.cost<=move&&
      c.negative===0&&c.distance>=2&&c.distance<=range&&c.lineOfSight&&
      !c.occupied&&Number.isInteger(c.q)&&Number.isInteger(c.r));
   legal.sort((a,b)=>a.cost-b.cost||a.r-b.r||a.q-b.q);
   return legal.length?{q:legal[0].q,r:legal[0].r,cost:legal[0].cost}:null;
 }
 return Object.freeze({choose,compare,rangedRetreat});
});
