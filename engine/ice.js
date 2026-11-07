/* Emberwatch icy terrain movement. A slide inherits the entering move type.
   This module is pure and can be used for hero, monster and forced movement. */
(function(root,factory){
 const api=factory();
 if(typeof module==='object'&&module.exports)module.exports=api;
 if(root)root.EmberwatchIce=api;
})(typeof window!=='undefined'?window:null,function(){
 'use strict';
 const cube=p=>({x:p.q-(p.r-(p.r&1))/2,z:p.r});
 const offset=(x,z)=>({q:x+(z-(z&1))/2,r:z});
 const same=(a,b)=>Array.isArray(a)?a[0]===b.q&&a[1]===b.r:a.q===b.q&&a.r===b.r;
 function slide(from,entry,{icy=[],canEnter=()=>true,mode='walk',limit=100}={}){
   if(!from||!entry||!Array.isArray(icy)||typeof canEnter!=='function')throw Error('Invalid icy slide input');
   if(['fly','jump','teleport'].includes(mode))return [];
   const a=cube(from),b=cube(entry),dx=b.x-a.x,dz=b.z-a.z;
   if(Math.max(Math.abs(dx),Math.abs(dz),Math.abs(dx+dz))!==1)
     throw Error('Icy movement must enter from an adjacent hex');
   const steps=[];
   let pos={q:entry.q,r:entry.r};
   for(let n=0;n<limit&&icy.some(t=>same(t,pos));n++){
     const cur=cube(pos),next=offset(cur.x+dx,cur.z+dz);
     if(!canEnter(next))break;
     steps.push(next);pos=next;
   }
   return steps;
 }
 return Object.freeze({slide});
});
