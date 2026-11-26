import { LOCALES,KEY,LETTERS,HK_BBOX,FAIRNESS_METRICS,FAIRNESS_DEFAULT,travelTolerance,fareTolerance } from './config.js';
import { store } from './store.js';
import { snapWalkMinutes } from './model.js';
import { isNum,clone,decodeBase64Url,encodeBase64Url,$ } from './util.js';
import { t } from './i18n.js';
import { migrateVectors } from './vectors.js';
import { loadGeoCache } from './search.js';
import { findExact,districtFor } from './data.js';
import { applySettingsToDom,flashTooltip,showError,showActionStatus } from './ui.js';

const SELECTION_KEY='hkfair.v2.selection';
// Share errors are raised while init() is still setting up. init() calls
// renderEmpty() before restoreSelection(), and renderEmpty() clears #error, so
// keep the message and re-show it from restoreSelection(), the last state call
// after the shell has been rendered.
let pendingShareError=null;
function flagShareError(key){
  pendingShareError=key;
  showError(t(key));
}
function flushShareError(){
  if(!pendingShareError)return;
  const key=pendingShareError;
  pendingShareError=null;
  showError(t(key));
}

// A share link replaces the whole scenario. Keep a one-click way back when
// the device already holds a scenario the user changed, instead of destroying
// it silently or blocking the link behind a modal.
function hasLocalScenario(){
  const rawPeople=parseStored(readStorage(KEY.people));
  if(!Array.isArray(rawPeople)||!rawPeople.length)return false;
  const people=rawPeople.map(normalizePerson).filter(Boolean);
  if(!people.length)return false;
  const defaults=defaultPeople();
  const samePeople=people.length===defaults.length&&people.every((p,i)=>
    !p.name&&p.walkMinutes===defaults[i].walkMinutes&&p.origin?.node===defaults[i].origin?.node);
  const rawSettings=parseStored(readStorage(KEY.settings));
  const settings=buildSettings(rawSettings,Array.isArray(rawSettings?.modes)?rawSettings.modes:null);
  const sameSettings=JSON.stringify(settings)===JSON.stringify(buildSettings(null,null));
  return !(samePeople&&sameSettings);
}
function backupLocalScenario(){
  writeStorage(KEY.previousScenario,JSON.stringify({
    people:readStorage(KEY.people),settings:readStorage(KEY.settings),
    locale:readStorage(KEY.locale),selection:readStorage(SELECTION_KEY),
  }));
}
function restoreLocalScenario(){
  const backup=parseStored(readStorage(KEY.previousScenario));
  if(!backup)return;
  for(const [key,value] of Object.entries({[KEY.people]:backup.people,[KEY.settings]:backup.settings,[KEY.locale]:backup.locale,[SELECTION_KEY]:backup.selection})){
    if(value!==null&&value!==undefined)writeStorage(key,value);
  }
  writeStorage(KEY.previousScenario,JSON.stringify({}));
  location.reload();
}
function readStorage(key){
  try{return localStorage.getItem(key);}
  catch(err){console.error(err);return null;}
}
function writeStorage(key,value){
  try{localStorage.setItem(key,value);}
  catch(err){console.error(err);}
}
function parseStored(raw){
  if(raw==null)return null;
  try{return JSON.parse(raw);}
  catch(err){console.error(err);return null;}
}
// Catalogues are loaded asynchronously, so the template set is memoised once
// and rebuilt only when the English or locale catalogue set actually changes.
// That keeps isDefaultName() allocation-free without freezing a stale set.
const DEFAULT_NAME_TEMPLATE='Person {letter}';
let defaultTemplatesCache=null,defaultTemplatesKey='';
function defaultTemplates(){
  const catalogues=store.I18N||{},codes=Object.keys(catalogues),english=store.EN?.['people.defaultName'];
  const key=JSON.stringify([english,codes,codes.map(code=>catalogues[code]?.['people.defaultName'])]);
  if(key!==defaultTemplatesKey){
    defaultTemplatesKey=key;
    defaultTemplatesCache=[DEFAULT_NAME_TEMPLATE,english,...codes.map(code=>catalogues[code]?.['people.defaultName'])]
      .filter(template=>typeof template==='string'&&template);
  }
  return defaultTemplatesCache;
}
// An unset name is a placeholder for the current locale. Literal defaults
// written by older releases are also unset, but only when they match the
// person's current slot: a saved profile genuinely called "Person B" must not
// be renumbered to "Person D" when it is added as the fourth person.
export function isDefaultName(value,i){
  const name=String(value??'').trim();
  if(!name)return true;
  const letters=Number.isInteger(i)?[LETTERS[Math.max(0,i)%LETTERS.length]]:[...LETTERS];
  return defaultTemplates().some(template=>letters.some(letter=>template.replaceAll('{letter}',letter)===name));
}
function cleanName(value,i){return isDefaultName(value,i)?'':String(value??'').trim();}

