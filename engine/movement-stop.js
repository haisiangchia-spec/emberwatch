/* Choose a legal stopping hex along a precomputed monster path.
   Slides form indivisible zero-cost continuations of the paid entry.
   This module never mutates the path or the game state. */
(function(root,factory){
 const api=factory();
 if(typeof module==='object'&&module.exports)module.exports=api;
 if(root)root.EmberwatchMovementStop=api;
})(typeof window!=='undefined'?window:null,function(){
 'use strict';
 function choose(path,allowance,{difficult=()=>false,occupied=()=>false}={}){
  if(!Array.isArray(path)||!path.length||!Number.isFinite(allowance)||allowance<0)
   throw Error('Invalid movement path or allowance');
  const start=path[0];
  if(!Number.isInteger(start.q)||!Number.isInteger(start.r))
   throw Error('Invalid movement origin');
  let stop={q:start.q,r:start.r},spent=0,stopSpent=0;
  for(let i=1;i<path.length;i++){
   const step=path[i],price=step.slide?0:(difficult(step.q,step.r)?2:1);
   if(spent+price>allowance)break;
   spent+=price;
   // A paid entry and its following free icy slides form one edge:
   // stopping inside that edge is not a valid tactical choice.
   if(path[i+1]?.slide)continue;
   if(!occupied(step.q,step.r)){
    stop={q:step.q,r:step.r};
    stopSpent=spent;
   }
  }
  return {stop,spent:stopSpent};
 }
 return Object.freeze({choose});
});
