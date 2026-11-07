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
 // Shared numerical hit calculation, used for both hero and monster attacks.
 // Guards in the prototype are one-hit barriers; persistent Shield is separate.
 function hitDamage({power,guard=0,shield=0,poison=false,miss=false}){
   for(const value of [power,guard,shield])if(!Number.isFinite(value))throw Error('Attack values must be finite numbers');
   if(power<0||guard<0||shield<0)throw Error('Attack values cannot be negative');
   const raw=miss?0:Math.max(0,power+(poison?1:0));
   return {raw,guard,shield,damage:miss?0:Math.max(0,raw-guard-shield)};
 }
 function retaliation(defender,attacker){
   if(!defender||!attacker||defender.hp<=0||attacker.hp<=0)return 0;
   return (defender.active||[]).filter(effect=>effect.type==='retaliate'&&
      distance(defender,attacker)<=(effect.range??1)).reduce((sum,e)=>sum+Math.max(0,e.value||0),0);
 }
 function validate(state,actorId,steps){
   if(!state||!state.units||!state.units[actorId])throw Error('Unknown actor');
   if(!Array.isArray(steps)||steps.length===0)throw Error('Missing ability steps');
   for(const step of steps){
     if(!['attack','areaAttack','heal','shield','retaliate','push','pull','condition','move','infuse'].includes(step.type))throw Error('Unsupported ability: '+step.type);
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
     if(type==='attack'||type==='areaAttack'||type==='push'||type==='pull'||type==='condition')return u.team!==actor.team;
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
 // Deterministic hex templates expressed as axial offsets around an odd-row anchor.
 function areaHexes(anchor,shape){
   if(!anchor||!Number.isInteger(anchor.q)||!Number.isInteger(anchor.r))throw Error('Invalid area anchor');
   if(!Array.isArray(shape)||!shape.length)throw Error('Missing area shape');
   const origin=anchor.q-(anchor.r-(anchor.r&1))/2;
   return shape.map(offset=>{
     if(!Number.isInteger(offset.q)||!Number.isInteger(offset.r))throw Error('Invalid area offset');
     const r=anchor.r+offset.r;
     return {q:origin+offset.q+(r-(r&1))/2,r};
   });
 }
 // A JSON-serializable instruction cursor. Pauses before any ability whose
 // explicit target/path selection has not yet been supplied.
 // Normalize prototype monster modifier cards to the same structured
 // move/attack language as character actions. Future content packs can supply
 // explicit `abilities` arrays and bypass the legacy modifier fields entirely.
 function monsterSteps(profile,card){
   if(!profile||!card)throw Error('Missing monster profile or card');
   if(Array.isArray(card.abilities)){
     for(const step of card.abilities)if(!['move','attack','heal','shield','retaliate','condition','infuse'].includes(step.type))throw Error('Unsupported scripted monster action');
     return copy(card.abilities);
   }
   return [
     {type:'move',value:Math.max(0,(profile.move||0)+(card.move||0))},
     {type:'attack',value:Math.max(0,(profile.attack||0)+(card.attack||0)),range:Math.max(1,(profile.range||1)+(card.range||0)),condition:card.condition||null}
   ];
 }
 function beginSequence(state,actorId,steps){
   validate(state,actorId,steps);
   return {state:copy(state),cursor:{actorId,steps:copy(steps),index:0,events:[]},done:false};
 }
 function resumeSequence(snapshot,choice,opts={}){
   if(!snapshot?.cursor||!Number.isInteger(snapshot.cursor.index))throw Error('Invalid sequence snapshot');
   const data=copy(snapshot.cursor),now=copy(snapshot.state);
   if(data.index>=data.steps.length)return {state:now,cursor:null,done:true,events:data.events||[]};
   const step=data.steps[data.index];
   const requiresChoice=['attack','areaAttack','heal','condition','push','pull','move'].includes(step.type);
   if(requiresChoice&&choice===undefined)return {state:now,cursor:data,done:false,awaiting:{step:data.index,type:step.type}};
   const outcome=apply(now,data.actorId,[step],[choice||{}],opts);
   data.events.push(...outcome.events.map(event=>({...event,stepIndex:data.index})));
   data.index++;
   return {state:outcome.state,cursor:data.index<data.steps.length?data:null,done:data.index>=data.steps.length,events:copy(data.events)};
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
     let ids=choice.targets||[];
     if(type==='areaAttack'){
       if(!choice.anchor||!Number.isInteger(choice.anchor.q)||!Number.isInteger(choice.anchor.r))throw Error('Area attack requires a hex anchor');
       if(!Array.isArray(step.area)||!step.area.length)throw Error('Area attack requires shape offsets');
       if(step.range!==undefined&&distance(actor,choice.anchor)>step.range)throw Error('Area anchor beyond range');
       const hexes=areaHexes(choice.anchor,step.area).map(key);
       ids=validTargets(next,actor,{type:'attack',lineOfSight:step.lineOfSight}).filter(id=>hexes.includes(key(next.units[id])));
     }
     if(!Array.isArray(ids)||new Set(ids).size!==ids.length)throw Error('Target list must be unique');
     const eligible=validTargets(next,actor,type==='areaAttack'?{type:'attack',lineOfSight:step.lineOfSight}:step),limit=type==='areaAttack'?Infinity:(step.targets??1);
     if(ids.length>limit||ids.some(id=>!eligible.includes(id)))throw Error('Invalid target selection');
     if(step.required!==false&&ids.length===0)throw Error('No target selected');
     for(const id of ids){
       const target=next.units[id];target.id=id;
       if(type==='attack'||type==='areaAttack'){
         const bonus=opts.modifier?opts.modifier({actor:copy(actor),target:copy(target),step:copy(step),index}):0;
         if(!Number.isFinite(bonus))throw Error('Invalid modifier');
         const attack=Math.max(0,(step.value||0)+bonus);
         const shield=(target.active||[]).filter(e=>e.type==='shield').reduce((s,e)=>s+e.value,0)+(target.shield||0);
         const damage=hitDamage({power:attack,shield}).damage;
         target.hp=Math.max(0,target.hp-damage);
         events.push({type:'attack',actor:actorId,target:id,attack,shield,damage});
         // Linked effects resolve before a surviving defender retaliates.
         // Each targeted attack is atomic: damage -> linked effects -> retaliation.
         // Choices for a linked push/pull path are per target, per linked step.
         if(step.after?.length&&target.hp>0){
           if(!Array.isArray(step.after))throw Error('Linked attack effects must be an array');
           const linkedChoices=choice.after?.[id]||[];
           for(let n=0;n<step.after.length;n++){
             const linked=step.after[n],selection=linkedChoices[n]||{};
             if(linked.optional&&selection.skip){events.push({type:'skipped',target:id,linked:n});continue}
             if(linked.type==='push'||linked.type==='pull'){
               const path=selection.path||[];
               movePath(next,actor,target,linked.type,path,linked.value||0);
               events.push({type:linked.type,target:id,at:{q:target.q,r:target.r},linked:n});
             }else if(linked.type==='condition'){
               if(!linked.condition)throw Error('Linked condition is missing its name');
               target.conditions??={};
               target.conditions[linked.condition]=true;
               events.push({type:'condition',target:id,condition:linked.condition,linked:n});
             }else throw Error('Unsupported linked effect: '+linked.type);
           }
         }
         // A defender killed by damage cannot retaliate. Check distance after
         // linked displacements; normal shields do not reduce retaliate damage.
         const ret=retaliation(target,actor);
         if(ret>0&&actor.hp>0){
           actor.hp=Math.max(0,actor.hp-ret);
           events.push({type:'retaliate',actor:id,target:actorId,damage:ret});
         }
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
 return Object.freeze({apply,validTargets,neighbors,distance,hitDamage,retaliation,areaHexes,monsterSteps,beginSequence,resumeSequence,clearEffects});
});
