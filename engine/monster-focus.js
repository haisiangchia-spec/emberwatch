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
   for(const name of ['negative','cost','distance','initiative']){
     const lhs=a[name]??Number.MAX_SAFE_INTEGER,rhs=b[name]??Number.MAX_SAFE_INTEGER;
     if(lhs!==rhs)return lhs-rhs;
   }
   return String(a.targetId).localeCompare(String(b.targetId));
 }
 function pick(items,rng=Math.random){
   if(!items.length)return null;
   const roll=rng();
   if(typeof roll!=='number'||!Number.isFinite(roll)||roll<0||roll>=1)
     throw Error('Invalid random roll');
   return items[Math.floor(roll*items.length)];
 }
 function shuffle(items,rng=Math.random){
   const out=items.slice();
   for(let i=out.length-1;i>0;i--){
     const roll=rng();
     if(typeof roll!=='number'||!Number.isFinite(roll)||roll<0||roll>=1)
       throw Error('Invalid random roll');
     const j=Math.floor(roll*(i+1));
     [out[i],out[j]]=[out[j],out[i]];
   }
   return out;
 }
 function choose(candidates,rng=Math.random){
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
   clean.sort((a,b)=>compare(a,b)||a.seat-b.seat||a.row-b.row||a.col-b.col||
     a.targetId.localeCompare(b.targetId));
   const tied=clean.filter(c=>clean.length&&compare(c,clean[0])===0);
   return {chosen:pick(tied,rng),ranking:clean,ties:tied.length};
 }
 // After focus has been fixed, a ranged monster already adjacent to its
 // primary focus may step to an unoccupied, safe attack hex. This decision
 // must NOT change the primary focus. The caller supplies legal reachable
 // positions, precomputed safe path costs, and line-of-sight results.
 function rangedRetreat({origin,focus,range,move,candidates,muddled=false,strengthened=false},rng=Math.random){
   if(!origin||!focus||!Array.isArray(candidates))throw Error('Invalid ranged retreat data');
   if(!Number.isFinite(range)||!Number.isFinite(move))throw Error('Invalid retreat limits');
   if(range<=1||move<=0||origin.distance!==1||(muddled&&!strengthened))return null;
   const legal=candidates.filter(c=>Number.isFinite(c.cost)&&c.cost>0&&c.cost<=move&&
      c.negative===0&&c.distance>=2&&c.distance<=range&&c.lineOfSight&&
      !c.occupied&&Number.isInteger(c.q)&&Number.isInteger(c.r));
   legal.sort((a,b)=>a.cost-b.cost||a.r-b.r||a.q-b.q);
   const best=legal[0];
   const choice=best?pick(legal.filter(c=>c.cost===best.cost),rng):null;
   return choice?{q:choice.q,r:choice.r,cost:choice.cost}:null;
 }
 // Position choice for an already selected primary focus. Candidate target
 // IDs must contain that focus; other targets are not re-focused. Every entry
 // describes one reachable attack hex after pathfinding and LOS.
 function multiTargetPosition({focusId,maxTargets,move,candidates},rng=Math.random){
   if(typeof focusId!=='string'||!focusId||!Number.isInteger(maxTargets)||
      maxTargets<2||!Number.isFinite(move)||move<0||!Array.isArray(candidates))
      throw Error('Invalid multi-target positioning request');
   const legal=candidates.filter(c=>c&&Number.isInteger(c.q)&&Number.isInteger(c.r)&&
      Number.isFinite(c.cost)&&c.cost>=0&&c.cost<=move&&
      Number.isInteger(c.negative)&&c.negative>=0&&!c.occupied&&
      Array.isArray(c.targets)&&c.targets.some(t=>t.id===focusId));
   const scored=legal.map(c=>{
     const options=c.targets.filter(t=>t.id!==focusId);
     const primary=c.targets.find(t=>t.id===focusId);
     const needed=Math.min(maxTargets-1,options.length);
     const safe=options.filter(t=>!t.disadvantaged).length;
     return {q:c.q,r:c.r,cost:c.cost,negative:c.negative,
       options,primary,count:1+needed,
       disadvantage:Number(!!primary.disadvantaged)+Math.max(0,needed-safe)};
   });
   // Rule priorities determine optimal positions. Equal outcomes are genuinely
   // ambiguous; randomly choose a position, then secondary targets and attack
   // order, rather than always resolving them by coordinates or player seat.
   scored.sort((a,b)=>a.negative-b.negative||b.count-a.count||
     a.disadvantage-b.disadvantage||a.cost-b.cost||a.r-b.r||a.q-b.q);
   const first=scored[0];
   if(!first)return null;
   const tied=scored.filter(c=>c.negative===first.negative&&c.count===first.count&&
     c.disadvantage===first.disadvantage&&c.cost===first.cost);
   const chosen=pick(tied,rng);
   const secondaries=chosen.options.slice().sort((a,b)=>
      Number(!!a.disadvantaged)-Number(!!b.disadvantaged));
   const safe=secondaries.filter(t=>!t.disadvantaged);
   const worse=secondaries.filter(t=>t.disadvantaged);
   const selected=[chosen.primary,
     ...shuffle(safe,rng).slice(0,maxTargets-1),
     ...shuffle(worse,rng).slice(0,Math.max(0,maxTargets-1-safe.length))];
   return {q:chosen.q,r:chosen.r,cost:chosen.cost,negative:chosen.negative,
     targets:shuffle(selected.map(t=>t.id),rng),count:selected.length,
     disadvantage:selected.filter(t=>t.disadvantaged).length};
 }
 return Object.freeze({choose,compare,rangedRetreat,multiTargetPosition,pick,shuffle});
});
