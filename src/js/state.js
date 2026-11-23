import { LOCALES,KEY,LETTERS,HK_BBOX,travelTolerance } from './config.js';
import { store } from './store.js';
import { isNum,clamp,clone,decodeBase64Url,encodeBase64Url,$ } from './util.js';
import { t } from './i18n.js';
import { migrateVectors } from './vectors.js';
import { loadGeoCache } from './search.js';
import { findExact,districtFor } from './data.js';
import { applySettingsToDom,flashTooltip } from './ui.js';

export function defaultName(i){return t('people.defaultName',{letter:LETTERS[i%8]});}
export const normIncludeHeadway=value=>value===false?false:true;
export function nextSeq(people){return Math.max(1,...people.map(p=>Number(String(p.id).replace(/\D/g,''))||0))+1;}
function buildSettings(stored,modes){
  stored=stored&&typeof stored==='object'?stored:{};
  return{modes:Array.isArray(modes)&&modes.length?modes:['rail','bus'],tolerance:travelTolerance(stored.tolerance),includeHeadway:normIncludeHeadway(stored.includeHeadway),vectors:migrateVectors(stored.vectors),beta:{vectors:!!stored.beta?.vectors}};
}
export function displayName(person,i){return (person?.name||'').trim()||defaultName(i);}
export function profileLabel(profile){return profile.origin?.label||t('people.hintEmpty');}
export function profileDistrict(profile){return profile.origin?.district||districtFor(profile.origin?.lat,profile.origin?.lon);}
export function normalizePerson(raw,i){
  if(!raw)return null;
  const origin=raw.origin||null;
  const validNode=origin&&origin.kind==='node'&&Number.isInteger(origin.node)&&origin.node>=0&&store.NODES&&origin.node<store.NODES.names.length;
  const validCoords=origin&&origin.kind==='coords'&&isNum(origin.lat)&&isNum(origin.lon)&&origin.lat>=HK_BBOX[1]&&origin.lat<=HK_BBOX[3]&&origin.lon>=HK_BBOX[0]&&origin.lon<=HK_BBOX[2];
  if(!validNode&&!validCoords)return null;
  return{id:`p${i+1}`,name:raw.name||defaultName(i),origin,directoryId:raw.directoryId||null,walkMinutes:clamp(Number(raw.walkMinutes),0,60,20)};
}
export function defaultPeople(){
  return ['Tsuen Wan','North Point'].map((name,i)=>{
    const node=findExact(name);
    return{id:`p${i+1}`,name:defaultName(i),walkMinutes:20,origin:node==null?null:{kind:'node',node,label:store.NODES.names[node],lat:store.NODES.lat[node],lon:store.NODES.lon[node],district:districtFor(store.NODES.lat[node],store.NODES.lon[node])}};
  }).filter(p=>p.origin);
}
export function save(){
  localStorage.setItem(KEY.people,JSON.stringify(store.people.map(p=>({id:p.id,name:p.name,origin:p.origin,directoryId:p.directoryId||null,walkMinutes:clamp(Number(p.walkMinutes),0,60,20)}))));
  store.settings.includeHeadway=normIncludeHeadway(store.settings.includeHeadway);
  localStorage.setItem(KEY.settings,JSON.stringify(store.settings));
  localStorage.setItem(KEY.locale,store.locale);
}
export function saveDirectory(){localStorage.setItem(KEY.directory,JSON.stringify(store.directory));}
export function profileFromPerson(person){
  return{id:person.directoryId||`d${store.directorySeq++}`,name:person.name||defaultName(0),origin:clone(person.origin),walkMinutes:clamp(Number(person.walkMinutes),0,60,20),updated:Date.now()};
}
export function restoreState(){
  loadGeoCache();
  let loaded=false;
  try{
    const raw=JSON.parse(localStorage.getItem(KEY.people));
    if(Array.isArray(raw)&&raw.length>=2){store.people=raw.map(normalizePerson).filter(Boolean);loaded=true;}
  }catch(e){}
  if(!loaded||store.people.length<2){
    try{
      const raw=JSON.parse(localStorage.getItem(KEY.oldLoc));
      if(Array.isArray(raw)&&raw.length>=2){store.people=raw.map((l,i)=>({id:`p${i+1}`,name:defaultName(i),walkMinutes:20,origin:l.i!=null&&store.NODES&&l.i<store.NODES.names.length?{kind:'node',node:l.i,label:l.name,lat:l.lat,lon:l.lon}:null})).filter(p=>p.origin);loaded=true;}
    }catch(e){}
  }
  if(store.people.length<2)store.people=defaultPeople();
  store.seq=nextSeq(store.people);
  let stored=null;
  try{stored=JSON.parse(localStorage.getItem(KEY.settings));}catch(e){}
  let modes=Array.isArray(stored?.modes)?stored.modes:null;
  if(!modes){try{const m=JSON.parse(localStorage.getItem(KEY.oldModes));if(Array.isArray(m))modes=m;}catch(e){}}
  store.settings=buildSettings(stored,modes);
  applySettingsToDom();
  save();
}
export function restoreDirectory(){
  try{
    const raw=JSON.parse(localStorage.getItem(KEY.directory));
    if(Array.isArray(raw))store.directory=raw.filter(p=>p&&p.origin).map(p=>({id:p.id||`d${Date.now()}`,name:p.name||defaultName(0),origin:p.origin,walkMinutes:clamp(Number(p.walkMinutes),0,60,20),updated:p.updated||Date.now()}));
  }catch(e){}
  if(!store.directory.length)store.directory=store.people.map(profileFromPerson);
  saveDirectory();
}
export async function copyText(text){
  if(navigator.clipboard?.writeText){await navigator.clipboard.writeText(text);return;}
  const input=document.createElement('textarea');
  input.value=text;input.setAttribute('readonly','');input.style.position='fixed';input.style.opacity='0';
  document.body.appendChild(input);input.select();
  const ok=document.execCommand('copy');input.remove();
  if(!ok)throw new Error('copy failed');
}
export async function shareScenario(){
  const selectedState=store.selection?.kind==='cell'
    ?{kind:'cell',key:store.selection.key,node:store.selection.node,lat:store.selection.lat,lon:store.selection.lon}
    :store.selection?.kind==='point'
      ?{kind:'point',node:store.selection.node,lat:store.selection.lat,lon:store.selection.lon}
      :{kind:'result',index:store.selected>=0?store.selected:0};
  const settings=clone(store.settings);
  settings.includeHeadway=normIncludeHeadway(settings.includeHeadway);
  const state={v:1,people:store.people.map(p=>({id:p.id,name:p.name,origin:p.origin,walkMinutes:clamp(Number(p.walkMinutes),0,60,20)})),settings,locale:store.locale,selected:selectedState};
  const url=`${location.origin}${location.pathname}${location.search}#s=${encodeBase64Url(state)}`;
  const button=$('share'),status=$('shareStatus');
  const report=message=>{
    flashTooltip(button,message);
    if(!status)return;
    clearTimeout(status.shareStatusTimer);
    status.textContent=message;
    status.hidden=false;
    status.shareStatusTimer=setTimeout(()=>{status.hidden=true;status.textContent='';},2500);
  };
  try{await copyText(url);report(t('share.copied'));}
  catch(err){console.error(err);report(t('share.failed'));}
}
export function readHashState(){
  if(!location.hash.startsWith('#s='))return null;
  try{
    const state=JSON.parse(decodeBase64Url(location.hash.slice(3)));
    return state&&state.v===1&&Array.isArray(state.people)?state:null;
  }catch(e){return null;}
}
export function applySharedState(){
  const state=readHashState();
  if(!state)return false;
  const sharedPeople=state.people.map(normalizePerson).filter(Boolean);
  if(sharedPeople.length<2)return false;
  store.people=sharedPeople;
  const modes=Array.isArray(state.settings?.modes)?state.settings.modes.filter(m=>m==='rail'||m==='bus'):null;
  store.settings=buildSettings({...state.settings,includeHeadway:normIncludeHeadway(state.settings?.includeHeadway)},modes);
  if(LOCALES.includes(state.locale))store.locale=state.locale;
  store.sharedSelection=state.selected&&typeof state.selected==='object'?state.selected:null;
  store.seq=nextSeq(store.people);
  history.replaceState(null,'',location.pathname+location.search);
  return true;
}