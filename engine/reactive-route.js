/* Pure decision policy for a queued monster's refreshed route.
   Keep the original goal when reachable; otherwise select an attack hex
   for the ALREADY committed focus. No focus reroll and no modifier draws. */
(function(root,factory){
 const api=factory();
 if(typeof module==='object'&&module.exports)module.exports=api;
 if(root)root.EmberwatchReactiveRoute=api;
})(typeof window!=='undefined'?window:null,function(){
 'use strict';
 function choose({goal,focusId,candidates,random=Math.random}){
  if(!Array.isArray(candidates)||typeof random!=='function')
    throw Error('Invalid reactive movement candidates');
  const valid=candidates.filter(c=>c&&Number.isFinite(c.cost)&&c.cost>=0&&
   Number.isFinite(c.negative)&&c.negative>=0&&!c.occupied&&c.reachable!==false);
  const original=goal&&valid.find(c=>c.q===goal.q&&c.r===goal.r);
  if(original)return original;
  const alternatives=valid.filter(c=>c.attackable&&c.focusId===focusId);
  if(!alternatives.length)return null;
  alternatives.sort((a,b)=>a.negative-b.negative||a.cost-b.cost);
  const best=alternatives[0];
  const ties=alternatives.filter(c=>c.negative===best.negative&&c.cost===best.cost);
  const roll=random();
  if(!Number.isFinite(roll)||roll<0||roll>=1)throw Error('Invalid random roll');
  return ties[Math.floor(roll*ties.length)];
 }
 return Object.freeze({choose});
});