export function defaultName(i){return t('people.defaultName',{letter:LETTERS[i%LETTERS.length]});}
export const normIncludeHeadway=value=>value===false?false:true;
// Person ids are 'p<n>' and directory ids 'd<n>'. Validate the whole shape
// instead of stripping arbitrary non-digits, so 'p-12x' cannot become id 12.
export function parsePersonSequence(id){
  const match=/^[pd](\d+)$/.exec(String(id??''));
  if(!match)return 0;
  const value=Number(match[1]);
  return Number.isSafeInteger(value)&&value>=0?value:0;
}
export function nextSeq(people){return Math.max(1,...people.map(p=>parsePersonSequence(p?.id)))+1;}
function buildSettings(stored,modes){
  stored=stored&&typeof stored==='object'?stored:{};
  return{modes:Array.isArray(modes)&&modes.length?modes:['rail','bus'],fairness:FAIRNESS_METRICS.includes(stored.fairness)?stored.fairness:FAIRNESS_DEFAULT,tolerance:travelTolerance(stored.tolerance),fareTolerance:fareTolerance(stored.fareTolerance),includeHeadway:normIncludeHeadway(stored.includeHeadway),vectors:migrateVectors(stored.vectors),beta:{vectors:!!stored.beta?.vectors}};
}
export function displayName(person,i){
  const index=Number.isInteger(i)?i:Math.max(0,store.people.indexOf(person));
  return cleanName(person?.name,index)||defaultName(index);
}
export function profileLabel(profile){return profile.origin?.label||t('people.hintEmpty');}
export function profileDistrict(profile){return profile.origin?.district||districtFor(profile.origin?.lat,profile.origin?.lon);}
export function normalizePerson(raw,i){
  if(!raw)return null;
  const origin=raw.origin||null;
  const validNode=origin&&origin.kind==='node'&&Number.isInteger(origin.node)&&origin.node>=0&&store.NODES&&origin.node<store.NODES.names.length;
  const validCoords=origin&&origin.kind==='coords'&&isNum(origin.lat)&&isNum(origin.lon)&&origin.lat>=HK_BBOX[1]&&origin.lat<=HK_BBOX[3]&&origin.lon>=HK_BBOX[0]&&origin.lon<=HK_BBOX[2];
  if(!validNode&&!validCoords)return null;
  return{id:`p${i+1}`,name:cleanName(raw.name,i),origin,directoryId:raw.directoryId||null,walkMinutes:snapWalkMinutes(raw.walkMinutes)};
}
export function defaultPeople(){
  return ['Tsuen Wan','North Point'].map((name,i)=>{
    const node=findExact(name);
    return{id:`p${i+1}`,name:'',walkMinutes:20,origin:node==null?null:{kind:'node',node,label:store.NODES.names[node],lat:store.NODES.lat[node],lon:store.NODES.lon[node],district:districtFor(store.NODES.lat[node],store.NODES.lon[node])}};
  }).filter(p=>p.origin);
}
export function save(){
  writeStorage(KEY.people,JSON.stringify(store.people.map((p,i)=>({id:p.id,name:cleanName(p.name,i),origin:p.origin,directoryId:p.directoryId||null,walkMinutes:snapWalkMinutes(p.walkMinutes)}))));
  store.settings.includeHeadway=normIncludeHeadway(store.settings.includeHeadway);
  writeStorage(KEY.settings,JSON.stringify(store.settings));
  writeStorage(KEY.locale,store.locale);
}
export function saveDirectory(){
  store.directory.forEach((p,i)=>{p.name=cleanName(p.name,i)||displayName({name:''},i);});
  writeStorage(KEY.directory,JSON.stringify(store.directory));
}
export function profileFromPerson(person){
  const index=Math.max(0,store.people.indexOf(person));
  const name=String(person?.name??'').trim()||displayName(person,index);
  const profile={id:person.directoryId||`d${store.directorySeq++}`,name,origin:clone(person.origin),walkMinutes:snapWalkMinutes(person.walkMinutes),updated:Date.now()};
  person.directoryId=profile.id;
  return profile;
}
export function restoreState(){
  loadGeoCache();
  let loaded=false;
  try{
    const raw=parseStored(readStorage(KEY.people));
    if(Array.isArray(raw)&&raw.length){store.people=raw.map(normalizePerson).filter(Boolean);loaded=store.people.length>0;}
  }catch(err){console.error(err);}
  if(!loaded){
    try{
      const raw=parseStored(readStorage(KEY.oldLoc));
      if(Array.isArray(raw)&&raw.length){store.people=raw.map((l,i)=>({id:`p${i+1}`,name:'',walkMinutes:20,origin:l.i!=null&&store.NODES&&l.i<store.NODES.names.length?{kind:'node',node:l.i,label:l.name,lat:l.lat,lon:l.lon}:null})).filter(p=>p.origin);loaded=store.people.length>0;}
    }catch(err){console.error(err);}
  }
  if(!loaded||store.people.length<1)store.people=defaultPeople();
  store.seq=nextSeq(store.people);
  const stored=parseStored(readStorage(KEY.settings));
  let modes=Array.isArray(stored?.modes)?stored.modes:null;
  if(!modes){const legacy=parseStored(readStorage(KEY.oldModes));if(Array.isArray(legacy))modes=legacy;}
  store.settings=buildSettings(stored,modes);
  applySettingsToDom();
  save();
}
export function restoreDirectory(){
  let entries=null;
  try{
    const raw=readStorage(KEY.directory);
    if(raw!==null){const parsed=JSON.parse(raw);if(Array.isArray(parsed))entries=parsed;}
  }catch(err){console.error(err);}
  store.directory=entries?entries.filter(p=>p&&p.origin).map((p,i)=>({
    id:p.id||`d${Date.now()}`,name:cleanName(p.name,i)||displayName({name:''},i),origin:p.origin,
    walkMinutes:snapWalkMinutes(p.walkMinutes),updated:p.updated||Date.now(),
  })):store.people.map(profileFromPerson);
  store.directorySeq=nextSeq(store.directory);
  store.people.forEach((person,i)=>{
    if(person.directoryId&&store.directory.some(profile=>profile.id===person.directoryId))return;
    const match=store.directory.find((profile,j)=>displayName(profile,j)===displayName(person,i)&&profile.origin?.label===person.origin?.label);
    if(match)person.directoryId=match.id;
  });
  saveDirectory();
  save();
}
export function normalizeSelection(value){
  if(!value||typeof value!=='object')return null;
  if(value.kind==='result')return{kind:'result',index:Math.max(0,Math.round(Number(value.index)||0))};
  if(value.kind==='cell'&&typeof value.key==='string')return{kind:'cell',key:value.key,node:Number.isInteger(value.node)?value.node:undefined,lat:isNum(value.lat)?value.lat:undefined,lon:isNum(value.lon)?value.lon:undefined};
  if(value.kind==='point'&&isNum(value.lat)&&isNum(value.lon))return{kind:'point',lat:value.lat,lon:value.lon,node:Number.isInteger(value.node)?value.node:undefined};
  return null;
}
function readSelectionRecord(){
  const stored=parseStored(readStorage(SELECTION_KEY));
  if(!stored||typeof stored!=='object')return null;
  return 'selection' in stored||'sharedSelection' in stored?stored:{selection:stored,sharedSelection:null};
}
export function saveSelection(){
  writeStorage(SELECTION_KEY,JSON.stringify({selection:store.selection,sharedSelection:store.sharedSelection}));
}
export function readSavedSelection(){return normalizeSelection(readSelectionRecord()?.selection);}
export function restoreSelection(value=readSavedSelection(),shared=readSelectionRecord()?.sharedSelection){
  flushShareError();
  const selection=normalizeSelection(value);
  const pending=normalizeSelection(shared);
  if(!selection&&!pending)return false;
  if(selection)store.selection=selection;
  store.sharedSelection=pending||selection;
  if(selection?.kind==='point'&&store.unbounded)store.pointSelection={lat:selection.lat,lon:selection.lon,node:selection.node,label:t('map.pinnedPoint')};
  else if(selection?.kind!=='point')store.pointSelection=null;
  saveSelection();
  return true;
}
export async function copyText(text){
  if(navigator.clipboard?.writeText){await navigator.clipboard.writeText(text);return;}
  const input=document.createElement('textarea');
  input.value=text;input.setAttribute('readonly','');input.style.position='fixed';input.style.opacity='0';
  document.body.appendChild(input);input.select();
  const ok=document.execCommand('copy');input.remove();
  if(!ok)throw new Error('copy failed');
}
// The share-status timer belongs to the status element, not to an expando on
// the DOM node. A WeakMap keeps repeated share clicks from stacking timeouts.
const shareStatusTimers=new WeakMap();
const SHARE_STATUS_DURATION_MS=2500;
export async function shareScenario(){
  // Only share a selection the sender actually has. A setup copied before any
  // search must not make the recipient open an invented first result.
  const hasResults=Array.isArray(store.results)&&store.results.length>0;
  const selectedState=!hasResults?null:store.selection?.kind==='cell'
    ?{kind:'cell',key:store.selection.key,node:store.selection.node,lat:store.selection.lat,lon:store.selection.lon}
    :store.selection?.kind==='point'
      ?{kind:'point',node:store.selection.node,lat:store.selection.lat,lon:store.selection.lon}
      :{kind:'result',index:store.selected>=0?store.selected:0};
  const settings=clone(store.settings);
  settings.includeHeadway=normIncludeHeadway(settings.includeHeadway);
  const state={v:1,people:store.people.map(p=>({id:p.id,name:p.name,origin:p.origin,walkMinutes:snapWalkMinutes(p.walkMinutes)})),settings,locale:store.locale};
  if(selectedState)state.selected=selectedState;
  const url=`${location.origin}${location.pathname}${location.search}#s=${encodeBase64Url(state)}`;
  const button=$('share'),status=$('shareStatus');
  const report=message=>{
    flashTooltip(button,message);
    if(!status)return;
    const timer=shareStatusTimers.get(status);
    if(timer!==undefined)clearTimeout(timer);
    status.textContent=message;
    status.hidden=false;
    shareStatusTimers.set(status,setTimeout(()=>{
      status.hidden=true;status.textContent='';shareStatusTimers.delete(status);
    },SHARE_STATUS_DURATION_MS));
  };
  try{await copyText(url);report(t('share.copied'));}
  catch(err){console.error(err);report(t('share.failed'));}
}
const SHARE_HASH_PREFIX='#s=';
export function readHashState(){
  if(!location.hash.startsWith(SHARE_HASH_PREFIX))return null;
  try{
    const state=JSON.parse(decodeBase64Url(location.hash.slice(SHARE_HASH_PREFIX.length)));
    return state&&state.v===1&&Array.isArray(state.people)?state:null;
  }catch(err){
    console.error('Invalid share link',err);
    return null;
  }
}
function clearShareHash(){
  try{history.replaceState(null,'',location.pathname+location.search);}
  catch(err){console.error(err);}
}
export function applySharedState(){
  if(!location.hash.startsWith('#s='))return false;
  const state=readHashState();
  if(!state){flagShareError('share.invalid');clearShareHash();return false;}
  const sharedPeople=state.people.map(normalizePerson).filter(Boolean);
  if(!sharedPeople.length){flagShareError('share.invalid');clearShareHash();return false;}
  const replacing=hasLocalScenario();
  if(replacing)backupLocalScenario();
  const needTwo=sharedPeople.length<2;
  store.people=sharedPeople;
  const modes=Array.isArray(state.settings?.modes)?state.settings.modes.filter(m=>m==='rail'||m==='bus'):null;
  store.settings=buildSettings({...state.settings,includeHeadway:normIncludeHeadway(state.settings?.includeHeadway)},modes);
  if(LOCALES.includes(state.locale))store.locale=state.locale;
  store.sharedSelection=state.selected&&typeof state.selected==='object'?state.selected:null;
  // Old links without a selection should restore the setup without inventing
  // a selected result. compute()/applySelection() safely handle a null choice.
  store.selection=normalizeSelection(store.sharedSelection);
  store.seq=nextSeq(store.people);
  save();
  saveSelection();
  // Consume the fragment as soon as it has been applied. Leaving it in the
  // URL made every later reload re-import the original link and silently undo
  // anything the recipient edited afterwards.
  clearShareHash();
  if(replacing)showActionStatus(t('share.replaced'),{actionLabel:t('share.undo'),onAction:restoreLocalScenario,duration:12000});
  if(needTwo)flagShareError('error.needTwo');
  return true;
}
