/* Emberwatch terrain entry resolver — deterministic, serializable.
   Damage applies on entering a hex, not on leaving or remaining on it. */
(function(root,factory){
 const api=factory();
 if(typeof module==='object'&&module.exports)module.exports=api;
 if(root)root.EmberwatchTerrain=api;
})(typeof window!=='undefined'?window:null,function(){
 'use strict';
 const copy=v=>JSON.parse(JSON.stringify(v));
 const coordinate=t=>Array.isArray(t)?{q:t[0],r:t[1]}:t;
 const equals=(t,hex)=>{const p=coordinate(t);return p&&p.q===hex.q&&p.r===hex.r};
 function damageAt(level,type){
   if(!Number.isInteger(level)||level<0||level>7)throw Error('Invalid scenario level');
   if(type==='trap')return level+2;
   if(type==='hazardous')return 1+Math.ceil(level/3);
   throw Error('Invalid terrain type');
 }
 function enter(snapshot,unitId,hex,{jump=false,endJump=false}={}){
   if(!snapshot||!snapshot.units||!snapshot.units[unitId]||!hex||
      !Number.isInteger(hex.q)||!Number.isInteger(hex.r))throw Error('Invalid terrain entry');
   const next=copy(snapshot),unit=next.units[unitId],effects=[];
   if(unit.hp<=0)return {state:next,effects};
   if(unit.flying||jump&&!endJump)return {state:next,effects};
   const level=next.scenarioLevel??1;
   for(const kind of ['traps','hazardous']){
     const terrain=next[kind]||[];
     const index=terrain.findIndex(t=>equals(t,hex));
     if(index<0)continue;
     const tile=terrain[index];
     const type=kind==='traps'?'trap':'hazardous';
     const raw=typeof tile?.damage==='number'?tile.damage:damageAt(level,type);
     if(!Number.isFinite(raw)||raw<0)throw Error('Invalid terrain damage');
     const damage=Math.min(unit.hp,raw);
     unit.hp-=damage;
     effects.push({type,unitId,q:hex.q,r:hex.r,damage,removed:kind==='traps'});
     if(kind==='traps'){
       const conditions=Array.isArray(tile?.conditions)?tile.conditions:[];
       unit.conditions??={};
       for(const condition of conditions){
         if(typeof condition!=='string'||!condition)throw Error('Invalid trap condition');
         unit.conditions[condition]=true;
         effects.push({type:'condition',unitId,condition});
       }
       terrain.splice(index,1);
     }
     if(unit.hp<=0)break;
   }
   return {state:next,effects};
 }
 return Object.freeze({enter,damageAt});
});
