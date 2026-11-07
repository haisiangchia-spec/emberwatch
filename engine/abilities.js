/* Emberwatch F2 tactical resolver v0.1. Original generic rules machinery; no proprietary cards. */
(function(root,factory){
 const api=factory();
 if(typeof module==='object'&&module.exports)module.exports=api;
 if(root)root.EmberwatchAbilities=api;
})(typeof window!=='undefined'?window:null,function(){
 'use strict';
 const copy=x=>JSON.parse(JSON.stringify(x));
 const key=p=>p.q+','+p.r;
 const distance=(a,b)=>{
   const ac={x:a.q-(a.r-(a.r&1))/2,z:a.r},bc={x:b.q-(b.r-(b.r&1))/2,z:b.r};
   return Math.max(Math.abs(ac.x-bc.x),Math.abs(ac.z-bc.z),Math.abs((-ac.x-ac.z)-(-bc.x-bc.z)));
 };
 function neighbors(pos){
   const odd=pos.r&1;
   const dirs=odd?[[1,0],[1,-1],[0,-1],[-1,0],[0,1],[1,1]]:
                  [[1,0],[0,-1],[-1,-1],[-1,0],[-1,1],[0,1]];
   return dirs.map(([q,r])=>({q:pos.q+q,r:pos.r+r}));
 }
 function validate(state,actorId,steps){
   if(!state||!state.units||!state.units[actorId])throw Error('Unknown actor');
   if(!Array.isArray(steps)||steps.length===0)throw Error('Missing ability steps');
   for(const step of steps){
     if(!['attack','heal','shield','retaliate','push','pull','condition','move','infuse'].includes(step.type))throw Error('Unsupported ability: '+step.type);
     if(step.value!==undefined&&(!Number.isFinite(step.value)||step.value<0))throw Error('Invalid ability value');
   }
 }
 function validTargets(state,actor,step){
   const type=step.type,ids=Object.keys(state.units);
   return ids.filter(id=>{
     const u=state.units[id];
     if(u.hp<=0)return false;
     if(type==='shield'||type==='retaliate'||type==='move'||type==='infuse')return id===actor.id;
     if(type==='heal')return u.team===actor.team;
     if(type==='attack'||type==='push'||type==='pull'||type==='condition')return u.team!==actor.team;
     return false;
   }).filter(id=>(step.range===undefined||distance(actor,state.units[id])<=step.range)
         &&(step.lineOfSight===false||!state.lineOfSight||state.lineOfSight[actor.id+'>'+id]!==false));
 }
 function movePath(state,actor,target,type,path,maxSteps){
   if(!Array.isArray(path)||path.length>maxSteps)throw Error('Forced move distance exceeded');
   if(path.length===0)return;
   let previous={q:target.q,r:target.r};
   for(const pos of path){
     if(!pos||!Number.isInteger(pos.q)||!Number.isInteger(pos.r))throw Error('Invalid forced move hex');
     if(!neighbors(previous).some(p=>p.q===pos.q&&p.r===pos.r))throw Error('Forced move must use adjacent hexes');
     const before=distance(actor,previous),after=distance(actor,pos);
     if(type==='push'&&after<=before||type==='pull'&&after>=before)throw Error('Forced movement must '+(type==='push'?'increase':'decrease')+' distance');
     if((state.blocked||[]).includes(key(pos)))throw Error('Forced move blocked');
     if(Object.values(state.units).some(u=>u.id!==target.id&&u.hp>0&&u.q===pos.q&&u.r===pos.r))throw Error('Forced move destination occupied');
     previous={q:pos.q,r:pos.r};
   }
   target.q=previous.q;target.r=previous.r;
 }
 function apply(state,actorId,steps,choices=[],opts={}){
   validate(state,actorId,steps);
   const next=copy(state),events=[];
   const actor=next.units[actorId];actor.id=actorId;
   for(let index=0;index<steps.length;index++){
     const step=steps[index],choice=choices[index]||{},type=step.type;
     if(step.optional&&choice.skip){events.push({type:'skipped',step:index});continue}
     if(type==='shield'||type==='retaliate'){
       const prop=type==='shield'?'shield':'retaliate';
       const duration=step.duration||'round';
       if(!['round','turn','persistent'].includes(duration))throw Error('Unsupported duration');
       actor.active??=[];
       actor.active.push({type,value:step.value||0,range:type==='retaliate'?(step.range??1):undefined,duration});
       events.push({type,unit:actorId,value:step.value||0,duration});
       continue;
     }
     if(type==='infuse'){
       next.elements??={};if(!step.element)throw Error('Missing element');
       next.elements[step.element]=2;events.push({type,element:step.element});continue;
     }
     if(type==='move'){
       if(!Array.isArray(choice.path))throw Error('Move requires a path');
       movePath(next,actor,actor,'move',[],0); // movement receives separate path validation below
       if(choice.path.length>(step.value||0))throw Error('Move distance exceeded');
       let origin={q:actor.q,r:actor.r};
       for(const pos of choice.path){
         if(!neighbors(origin).some(p=>p.q===pos.q&&p.r===pos.r))throw Error('Move requires adjacent hexes');
         if((next.blocked||[]).includes(key(pos)))throw Error('Movement blocked');
         if(Object.values(next.units).some(u=>u.id!==actorId&&u.hp>0&&u.q===pos.q&&u.r===pos.r))throw Error('Movement occupied');
         origin={q:pos.q,r:pos.r};
       }
       actor.q=origin.q;actor.r=origin.r;events.push({type,unit:actorId,at:origin});continue;
     }
     const ids=choice.targets||[];
     if(!Array.isArray(ids)||new Set(ids).size!==ids.length)throw Error('Target list must be unique');
     const eligible=validTargets(next,actor,step),limit=step.targets??1;
     if(ids.length>limit||ids.some(id=>!eligible.includes(id)))throw Error('Invalid target selection');
     if(step.required!==false&&ids.length===0)throw Error('No target selected');
     for(const id of ids){
       const target=next.units[id];target.id=id;
       if(type==='attack'){
         const bonus=opts.modifier?opts.modifier({actor:copy(actor),target:copy(target),step:copy(step),index}):0;
         if(!Number.isFinite(bonus))throw Error('Invalid modifier');
         const attack=Math.max(0,(step.value||0)+bonus);
         const shield=(target.active||[]).filter(e=>e.type==='shield').reduce((s,e)=>s+e.value,0)+(target.shield||0);
         const damage=Math.max(0,attack-shield);
         target.hp=Math.max(0,target.hp-damage);
         events.push({type:'attack',actor:actorId,target:id,attack,shield,damage});
         // Retaliate resolves after attack effects. This resolver implements it for an
         // atomic Attack only. Linked push/pull posteffects need the pending-hit queue.
         if(step.after?.length)throw Error('Linked attack effects require later pending-hit resolver');
         const ret=(target.active||[]).filter(e=>e.type==='retaliate'&&distance(actor,target)<=e.range)
                    .reduce((s,e)=>s+e.value,0);
         if(target.hp>0&&ret>0){actor.hp=Math.max(0,actor.hp-ret);events.push({type:'retaliate',actor:id,target:actorId,damage:ret})}
       }else if(type==='heal'){
         const amount=Math.min(step.value||0,target.maxHp-target.hp);
         target.hp+=amount;events.push({type:'heal',target:id,amount});
       }else if(type==='condition'){
         target.conditions??={};target.conditions[step.condition]=true;
         events.push({type:'condition',target:id,condition:step.condition});
       }else if(type==='push'||type==='pull'){
         movePath(next,actor,target,type,(choice.paths||{})[id]||[],step.value||0);
         events.push({type,target:id,at:{q:target.q,r:target.r}});
       }
     }
   }
   return {state:next,events};
 }
 function clearEffects(state,duration){
   const next=copy(state);
   for(const u of Object.values(next.units))u.active=(u.active||[]).filter(e=>e.duration!==duration);
   return next;
 }
 return Object.freeze({apply,validTargets,neighbors,distance,clearEffects});
});
