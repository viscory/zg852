import * as L from 'leaflet';
import { maplibreGL } from './vendor/leaflet-maplibre-gl.mjs';

const ACCENT='#10B981';
const PERSON_COLORS=['#F97316','#38BDF8','#C084FC','#FACC15','#34D399','#FB7185','#22D3EE','#A3E635'];
const HEAT_COLORS=['#064E3B','#047857','#059669','#10B981','#34D399','#6EE7B7'];
const LETTERS='ABCDEFGH';
const LOCALES=['en','zh-Hant','zh-Hans','ja','ko','hi','ur','fil','id','fr','th','vi','ne','es','de'];
const RTL_LOCALES=new Set(['ur']);
const KEY={people:'hkfair.v2.people',settings:'hkfair.v2.settings',geocache:'hkfair.v2.geocache',directory:'hkfair.v2.directory',locale:'hkfair.v2.locale',oldLoc:'hkfair.v1.locations',oldModes:'hkfair.v1.modes',oldWeight:'hkfair.v1.weight',oldRecent:'hkfair.v1.recent'};
const HK_BBOX='113.83,22.15,114.45,22.58';
const HK_CENTER={lat:22.31,lon:114.17};
const ACCESS_RADIUS_M=1200;
const MAX_ACCESS_NODES=12;
const CELL_SIZE=0.005;
const WALK_SPEED_KMH=4.5;
const WALK_DETOUR=1.3;
const MAX_CLOUD_CELLS=600;
const VECTOR_KEYS=['food','drinks','activities','culture','outdoors','shopping'];
const VECTOR_BONUS_MINUTES=6;
const RECOMPUTE_DELAY=500;
const CLEAN_STYLE={
  version:8,
  name:'zg852 clean',
  sources:{openmaptiles:{type:'vector',url:'https://tiles.openfreemap.org/planet',attribution:'© OpenStreetMap contributors, OpenFreeMap, © OpenMapTiles'}},
  layers:[
    {id:'background',type:'background',paint:{'background-color':'#eef0ed'}},
    {id:'park',type:'fill',source:'openmaptiles','source-layer':'park',filter:['match',['geometry-type'],['MultiPolygon','Polygon'],true,false],paint:{'fill-color':'#dfe7dc'}},
    {id:'water',type:'fill',source:'openmaptiles','source-layer':'water',filter:['all',['match',['geometry-type'],['MultiPolygon','Polygon'],true,false],['!=',['get','brunnel'],'tunnel']],paint:{'fill-antialias':true,'fill-color':'#c3ced2'}},
    {id:'waterway',type:'line',source:'openmaptiles','source-layer':'waterway',filter:['match',['geometry-type'],['LineString','MultiLineString'],true,false],paint:{'line-color':'#c3ced2'}},
    {id:'landuse_residential',type:'fill',source:'openmaptiles','source-layer':'landuse',maxzoom:16,filter:['all',['match',['geometry-type'],['MultiPolygon','Polygon'],true,false],['==',['get','class'],'residential']],paint:{'fill-color':'#e7e7e2','fill-opacity':0.8}},
    {id:'landcover_wood',type:'fill',source:'openmaptiles','source-layer':'landcover',minzoom:10,filter:['all',['match',['geometry-type'],['MultiPolygon','Polygon'],true,false],['==',['get','class'],'wood']],paint:{'fill-color':'#d7ded5','fill-opacity':0.9}},
    {id:'building',type:'fill',source:'openmaptiles','source-layer':'building',minzoom:12,paint:{'fill-antialias':true,'fill-color':'#e3e3de','fill-outline-color':'#d4d4d0'}},
    {id:'road_area_pier',type:'fill',source:'openmaptiles','source-layer':'transportation',filter:['all',['match',['geometry-type'],['MultiPolygon','Polygon'],true,false],['==',['get','class'],'pier']],paint:{'fill-antialias':true,'fill-color':'#eef0ed'}},
    {id:'highway_path',type:'line',source:'openmaptiles','source-layer':'transportation',filter:['all',['match',['geometry-type'],['LineString','MultiLineString'],true,false],['==',['get','class'],'path']],layout:{'line-cap':'round','line-join':'round'},paint:{'line-color':'#d8d8d4','line-opacity':0.9,'line-width':1}},
    {id:'highway_minor',type:'line',source:'openmaptiles','source-layer':'transportation',minzoom:8,filter:['all',['match',['geometry-type'],['LineString','MultiLineString'],true,false],['match',['get','class'],['minor','service','track'],true,false]],layout:{'line-cap':'round','line-join':'round'},paint:{'line-color':'#ffffff','line-opacity':0.95,'line-width':['interpolate',['exponential',1.55],['zoom'],13,1.8,20,20]}},
    {id:'highway_major_casing',type:'line',source:'openmaptiles','source-layer':'transportation',minzoom:11,filter:['all',['match',['geometry-type'],['LineString','MultiLineString'],true,false],['match',['get','class'],['primary','secondary','tertiary','trunk'],true,false]],layout:{'line-cap':'butt','line-join':'miter'},paint:{'line-color':'#d5d5d5','line-width':['interpolate',['exponential',1.3],['zoom'],10,3,20,23]}},
    {id:'highway_major_inner',type:'line',source:'openmaptiles','source-layer':'transportation',minzoom:11,filter:['all',['match',['geometry-type'],['LineString','MultiLineString'],true,false],['match',['get','class'],['primary','secondary','tertiary','trunk'],true,false]],layout:{'line-cap':'round','line-join':'round'},paint:{'line-color':'#ffffff','line-width':['interpolate',['exponential',1.3],['zoom'],10,2,20,20]}},
    {id:'highway_motorway_casing',type:'line',source:'openmaptiles','source-layer':'transportation',minzoom:6,filter:['all',['match',['geometry-type'],['LineString','MultiLineString'],true,false],['all',['match',['get','brunnel'],['bridge','tunnel'],false,true],['==',['get','class'],'motorway']]],layout:{'line-cap':'butt','line-join':'miter'},paint:{'line-color':'#d5d5d5','line-width':['interpolate',['exponential',1.4],['zoom'],5.8,0,6,3,20,40]}},
    {id:'highway_motorway_inner',type:'line',source:'openmaptiles','source-layer':'transportation',minzoom:6,filter:['all',['match',['geometry-type'],['LineString','MultiLineString'],true,false],['all',['match',['get','brunnel'],['bridge','tunnel'],false,true],['==',['get','class'],'motorway']]],layout:{'line-cap':'round','line-join':'round'},paint:{'line-color':'#ffffff','line-width':['interpolate',['exponential',1.4],['zoom'],4,2,6,1.3,20,30]}},
    {id:'railway',type:'line',source:'openmaptiles','source-layer':'transportation',minzoom:13,filter:['all',['match',['geometry-type'],['LineString','MultiLineString'],true,false],['all',['!',['has','service']],['==',['get','class'],'rail']]],layout:{'line-join':'round'},paint:{'line-color':'#b9bdc0','line-width':['interpolate',['exponential',1.3],['zoom'],16,3,20,7]}},
    {id:'railway_dashline',type:'line',source:'openmaptiles','source-layer':'transportation',minzoom:13,filter:['all',['match',['geometry-type'],['LineString','MultiLineString'],true,false],['all',['!',['has','service']],['==',['get','class'],'rail']]],layout:{'line-join':'round'},paint:{'line-color':'#ffffff','line-dasharray':[3,3],'line-width':['interpolate',['exponential',1.3],['zoom'],16,2,20,6]}},
    {id:'boundary',type:'line',source:'openmaptiles','source-layer':'boundary',minzoom:8,filter:['all',['==',['typeof',['get','admin_level']],'number'],['>=',['get','admin_level'],3],['<=',['get','admin_level'],6],['!=',['get','maritime'],1]],paint:{'line-color':'#c2c5c7','line-dasharray':[1,1],'line-width':1}}
  ]
};

let NODES=null,NET=null,walkAdj=null,rideAdj=null,nodeLines=null,surface=[];
let people=[],directory=[],settings={modes:['rail','bus'],tolerance:0.1,budget:60,vectors:null,beta:{vectors:false}},seq=1,directorySeq=1,pendingDelete=null,lastDialogFocus=null;
let results=[],cloudCells=[],sols=[],activePeople=[],selected=0;
let selection={kind:'result',index:0},sharedSelection=null;
let map,cloudLayer,routeLayer,pointLayer,originLayer;
let geoCache={},pinTarget=null;
let POI=null,poiLoaded=false,poiLoading=null,recomputeTimer=null,workSeq=0,hoverCell=null,tooltipTimer=null;
let locale='en',EN={},I18N={},DISTRICTS=[];
let lastAreaCount=0,lastComputeMs='0';

const $=id=>document.getElementById(id);
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const ICONS={globe:'globe',up:'arrow-up',down:'arrow-down',pin:'map-pin',centre:'scan',save:'bookmark-plus',remove:'trash-2',add:'plus',library:'users',search:'search',reset:'rotate-ccw',edit:'pencil',close:'x',rail:'train-front',bus:'bus',share:'share'};
const icon=name=>`<span class="icon icon-${ICONS[name]}" aria-hidden="true"></span>`;
const personColor=i=>PERSON_COLORS[i%PERSON_COLORS.length];
const initialsFor=name=>{const parts=String(name||'').trim().split(/\s+/).filter(Boolean);return (parts.length?parts.slice(0,2).map(part=>part[0]).join(''):'?').toUpperCase();};
const avatarStyle=i=>`--person:${personColor(i)};color:${personColor(i)};border-color:${personColor(i)};background:${personColor(i)}22`;
const clamp=(v,lo,hi,fallback)=>Number.isFinite(v)?Math.min(hi,Math.max(lo,v)):fallback;
const isNum=v=>typeof v==='number'&&Number.isFinite(v);
const clone=v=>JSON.parse(JSON.stringify(v));
function defaultVectors(){return Object.fromEntries(VECTOR_KEYS.map(k=>[k,0]));}
function betaVectorsEnabled(){return !!(settings.beta&&settings.beta.vectors);}
function applyBetaFeatures(){
  const enabled=betaVectorsEnabled();
  const input=$('betaVectors');if(input)input.checked=enabled;
  const section=$('vectorSection');if(section)section.hidden=!enabled;
  const legendKey=$('legendVectorKey');if(legendKey)legendKey.hidden=!enabled;
  if(!enabled){POI={cells:{}};poiLoaded=false;}
}
function normalizeVectors(raw){
  const fallback=defaultVectors();
  if(!raw||typeof raw!=='object')return fallback;
  for(const key of VECTOR_KEYS)fallback[key]=Math.round(clamp(Number(raw[key]),-3,3,0));
  return fallback;
}
function migrateVectors(raw){
  if(raw&&typeof raw==='object'&&VECTOR_KEYS.every(key=>Number(raw[key])===1))return defaultVectors();
  return normalizeVectors(raw);
}
function vectorLabel(value){
  const amount=Number(value)||0;
  if(!amount)return t('vector.off');
  return amount<0?t('vector.avoid',{value:Math.abs(amount)}):t('vector.prefer',{value:amount});
}
function preferenceText(value){
  const amount=round1(Math.abs(value));
  if(value>0.05)return t('results.preferenceUp',{value:num(amount)});
  if(value<-0.05)return t('results.preferenceDown',{value:num(amount)});
  return t('results.preferenceNone');
}
function round1(value){return Math.round(value*10)/10;}
function round2(value){return Math.round(value*100)/100;}

function t(key,vars={}){
  const source=I18N[locale]||EN;
  let value=source[key]??EN[key]??key;
  for(const [k,v] of Object.entries(vars))value=value.replaceAll(`{${k}}`,String(v));
  return value;
}
function tp(key,count,vars={}){
  const category=new Intl.PluralRules(locale).select(count);
  const pluralKey=`${key}_${category}`;
  return t((I18N[locale]||EN)[pluralKey]?pluralKey:key,{count,...vars});
}
function num(value){return new Intl.NumberFormat(locale,{maximumFractionDigits:1}).format(value);}
function minuteText(value){return `${num(value)} ${tp('unit.min',value)}`;}
function setDocumentLocale(){
  document.documentElement.lang=locale;
  document.documentElement.dir=RTL_LOCALES.has(locale)?'rtl':'ltr';
  document.body.classList.toggle('rtl',RTL_LOCALES.has(locale));
  const select=$('locale');if(select)select.value=locale;
}
function applyStaticText(){
  document.title=t('app.title');
  document.querySelectorAll('[data-i18n]').forEach(el=>{el.textContent=t(el.dataset.i18n);});
  document.querySelectorAll('[data-i18n-placeholder]').forEach(el=>{el.placeholder=t(el.dataset.i18nPlaceholder);});
  document.querySelectorAll('[data-i18n-aria-label]').forEach(el=>{el.setAttribute('aria-label',t(el.dataset.i18nAriaLabel));});
  document.querySelectorAll('[data-i18n-title]').forEach(el=>{el.title=t(el.dataset.i18nTitle);});
  document.querySelectorAll('[data-i18n-tooltip]').forEach(el=>{const value=t(el.dataset.i18nTooltip);el.dataset.tooltip=value;el.title=value;});
  const status=$('netstatus');if(status)status.textContent=NET?t('status.ready'):t('status.loading');
  setDocumentLocale();
}
function detectLocale(){
  const candidates=navigator.languages&&navigator.languages.length?navigator.languages:[navigator.language||'en'];
  for(const candidate of candidates){
    const exact=LOCALES.find(l=>l.toLowerCase()===candidate.toLowerCase());
    if(exact)return exact;
    const low=candidate.toLowerCase();
    if(low.startsWith('zh'))return /hant|hk|tw|mo/.test(low)?'zh-Hant':'zh-Hans';
    const short=low.split('-')[0];
    const match=LOCALES.find(l=>l.toLowerCase()===short||l.toLowerCase().startsWith(`${short}-`));
    if(match)return match;
  }
  return 'en';
}
async function ensureCatalog(code){
  if(I18N[code])return I18N[code];
  const res=await fetch(`i18n/${code}.json`);
  if(!res.ok)throw new Error(`Missing catalogue: ${code}`);
  I18N[code]=await res.json();
  return I18N[code];
}
async function changeLocale(code){
  if(!LOCALES.includes(code)||code===locale)return;
  try{await ensureCatalog(code);}catch(e){code='en';await ensureCatalog('en');}
  locale=code;
  localStorage.setItem(KEY.locale,code);
  save();
  setDocumentLocale();
  rerender();
}
async function loadDistricts(){
  DISTRICTS=await fetch('data/districts.json').then(r=>r.json());
}
async function loadPoi(){
  if(!betaVectorsEnabled()){POI={cells:{}};return null;}
  if(poiLoaded)return POI;
  if(poiLoading)return poiLoading;
  poiLoading=(async()=>{
    try{
      const response=await fetch('data/poi-index.json');
      if(!response.ok)throw new Error(`POI index ${response.status}`);
      POI=await response.json();
    }catch(err){console.error(err);POI={cells:{}};}
    poiLoaded=true;
    return POI;
  })();
  try{return await poiLoading;}finally{poiLoading=null;}
}
function districtFor(lat,lon){
  if(!DISTRICTS.length||!isNum(lat)||!isNum(lon))return t('district.unknown');
  let best=DISTRICTS[0],bestD=Infinity;
  for(const d of DISTRICTS){
    const distance=haversine(lat,lon,d.lat,d.lon);
    if(distance<bestD){best=d;bestD=distance;}
  }
  return best.name[locale]||best.name.en||t('district.unknown');
}

function haversine(lat1,lon1,lat2,lon2){
  const r=Math.PI/180,dlat=(lat2-lat1)*r,dlon=(lon2-lon1)*r;
  const a=Math.sin(dlat/2)**2+Math.cos(lat1*r)*Math.cos(lat2*r)*Math.sin(dlon/2)**2;
  return 2*6371000*Math.asin(Math.sqrt(a));
}
function walkMinutes(metres){return metres/1000/WALK_SPEED_KMH*60*WALK_DETOUR+1;}
function defaultName(i){return t('people.defaultName',{letter:LETTERS[i%8]});}
function displayName(person,i){return (person?.name||'').trim()||defaultName(i);}
function nodePriority(kind){return kind===1?0:kind===3?1:kind===4?2:3;}
function catKey(priority){return priority===0?'station':priority===1?'exit':'bus';}

class MinHeap{
  constructor(){this.d=[];this.k=[];}
  get size(){return this.d.length;}
  push(d,k){let i=this.d.length;this.d.push(d);this.k.push(k);
    while(i>0){const p=(i-1)>>1;if(this.d[p]<=this.d[i])break;
      [this.d[p],this.d[i]]=[this.d[i],this.d[p]];[this.k[p],this.k[i]]=[this.k[i],this.k[p]];i=p;}}
  pop(){const d=this.d[0],k=this.k[0],n=this.d.length-1;
    this.d[0]=this.d[n];this.k[0]=this.k[n];this.d.pop();this.k.pop();let i=0;
    while(true){let l=i*2+1,r=l+1,s=i;
      if(l<n&&this.d[l]<this.d[s])s=l;if(r<n&&this.d[r]<this.d[s])s=r;if(s===i)break;
      [this.d[s],this.d[i]]=[this.d[i],this.d[s]];[this.k[s],this.k[i]]=[this.k[i],this.k[s]];i=s;}
    return[d,k];}
}

function showError(message){const el=$('error');el.textContent=message;el.hidden=false;}
function clearError(){const el=$('error');el.textContent='';el.hidden=true;}
function updateSaveSummary(){
  const el=$('saveSummary');if(!el)return;
  el.textContent=t('people.summary',{count:people.length,names:people.map((p,i)=>displayName(p,i)).join(', ')});
}
function updateSettingsLabels(){
  $('tolval').textContent=`${Math.round(settings.tolerance*100)}%`;
  $('budgetval').textContent=minuteText(settings.budget);
  settings.vectors=normalizeVectors(settings.vectors);
  VECTOR_KEYS.forEach(key=>{const label=$(`vec-${key}-val`);if(label)label.textContent=vectorLabel(settings.vectors[key]);});
}
function applySettingsToDom(){
  document.querySelectorAll('.chip').forEach(c=>c.setAttribute('aria-pressed',String(settings.modes.includes(c.dataset.mode))));
  $('tolerance').value=settings.tolerance;
  $('budget').value=settings.budget;
  settings.vectors=normalizeVectors(settings.vectors);
  document.querySelectorAll('[data-vector]').forEach(input=>{input.value=settings.vectors[input.dataset.vector];});
  applyBetaFeatures();
  updateSettingsLabels();
}
function readSettingsFromDom(){
  settings.modes=[...document.querySelectorAll('.chip[aria-pressed="true"]')].map(c=>c.dataset.mode);
  settings.tolerance=Number($('tolerance').value);
  settings.budget=Number($('budget').value);
  settings.beta={vectors:$('betaVectors').checked};
  const vectors=normalizeVectors(settings.vectors);
  document.querySelectorAll('[data-vector]').forEach(input=>{vectors[input.dataset.vector]=Number(input.value);});
  settings.vectors=vectors;
  applyBetaFeatures();
  updateSettingsLabels();
  save();
  scheduleRecompute();
}
function save(){
  localStorage.setItem(KEY.people,JSON.stringify(people.map(p=>({id:p.id,name:p.name,origin:p.origin,directoryId:p.directoryId||null}))));
  localStorage.setItem(KEY.settings,JSON.stringify(settings));
  localStorage.setItem(KEY.locale,locale);
  updateSaveSummary();
}
function saveDirectory(){localStorage.setItem(KEY.directory,JSON.stringify(directory));}
function loadGeoCache(){
  try{const raw=JSON.parse(localStorage.getItem(KEY.geocache));if(raw&&typeof raw==='object'&&!Array.isArray(raw))geoCache=raw;}catch(e){}
}
function saveGeoCache(){
  try{localStorage.setItem(KEY.geocache,JSON.stringify(Object.fromEntries(Object.entries(geoCache).slice(-60))));}catch(e){}
}
function normalizePerson(raw,i){
  if(!raw)return null;
  const origin=raw.origin||null;
  const validNode=origin&&origin.kind==='node'&&Number.isInteger(origin.node)&&origin.node>=0&&NODES&&origin.node<NODES.names.length;
  const validCoords=origin&&origin.kind==='coords'&&isNum(origin.lat)&&isNum(origin.lon);
  if(!validNode&&!validCoords)return null;
  return{id:raw.id||`p${i+1}`,name:raw.name||defaultName(i),origin,directoryId:raw.directoryId||null};
}
function defaultPeople(){
  return ['Tsuen Wan','North Point'].map((name,i)=>{
    const node=findExact(name);
    return{id:`p${i+1}`,name:defaultName(i),origin:node==null?null:{kind:'node',node,label:NODES.names[node],lat:NODES.lat[node],lon:NODES.lon[node],district:districtFor(NODES.lat[node],NODES.lon[node])}};
  }).filter(p=>p.origin);
}
function decodeBase64Url(value){
  const base64=String(value).replace(/-/g,'+').replace(/_/g,'/');
  const padded=base64+'='.repeat((4-base64.length%4)%4);
  const binary=atob(padded);
  return new TextDecoder().decode(Uint8Array.from(binary,c=>c.charCodeAt(0)));
}
function encodeBase64Url(value){
  const bytes=new TextEncoder().encode(JSON.stringify(value));
  let binary='';
  bytes.forEach(byte=>{binary+=String.fromCharCode(byte);});
  return btoa(binary).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
}
function flashTooltip(element,message){
  if(!element)return;
  const original=element.dataset.tooltip||element.getAttribute('aria-label')||'';
  element.dataset.tooltip=message;element.title=message;element.setAttribute('aria-label',message);
  clearTimeout(element.tooltipTimer);
  element.tooltipTimer=setTimeout(()=>{element.dataset.tooltip=original;element.title=original;element.setAttribute('aria-label',original);},1600);
}
async function copyText(text){
  if(navigator.clipboard?.writeText){await navigator.clipboard.writeText(text);return;}
  const input=document.createElement('textarea');
  input.value=text;input.setAttribute('readonly','');input.style.position='fixed';input.style.opacity='0';
  document.body.appendChild(input);input.select();
  const ok=document.execCommand('copy');input.remove();
  if(!ok)throw new Error('copy failed');
}
async function shareScenario(){
  const selectedState=selection?.kind==='cell'
    ?{kind:'cell',key:selection.key,node:selection.node,lat:selection.lat,lon:selection.lon}
    :{kind:'result',index:selected>=0?selected:0};
  const state={v:1,people:people.map(p=>({id:p.id,name:p.name,origin:p.origin})),settings:clone(settings),locale,selected:selectedState};
  const url=`${location.origin}${location.pathname}${location.search}#s=${encodeBase64Url(state)}`;
  const button=$('share');
  try{await copyText(url);flashTooltip(button,t('share.copied'));}
  catch(err){console.error(err);flashTooltip(button,t('share.failed'));}
}
function readHashState(){
  if(!location.hash.startsWith('#s='))return null;
  try{
    const state=JSON.parse(decodeBase64Url(location.hash.slice(3)));
    return state&&state.v===1&&Array.isArray(state.people)?state:null;
  }catch(e){return null;}
}
function applySharedState(){
  const state=readHashState();
  if(!state)return false;
  const sharedPeople=state.people.map(normalizePerson).filter(Boolean);
  if(sharedPeople.length<2)return false;
  people=sharedPeople;
  const modes=Array.isArray(state.settings?.modes)?state.settings.modes.filter(m=>m==='rail'||m==='bus'):['rail','bus'];
  settings={modes:modes.length?modes:['rail','bus'],tolerance:clamp(Number(state.settings?.tolerance),0,0.5,0.1),budget:clamp(Number(state.settings?.budget),15,180,60),vectors:migrateVectors(state.settings?.vectors),beta:{vectors:!!state.settings?.beta?.vectors}};
  if(LOCALES.includes(state.locale))locale=state.locale;
  sharedSelection=state.selected&&typeof state.selected==='object'?state.selected:null;
  seq=Math.max(1,...people.map(p=>Number(String(p.id).replace(/\D/g,''))||0))+1;
  history.replaceState(null,'',location.pathname+location.search);
  return true;
}
function restoreState(){
  loadGeoCache();
  let loaded=false;
  try{
    const raw=JSON.parse(localStorage.getItem(KEY.people));
    if(Array.isArray(raw)&&raw.length>=2){people=raw.map(normalizePerson).filter(Boolean);loaded=true;}
  }catch(e){}
  if(!loaded||people.length<2){
    try{
      const raw=JSON.parse(localStorage.getItem(KEY.oldLoc));
      if(Array.isArray(raw)&&raw.length>=2){people=raw.map((l,i)=>({id:`p${i+1}`,name:defaultName(i),origin:l.i!=null&&NODES&&l.i<NODES.names.length?{kind:'node',node:l.i,label:l.name,lat:l.lat,lon:l.lon}:null})).filter(p=>p.origin);loaded=true;}
    }catch(e){}
  }
  if(people.length<2)people=defaultPeople();
  seq=Math.max(1,...people.map(p=>Number(String(p.id).replace(/\D/g,''))||0))+1;
  let stored=null;
  try{stored=JSON.parse(localStorage.getItem(KEY.settings));}catch(e){}
  if(!stored||typeof stored!=='object')stored={};
  let modes=Array.isArray(stored.modes)?stored.modes:null;
  if(!modes){try{const m=JSON.parse(localStorage.getItem(KEY.oldModes));if(Array.isArray(m))modes=m;}catch(e){}}
  settings={modes:modes||['rail','bus'],tolerance:clamp(Number(stored.tolerance),0,0.5,0.1),budget:clamp(Number(stored.budget),15,180,60),vectors:migrateVectors(stored.vectors),beta:{vectors:!!stored.beta?.vectors}};
  applySettingsToDom();
  save();
}
function restoreDirectory(){
  try{
    const raw=JSON.parse(localStorage.getItem(KEY.directory));
    if(Array.isArray(raw))directory=raw.filter(p=>p&&p.origin).map(p=>({id:p.id||`d${Date.now()}`,name:p.name||defaultName(0),origin:p.origin,updated:p.updated||Date.now()}));
  }catch(e){}
  if(!directory.length)directory=people.map(profileFromPerson);
  saveDirectory();
}
function profileFromPerson(person){
  return{id:person.directoryId||`d${directorySeq++}`,name:person.name||defaultName(0),origin:clone(person.origin),updated:Date.now()};
}
function savePersonToDirectory(person){
  if(!person.origin){showError(t('people.hintEmpty'));return;}
  const existing=directory.find(d=>d.id===person.directoryId)||directory.find(d=>d.name===person.name&&d.origin?.label===person.origin.label);
  if(existing){existing.name=person.name;existing.origin=clone(person.origin);existing.updated=Date.now();person.directoryId=existing.id;}
  else{const profile=profileFromPerson(person);directory.push(profile);person.directoryId=profile.id;}
  saveDirectory();save();renderDirectoryList();flashSaved(person.id);
}
function flashSaved(id){
  const card=document.querySelector(`.card[data-id="${CSS.escape(id)}"]`);if(!card)return;
  const hint=card.querySelector('.hint'),previous=hint.textContent;
  hint.textContent=t('people.saved');
  setTimeout(()=>{if(hint.isConnected)hint.textContent=previous;},1200);
}
function deleteDirectoryPerson(id){
  directory=directory.filter(d=>d.id!==id);
  people.forEach(p=>{if(p.directoryId===id)p.directoryId=null;});
  saveDirectory();save();renderDirectoryList();
}
function addDirectoryPerson(profile){
  if(people.length>=8||!profile)return;
  people.push({id:`p${seq++}`,name:profile.name,origin:clone(profile.origin),directoryId:profile.id});
  renderCards();save();
}
function editDirectoryPerson(profile){
  let person=people.find(p=>p.directoryId===profile.id);
  if(!person&&people.length<8){addDirectoryPerson(profile);person=people[people.length-1];}
  if(person){person.name=profile.name;person.origin=clone(profile.origin);}
  renderCards();save();
}
function profileLabel(profile){return profile.origin?.label||t('people.hintEmpty');}
function profileDistrict(profile){return profile.origin?.district||districtFor(profile.origin?.lat,profile.origin?.lon);}

function renderEmpty(){
  clearError();
  $('resultState').hidden=false;
  $('resultsList').hidden=true;
  $('resultsList').innerHTML='';
  $('nres').textContent='';
  $('detail').hidden=true;
  const runLabel=esc(t('results.emptyRun'));
  $('resultState').innerHTML=`<div class="empty-state"><p>${esc(t('results.empty'))}</p><button class="secondary wide-icon" id="emptyRun" type="button" aria-label="${runLabel}" title="${runLabel}" data-tooltip="${runLabel}">${icon('search')}<span class="sr-only">${runLabel}</span></button></div>`;
  $('emptyRun').onclick=triggerSearch;
}
function renderSkeleton(){
  clearError();
  $('resultState').hidden=false;
  $('resultsList').hidden=true;
  $('resultsList').innerHTML='';
  $('nres').textContent='';
  $('detail').hidden=true;
  $('resultState').innerHTML=Array.from({length:7},()=>'<div class="skeleton-row"><div class="skeleton"></div><div class="skeleton short"></div></div>').join('');
}
function setWorking(working){
  const label=working?t('options.searching'):t('options.search');
  const go=$('go');go.disabled=working;go.title=label;go.dataset.tooltip=label;go.setAttribute('aria-label',label);
  $('goLabel').textContent=label;
  if(working)renderSkeleton();
}

async function loadNodes(){
  NODES=await fetch('data/nodes.json').then(r=>r.json());
  surface=[];
  for(let i=0;i<NODES.names.length;i++)if(NODES.kind[i]===1||NODES.kind[i]===3||NODES.kind[i]===4)surface.push(i);
}
async function loadNetwork(){
  if(NET)return NET;
  NET=await fetch('data/network.json').then(r=>r.json());
  const n=NODES.names.length;
  walkAdj=Array.from({length:n},()=>[]);
  rideAdj=Array.from({length:n},()=>[]);
  nodeLines=Array.from({length:n},()=>[]);
  NET.walk.forEach(([a,b,d])=>{walkAdj[a].push([b,d]);walkAdj[b].push([a,d]);});
  NET.lines.forEach((line,li)=>{for(let i=0;i<line.s.length;i++){
    const node=line.s[i];nodeLines[node].push(li);
    if(i+1<line.s.length)rideAdj[node].push([li,line.s[i+1],line.e[i]]);
  }});
  $('netstatus').textContent=t('status.ready');
  return NET;
}
function findExact(name){
  for(let i=0;i<NODES.names.length;i++)if(NODES.names[i].toLowerCase()===String(name).toLowerCase()&&NODES.kind[i]===1)return i;
  return null;
}
function searchPlaces(q,limit=8){
  const ql=q.trim().toLowerCase();if(!ql||!NODES)return[];
  const exact=[],partial=[];
  for(const idx of surface){
    const low=NODES.names[idx].toLowerCase();
    if(low===ql)exact.push(idx);else if(low.includes(ql))partial.push(idx);
  }
  exact.sort((a,b)=>nodePriority(NODES.kind[a])-nodePriority(NODES.kind[b]));
  partial.sort((a,b)=>nodePriority(NODES.kind[a])-nodePriority(NODES.kind[b])||NODES.names[a].length-NODES.names[b].length);
  return exact.concat(partial).slice(0,limit).map(idx=>({
    kind:'local',node:idx,label:NODES.names[idx],tagKey:NODES.kind[idx]===1?'station':NODES.kind[idx]===3?'exit':'bus',
    lat:NODES.lat[idx],lon:NODES.lon[idx],district:districtFor(NODES.lat[idx],NODES.lon[idx]),count:1,
  }));
}
function formatPhoton(p){
  const name=p.name||'';
  const street=[p.housenumber,p.street].filter(Boolean).join(' ');
  const area=p.city||p.town||p.state||p.county||p.village||'';
  const parts=[];
  if(name)parts.push(name);
  if(street&&street!==name)parts.push(street);
  if(area&&!parts.includes(area))parts.push(area);
  if(p.country&&!/hong kong/i.test(p.country)&&!/香港/.test(p.country)&&!/香港/.test(area))parts.push(p.country);
  return parts.join(', ')||t('place.unnamed');
}
function photonTag(p){
  if(p.housenumber||p.street)return 'address';
  if(['amenity','tourism','shop','leisure'].includes(p.osm_key))return 'place';
  if(p.city||p.town)return 'city';
  return 'place';
}
function photonLang(){
  const map={'zh-Hant':'zh','zh-Hans':'zh',ja:'ja',ko:'ko',hi:'hi',ur:'ur',id:'id',fr:'fr',th:'th',vi:'vi',ne:'ne',es:'es',de:'de'};
  return map[locale]||'en';
}
async function photonSearch(q,signal){
  const key=q.trim().toLowerCase();
  if(geoCache[key])return geoCache[key];
  const url=new URL('https://photon.komoot.io/api/');
  url.searchParams.set('q',q);
  url.searchParams.set('limit','8');
  url.searchParams.set('lang',photonLang());
  url.searchParams.set('bbox',HK_BBOX);
  url.searchParams.set('lat',String(HK_CENTER.lat));
  url.searchParams.set('lon',String(HK_CENTER.lon));
  const res=await fetch(url.toString(),{signal});
  if(!res.ok)throw new Error(`Place search failed (${res.status})`);
  const json=await res.json();
  const items=(json.features||[]).map(f=>{
    const c=(f.geometry&&f.geometry.coordinates)||[],p=f.properties||{};
    return{kind:'remote',source:'photon',label:formatPhoton(p),tagKey:photonTag(p),lat:Number(c[1]),lon:Number(c[0]),osm:{type:p.osm_type,id:p.osm_id},district:districtFor(Number(c[1]),Number(c[0])),count:1};
  }).filter(x=>isNum(x.lat)&&isNum(x.lon));
  geoCache[key]=items;saveGeoCache();return items;
}
function normLabel(value){return value.toLowerCase().normalize('NFKD').replace(/[^\p{L}\p{N}]+/gu,' ').trim();}
function dedupePlaces(entries,limit=8){
  const out=[];
  for(const entry of entries){
    const key=normLabel(entry.label),tokens=new Set(key.split(' ').filter(Boolean));
    const duplicate=out.find(existing=>{
      const other=new Set(existing.key.split(' ').filter(Boolean));
      const shared=[...tokens].filter(v=>other.has(v)).length;
      const overlap=shared/Math.max(1,Math.min(tokens.size,other.size));
      const distance=haversine(entry.lat,entry.lon,existing.lat,existing.lon);
      return key===existing.key||distance<160&&overlap>=0.5;
    });
    if(duplicate){duplicate.count++;continue;}
    out.push({...entry,key,count:1});
    if(out.length>=limit)break;
  }
  return out;
}

function originHint(origin){
  if(!origin)return t('people.hintEmpty');
  if(origin.kind==='node')return t('people.hintTransit');
  if(origin.source==='photon')return t('people.hintAddress');
  return t('people.hintPin');
}
function setOrigin(person,place,hint,input,sug){
  if(place.kind==='local')person.origin={kind:'node',node:place.node,label:place.label,lat:place.lat,lon:place.lon,district:place.district||districtFor(place.lat,place.lon)};
  else person.origin={kind:'coords',source:place.source||'photon',label:place.label,lat:place.lat,lon:place.lon,osm:place.osm||null,district:place.district||districtFor(place.lat,place.lon)};
  if(input)input.value=place.label;
  if(hint)hint.textContent=originHint(person.origin);
  if(sug){sug.hidden=true;input?.setAttribute('aria-expanded','false');input?.removeAttribute('aria-activedescendant');}
  clearError();save();
}
function renderSuggestions(sug,entries,person,input,failed=false){
  const items=dedupePlaces(entries,8);
  sug.innerHTML='';
  let active=-1;
  const rows=()=>[...sug.querySelectorAll('.suggestion')];
  const highlight=next=>{
    const all=rows();if(!all.length)return;
    active=(next+all.length)%all.length;
    all.forEach((row,i)=>row.classList.toggle('active',i===active));
    all[active].scrollIntoView({block:'nearest'});
    input.setAttribute('aria-activedescendant',all[active].id);
  };
  if(failed){
    const d=document.createElement('div');d.className='suggestion-error';d.textContent=t('search.unavailable');sug.appendChild(d);
  }
  items.forEach((place,i)=>{
    const d=document.createElement('div');d.className='suggestion';d.id=`${sug.id}-option-${i}`;
    d.setAttribute('role','option');d.setAttribute('aria-selected','false');d.tabIndex=-1;
    d.innerHTML=`<span class="avatar" style="${avatarStyle(i)}">${esc(initialsFor(place.label))}</span><span class="place-main">${esc(place.label)}</span><span class="tag">${esc(t('tag.'+place.tagKey))}</span>${place.count>1?`<span class="tag">${esc(tp('place.stops',place.count))}</span>`:''}<span class="district">${esc(place.district||districtFor(place.lat,place.lon))}</span>`;
    const choose=()=>setOrigin(person,place,sug.parentElement.querySelector('.hint'),input,sug);
    d.onclick=choose;
    sug.appendChild(d);
  });
  sug.hidden=!items.length&&!failed;
  input.setAttribute('aria-expanded',String(!sug.hidden));
  input.onkeydown=e=>{
    if(e.key==='ArrowDown'){e.preventDefault();if(sug.hidden){sug.hidden=false;input.setAttribute('aria-expanded','true');}highlight(active+1);}
    else if(e.key==='ArrowUp'){e.preventDefault();highlight(active-1);}
    else if(e.key==='Home'){e.preventDefault();highlight(0);}
    else if(e.key==='End'){e.preventDefault();highlight(rows().length-1);}
    else if(e.key==='Enter'&&active>=0&&rows()[active]){e.preventDefault();rows()[active].click();}
    else if(e.key==='Escape'){sug.hidden=true;active=-1;input.setAttribute('aria-expanded','false');input.removeAttribute('aria-activedescendant');}
  };
}

function makeCard(person){
  const idx=people.indexOf(person),letter=LETTERS[idx%8];
  const id=person.id;
  const saveLabel=esc(t('people.save')),removeLabel=esc(t('people.remove',{letter})),pinLabel=esc(t('people.pin'));
  const upLabel=esc(t('people.moveUp',{name:displayName(person,idx)})),downLabel=esc(t('people.moveDown',{name:displayName(person,idx)}));
  const card=document.createElement('div');card.className='card';card.dataset.id=id;
  card.innerHTML=`<div class="card-head">
    <span class="avatar" style="${avatarStyle(idx)}">${esc(initialsFor(person.name))}</span>
    <div class="field">
      <label class="label" for="name-${id}">${esc(t('people.name',{letter}))}</label>
      <input class="name-input" id="name-${id}" type="text" placeholder="${esc(t('people.name',{letter}))}" value="${esc(person.name)}">
    </div>
    <div class="icon-actions">
      <button class="icon-button save-person" type="button" aria-label="${saveLabel}" title="${saveLabel}" data-tooltip="${saveLabel}">${icon('save')}</button>
      <button class="icon-button remove" type="button" aria-label="${removeLabel}" title="${removeLabel}" data-tooltip="${removeLabel}">${icon('remove')}</button>
    </div>
  </div>
  <div class="start-field field">
    <label class="label" for="start-${id}">${esc(t('people.start'))}</label>
    <div class="start-row">
      <input class="start-input" id="start-${id}" type="text" role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="suggest-${id}" placeholder="${esc(t('people.startPlaceholder'))}" value="${esc(person.origin?.label||'')}">
      <button class="icon-button pin" type="button" aria-label="${pinLabel}" title="${pinLabel}" data-tooltip="${pinLabel}">${icon('pin')}</button>
    </div>
    <span class="hint">${esc(originHint(person.origin))}</span>
  </div>
  <div class="card-tools">
    <button class="icon-button move up" type="button" aria-label="${upLabel}" title="${upLabel}" data-tooltip="${upLabel}" ${idx===0?'disabled':''}>${icon('up')}</button>
    <button class="icon-button move down" type="button" aria-label="${downLabel}" title="${downLabel}" data-tooltip="${downLabel}" ${idx===people.length-1?'disabled':''}>${icon('down')}</button>
  </div>
  <div class="suggestions" id="suggest-${id}" role="listbox" hidden></div>`;
  $('cards').appendChild(card);
  const nameInput=card.querySelector('#name-'+CSS.escape(id));
  const input=card.querySelector('#start-'+CSS.escape(id));
  const sug=card.querySelector('.suggestions'),hint=card.querySelector('.hint');
  let timer=null,controller=null,requestSeq=0;
  nameInput.addEventListener('input',()=>{person.name=nameInput.value;save();refreshMeta();});
  input.addEventListener('input',()=>{
    clearTimeout(timer);if(controller)controller.abort();
    const q=input.value.trim();
    if(q.length<2){sug.hidden=true;input.setAttribute('aria-expanded','false');return;}
    const local=dedupePlaces(searchPlaces(q,8),8);
    renderSuggestions(sug,local,person,input,false);
    if(q.length<3)return;
    const mine=++requestSeq;
    timer=setTimeout(async()=>{
      controller=new AbortController();
      try{
        const remote=await photonSearch(q,controller.signal);
        if(mine===requestSeq)renderSuggestions(sug,local.concat(remote),person,input,false);
      }catch(e){if(mine===requestSeq&&e.name!=='AbortError')renderSuggestions(sug,local,person,input,true);}
    },350);
  });
  card.querySelector('.save-person').onclick=()=>savePersonToDirectory(person);
  card.querySelector('.remove').onclick=()=>{people=people.filter(p=>p.id!==id);renderCards();save();};
  card.querySelector('.move.up').onclick=()=>movePerson(id,-1);
  card.querySelector('.move.down').onclick=()=>movePerson(id,1);
  card.querySelector('.pin').onclick=()=>startPinMode(id,hint,input,sug);
  refreshMeta();
}
function movePerson(id,delta){
  const i=people.findIndex(p=>p.id===id),j=i+delta;
  if(i<0||j<0||j>=people.length)return;
  [people[i],people[j]]=[people[j],people[i]];
  renderCards();save();
  document.querySelector(`.card[data-id="${CSS.escape(id)}"] .name-input`)?.focus();
}
function renderCards(){
  const saved=people.slice();people=[];
  $('cards').innerHTML='';
  saved.forEach(p=>{people.push(p);makeCard(p);});
  refreshMeta();
}
function refreshMeta(){
  $('count').textContent=people.length;
  $('add').disabled=people.length>=8;
  document.querySelectorAll('.card').forEach(card=>{
    const person=people.find(p=>p.id===card.dataset.id);if(!person)return;
    const idx=people.indexOf(person),letter=LETTERS[idx%8];
    const avatar=card.querySelector('.avatar');if(avatar){avatar.textContent=initialsFor(person.name);avatar.style.cssText=avatarStyle(idx);}
    const nameLabel=card.querySelector('label[for^="name-"]');if(nameLabel)nameLabel.textContent=t('people.name',{letter});
    const nameInput=card.querySelector('.name-input');if(nameInput)nameInput.placeholder=t('people.name',{letter});
    const startInput=card.querySelector('.start-input');if(startInput)startInput.placeholder=t('people.startPlaceholder');
    const setTooltip=(el,value)=>{if(!el)return;el.setAttribute('aria-label',value);el.title=value;el.dataset.tooltip=value;};
    const remove=card.querySelector('.remove');remove.hidden=people.length<=1;setTooltip(remove,t('people.remove',{letter}));
    setTooltip(card.querySelector('.pin'),t('people.pin'));
    const up=card.querySelector('.move.up'),down=card.querySelector('.move.down');
    if(up){up.disabled=idx===0;setTooltip(up,t('people.moveUp',{name:displayName(person,idx)}));}
    if(down){down.disabled=idx===people.length-1;setTooltip(down,t('people.moveDown',{name:displayName(person,idx)}));}
    setTooltip(card.querySelector('.save-person'),t('people.save'));
  });
  updateSaveSummary();
}
function clearPinMode(){
  pinTarget=null;
  $('map')?.classList.remove('pinning');
  $('pinBanner').hidden=true;
  hideTooltip();
}
function startPinMode(id,hint,input,sug){
  const idx=people.findIndex(p=>p.id===id);if(idx<0)return;
  pinTarget=id;
  $('map').classList.add('pinning');
  const banner=$('pinBanner'),avatar=$('pinAvatar'),label=$('pinLabel');
  avatar.textContent=initialsFor(displayName(people[idx],idx));
  avatar.style.cssText=avatarStyle(idx);
  label.textContent=t('map.pinActive',{name:displayName(people[idx],idx)});
  banner.hidden=false;
  if(sug){sug.hidden=true;input?.setAttribute('aria-expanded','false');}
  hideTooltip();
}
function setPinOrigin(id,lat,lon){
  const idx=people.findIndex(p=>p.id===id);if(idx<0)return;
  people[idx].origin={kind:'coords',source:'pin',label:`${t('people.pin')} ${num(lat)}, ${num(lon)}`,lat,lon,district:districtFor(lat,lon)};
  clearPinMode();
  renderCards();clearError();save();
}
function renderDirectoryList(){
  const list=$('directoryList');if(!list)return;
  const query=($('directorySearch')?.value||'').trim().toLowerCase();
  const items=directory.filter(p=>[p.name,profileLabel(p),profileDistrict(p)].join(' ').toLowerCase().includes(query));
  list.innerHTML=items.length?items.map(p=>{
    const addLabel=esc(t('people.libraryAdd')),editLabel=esc(t('people.libraryEdit')),deleteLabel=esc(pendingDelete===p.id?`${t('people.libraryDelete')}?`:t('people.libraryDelete'));
    return `<div class="directory-row" data-id="${esc(p.id)}" tabindex="0">
    <div class="directory-copy"><b>${esc(p.name)}</b><span>${esc(profileLabel(p))}</span><span class="district">${esc(profileDistrict(p))}</span></div>
    <div class="directory-actions">
      <button class="icon-button" type="button" data-action="add" aria-label="${addLabel}" title="${addLabel}" data-tooltip="${addLabel}">${icon('add')}</button>
      <button class="icon-button" type="button" data-action="edit" aria-label="${editLabel}" title="${editLabel}" data-tooltip="${editLabel}">${icon('edit')}</button>
      <button class="icon-button" type="button" data-action="delete" aria-label="${deleteLabel}" title="${deleteLabel}" data-tooltip="${deleteLabel}">${icon('remove')}</button>
    </div></div>`;}).join(''):`<div class="directory-empty">${esc(t('people.libraryEmpty'))}</div>`;
  list.querySelectorAll('button').forEach(button=>button.onclick=()=>{
    const row=button.closest('.directory-row'),profile=directory.find(d=>d.id===row?.dataset.id),action=button.dataset.action;
    if(action==='add'&&profile){addDirectoryPerson(profile);$('peopleDialog').close();}
    else if(action==='edit'&&profile){editDirectoryPerson(profile);$('peopleDialog').close();}
    else if(action==='delete'&&profile){
      if(pendingDelete===profile.id){deleteDirectoryPerson(profile.id);pendingDelete=null;}else{pendingDelete=profile.id;renderDirectoryList();}
    }
  });
  list.onkeydown=e=>{
    const rows=[...list.querySelectorAll('.directory-row')];if(!rows.length)return;
    const i=rows.indexOf(document.activeElement);
    if(e.key==='ArrowDown'){e.preventDefault();rows[Math.min(rows.length-1,i+1)].focus();}
    if(e.key==='ArrowUp'){e.preventDefault();rows[Math.max(0,i-1)].focus();}
  };
}
function openDirectory(){
  lastDialogFocus=document.activeElement;pendingDelete=null;
  renderDirectoryList();
  const dialog=$('peopleDialog');
  if(typeof dialog.showModal==='function')dialog.showModal();else dialog.setAttribute('open','');
  $('directorySearch').focus();
}

function solve(sources,mask,maxTime=180){
  const stride=NET.lines.length+1,key=(node,line)=>node*stride+(line+1),start=-1;
  const dist=new Map(),prev=new Map(),heap=new MinHeap();
  sources.forEach(({node,minutes})=>{
    const k=key(node,-1);
    if(minutes<=maxTime&&minutes<(dist.get(k)??Infinity)){dist.set(k,minutes);prev.set(k,start);heap.push(minutes,k);}
  });
  const relax=(k,d,from)=>{if(d>=(dist.get(k)??Infinity)||d>maxTime)return;dist.set(k,d);prev.set(k,from);heap.push(d,k);};
  while(heap.size){
    const[d,k]=heap.pop();if(d>(dist.get(k)??Infinity)||d>maxTime)continue;
    const node=Math.floor(k/stride),line=(k%stride)-1;
    if(line<0){
      for(const[to,time]of walkAdj[node])relax(key(to,-1),d+time,k);
      for(const li of nodeLines[node])if(mask&(1<<NET.lines[li].c))relax(key(node,li),d+NET.lines[li].w,k);
    }else{
      relax(key(node,-1),d,k);
      for(const[li,to,time]of rideAdj[node])if(li===line)relax(key(to,li),d+time,k);
    }
  }
  return{dist,prev,stride,key,start};
}
function bestTimes(sol){
  const best=new Float64Array(NODES.names.length).fill(Infinity);
  for(const[k,d]of sol.dist){const node=Math.floor(k/sol.stride);if(d<best[node])best[node]=d;}
  return best;
}
function sourcesFor(origin,budget){
  if(!origin)return[];
  if(origin.kind==='node'&&NODES&&origin.node>=0&&origin.node<NODES.names.length)return[{node:origin.node,minutes:0}];
  if(!isNum(origin.lat)||!isNum(origin.lon))return[];
  const near=[];
  for(const idx of surface)near.push([haversine(origin.lat,origin.lon,NODES.lat[idx],NODES.lon[idx]),idx]);
  near.sort((a,b)=>a[0]-b[0]);
  const within=near.filter(([d])=>d<=ACCESS_RADIUS_M).slice(0,MAX_ACCESS_NODES);
  const use=within.length?within:near.slice(0,3);
  return use.map(([d,idx])=>({node:idx,minutes:walkMinutes(d)})).filter(s=>s.minutes<=budget);
}
function dedupePath(path){
  return path.filter((p,i)=>i===0||Math.abs(p[0]-path[i-1][0])>1e-7||Math.abs(p[1]-path[i-1][1])>1e-7);
}
function describe(sol,origin,target){
  let bestK=sol.start,bestD=Infinity;
  for(let l=-1;l<NET.lines.length;l++){const k=sol.key(target,l),d=sol.dist.get(k);if(d!==undefined&&d<bestD){bestD=d;bestK=k;}}
  if(bestD===Infinity)return{text:t('route.unreachable'),legs:[],path:[[origin.lat,origin.lon]]};
  const chain=[];let k=bestK;
  while(k!==undefined&&k!==sol.start&&chain.length<4000){chain.push(k);k=sol.prev.get(k);}
  chain.reverse();
  const legs=[];let current=null,lastCoord=[origin.lat,origin.lon];
  const close=()=>{if(current&&(current.minutes>0.05||current.coords.length>1))legs.push(current);current=null;};
  chain.forEach((st,i)=>{
    const node=Math.floor(st/sol.stride),line=(st%sol.stride)-1;
    const pst=i===0?sol.start:chain[i-1];
    const priorDistance=pst===sol.start?0:(sol.dist.get(pst)??0);
    const stepT=(sol.dist.get(st)??0)-priorDistance;
    const coord=[NODES.lat[node],NODES.lon[node]];
    if(line<0){
      if(!current||current.mode!=='walk'){close();current={mode:'walk',line:'',minutes:0,coords:[lastCoord],to:NODES.names[node]};}
      current.minutes+=stepT;current.coords.push(coord);current.to=NODES.names[node];
    }else{
      const mode=NET.lines[line].c===0?'rail':'bus',label=NET.lines[line].l;
      if(!current||current.mode!==mode||current.line!==label){close();current={mode,line:label,minutes:0,coords:[lastCoord],to:NODES.names[node]};}
      current.minutes+=stepT;current.coords.push(coord);current.to=NODES.names[node];
    }
    lastCoord=coord;
  });
  close();
  const text=legs.map(leg=>t('route.leg',{mode:t('mode.'+leg.mode),line:leg.line,time:minuteText(leg.minutes)}).replace(/\s+/g,' ').trim()).join(' -> ')||t('route.already');
  const path=dedupePath(legs.flatMap(leg=>leg.coords));
  return{text,legs,path};
}
function buildCells(grids,tolerance,budget){
  const cells=new Map();
  for(const idx of surface){
    const times=grids.map(g=>g[idx]);
    if(times.some(v=>!isFinite(v)))continue;
    const fastest=Math.min(...times),slowest=Math.max(...times);
    if(slowest>budget||slowest>Math.max(fastest,5)*(1+tolerance))continue;
    const cy=Math.floor(NODES.lat[idx]/CELL_SIZE),cx=Math.floor(NODES.lon[idx]/CELL_SIZE),cellKey=`${cy},${cx}`;
    const score=slowest+(slowest-fastest),priority=nodePriority(NODES.kind[idx]);
    let cell=cells.get(cellKey);
    if(!cell){cells.set(cellKey,{key:cellKey,cy,cx,node:idx,label:NODES.names[idx],priority,keyCat:catKey(priority),times,fastest,slowest,gap:slowest-fastest,score});continue;}
    if(priority<cell.priority){cell.label=NODES.names[idx];cell.priority=priority;cell.keyCat=catKey(priority);}
    if(score<cell.score||score===cell.score&&slowest-fastest<cell.gap){cell.node=idx;cell.times=times;cell.fastest=fastest;cell.slowest=slowest;cell.gap=slowest-fastest;cell.score=score;}
  }
  return[...cells.values()].sort((a,b)=>a.score-b.score||a.gap-b.gap||a.key.localeCompare(b.key));
}
function cellVector(cell){
  const values=POI?.cells?.[cell.key]?.v;
  if(!values)return Object.fromEntries(VECTOR_KEYS.map(key=>[key,0]));
  return Object.fromEntries(VECTOR_KEYS.map(key=>[key,Number(values[key])||0]));
}
function cellCount(cell){
  const counts=POI?.cells?.[cell.key]?.n||{};
  return Object.fromEntries(VECTOR_KEYS.map(key=>[key,Number(counts[key])||0]));
}
function cellTopNames(cell){
  const top=POI?.cells?.[cell.key]?.top||{};
  return VECTOR_KEYS.flatMap(key=>top[key]||[]).slice(0,3);
}
function cellPreference(cell){
  if(!betaVectorsEnabled())return 0;
  const vectors=normalizeVectors(settings.vectors),values=cellVector(cell);
  const total=VECTOR_KEYS.reduce((sum,key)=>sum+Math.abs(vectors[key]),0);
  if(!total)return 0;
  const weighted=VECTOR_KEYS.reduce((sum,key)=>sum+vectors[key]*values[key],0);
  return round2(weighted/total*VECTOR_BONUS_MINUTES);
}
function cellRankScore(cell){return cell.score-cellPreference(cell);}
function renderResultCount(){
  const el=$('nres');if(!el)return;
  el.textContent=`${t('results.shown',{count:results.length})} ${t('results.areas',{count:lastAreaCount})} ${lastComputeMs}ms`;
}
function compute(){
  clearError();
  if(!NET){renderEmpty();showError(t('error.loading'));return;}
  if(people.some(p=>!p.origin)){renderEmpty();showError(t('error.missingOrigins'));return;}
  activePeople=people.filter(p=>p.origin);
  if(activePeople.length<2){renderEmpty();showError(t('error.needTwo'));return;}
  const mask=settings.modes.reduce((m,mode)=>m|(1<<(mode==='rail'?0:1)),0);
  if(!mask){renderEmpty();showError(t('error.noMode'));return;}
  const tolerance=Number($('tolerance').value),budget=Number($('budget').value);
  settings.tolerance=tolerance;settings.budget=budget;save();
  const sources=activePeople.map(p=>sourcesFor(p.origin,budget));
  if(sources.some(s=>!s.length)){renderEmpty();showError(t('error.noNearby'));return;}
  const t0=performance.now();
  sols=sources.map(s=>solve(s,mask,budget));
  if(sols.some(s=>!s.dist.size)){renderEmpty();showError(t('error.noReach'));return;}
  const grids=sols.map(bestTimes),cells=buildCells(grids,tolerance,budget);
  const ranked=cells.map(cell=>({cell,rankScore:cellRankScore(cell)})).sort((a,b)=>a.rankScore-b.rankScore||a.cell.score-b.cell.score||a.cell.key.localeCompare(b.cell.key));
  cloudCells=ranked.slice(0,MAX_CLOUD_CELLS).map(item=>item.cell);
  const round1=v=>Math.round(v*10)/10;
  results=ranked.slice(0,7).map(({cell:c})=>({
    key:c.key,node:c.node,label:c.label,catKey:c.keyCat,district:districtFor(NODES.lat[c.node],NODES.lon[c.node]),
    lat:NODES.lat[c.node],lon:NODES.lon[c.node],cellLat:c.cy*CELL_SIZE+CELL_SIZE/2,cellLon:c.cx*CELL_SIZE+CELL_SIZE/2,
    times:c.times.map(round1),fastest:round1(c.fastest),slowest:round1(c.slowest),gap:round1(c.gap),score:round1(c.score),
    fit:cellPreference(c),vector:cellVector(c),count:cellCount(c),
  }));
  results.forEach(r=>{
    r.routes=sols.map((s,j)=>describe(s,activePeople[j].origin,r.node));
    r.paths=r.routes.map(x=>x.path);
  });
  lastAreaCount=cells.length;
  lastComputeMs=(performance.now()-t0).toFixed(0);
  renderResultCount();
  if(!results.length){
    $('resultState').hidden=false;
    $('resultState').innerHTML=`<div class="empty-state"><p>${esc(t('results.noFit'))}</p></div>`;
    $('resultsList').hidden=true;$('resultsList').innerHTML='';$('detail').hidden=true;return;
  }
  $('resultState').hidden=true;$('resultsList').hidden=false;
  renderResults(activePeople);drawOrigins(activePeople);drawCloud(budget);applySelection(activePeople);
}
function renderResults(active){
  const maxT=Math.max(...results.flatMap(r=>r.times),1);
  $('resultsList').innerHTML=results.map((r,i)=>`<div class="result ${i===0?'active':''}" data-i="${i}" role="option" tabindex="${i===0?0:-1}" aria-selected="${i===0}">
    <div class="rank">${String(i+1).padStart(2,'0')}</div>
    <div class="body">
      <div class="title"><span>${esc(r.label)}</span><span class="score">${esc(t('results.score',{value:num(r.score)}))}</span></div>
      <div class="bars">${r.times.map((time,j)=>`<div class="barrow"><span class="who" style="${avatarStyle(j)}">${esc(initialsFor(displayName(active[j],j)))}</span>
        <div class="track"><div class="fill" style="width:${Math.max(2,time/maxT*100)}%;background:${PERSON_COLORS[j%PERSON_COLORS.length]}"></div></div>
         <span class="val">${esc(minuteText(time))}</span></div>`).join('')}</div>
         ${betaVectorsEnabled()?`<div class="fit-row"><span>${esc(preferenceText(r.fit))}</span><span class="fit-bars">${VECTOR_KEYS.map(key=>`<i class="fit-bar" title="${esc(t('vector.'+key))}" style="height:${Math.max(3,Math.round(Math.abs(r.vector?.[key]||0)*12))}px"></i>`).join('')}</span></div>`:''}


       <div class="result-foot"><span class="meta">${esc(t('results.spread',{value:num(r.gap)}))} ${esc(t('cat.'+r.catKey))}.</span><span class="district">${esc(r.district)}</span></div>

    </div></div>`).join('');
  document.querySelectorAll('.result').forEach((el,i)=>{
    el.onclick=()=>selectResult(i,active);
    el.onkeydown=e=>{
      if(e.key==='Enter'||e.key===' '){e.preventDefault();selectResult(i,active);}
      else if(e.key==='ArrowDown'){e.preventDefault();const next=Math.min(results.length-1,i+1);selectResult(next,active);document.querySelectorAll('.result')[next].focus();}
      else if(e.key==='ArrowUp'){e.preventDefault();const next=Math.max(0,i-1);selectResult(next,active);document.querySelectorAll('.result')[next].focus();}
      else if(e.key==='Home'){e.preventDefault();selectResult(0,active);document.querySelectorAll('.result')[0].focus();}
      else if(e.key==='End'){e.preventDefault();const next=results.length-1;selectResult(next,active);document.querySelectorAll('.result')[next].focus();}
    };
  });
}
function drawOrigins(active=activePeople){
  originLayer.clearLayers();
  active.forEach((p,j)=>{
    if(!isNum(p.origin?.lat)||!isNum(p.origin?.lon))return;
    L.circleMarker([p.origin.lat,p.origin.lon],{pane:'pointPane',radius:10,color:PERSON_COLORS[j%PERSON_COLORS.length],weight:2,fillColor:PERSON_COLORS[j%PERSON_COLORS.length],fillOpacity:.2})
      .bindTooltip(displayName(p,people.indexOf(p)),{direction:'top'}).addTo(originLayer);
  });
}
function recenterMap(){
  const points=results.flatMap(result=>result.paths.flat()).concat(activePeople.filter(person=>person.origin).map(person=>[person.origin.lat,person.origin.lon]));
  if(points.length){map.fitBounds(points,{padding:[60,60],maxZoom:14});return;}
  map.setView([22.31,114.17],12);
}
function heatColor(cell,budget){
  const ratio=clamp(cell.slowest/Math.max(budget,1),0,1.5);
  return HEAT_COLORS[Math.max(0,Math.min(HEAT_COLORS.length-1,Math.round((1-ratio)*(HEAT_COLORS.length-1))))];
}
function drawCloud(budget){
  hideTooltip();
  cloudLayer.clearLayers();
  cloudCells.forEach(c=>{
    const lat0=c.cy*CELL_SIZE,lon0=c.cx*CELL_SIZE,color=heatColor(c,budget);
    const rect=L.rectangle([[lat0,lon0],[lat0+CELL_SIZE,lon0+CELL_SIZE]],{color,weight:0,fillColor:color,fillOpacity:.34,interactive:true,className:'heat-cell'});
    rect.on('mouseover',e=>scheduleCellTooltip(c,e.originalEvent));
    rect.on('mousemove',e=>positionTooltip(e.originalEvent));
    rect.on('mouseout',hideTooltip);
    rect.on('click',e=>{if(e.originalEvent)L.DomEvent.stopPropagation(e.originalEvent);selectCell(c);});
    rect.addTo(cloudLayer);
  });
}
function positionTooltip(event){
  if(!event)return;
  const tooltip=$('mapTooltip');
  tooltip.style.left=`${event.clientX+12}px`;
  tooltip.style.top=`${event.clientY+12}px`;
}
function scheduleCellTooltip(cell,event){
  clearTimeout(tooltipTimer);
  hoverCell=cell;
  positionTooltip(event);
  tooltipTimer=setTimeout(()=>{
    if(hoverCell!==cell)return;
    const enabled=betaVectorsEnabled();
    const tooltip=$('mapTooltip');
    if(enabled){
      const values=cellVector(cell),counts=cellCount(cell),max=Math.max(...VECTOR_KEYS.map(key=>values[key]),1);
      const places=cellTopNames(cell);
      tooltip.innerHTML=`<b>${esc(t('map.cellTitle'))} · ${esc(preferenceText(cellPreference(cell)))}</b>${VECTOR_KEYS.map(key=>`<span class="tooltip-vector"><span>${esc(t('vector.'+key))}</span><span class="tooltip-track"><i class="tooltip-fill" style="width:${Math.max(2,Math.round(values[key]/max*100))}%"></i></span><span>${esc(num(counts[key]))}</span></span>`).join('')}${places.length?`<span class="tooltip-places">${esc(places.join(' · '))}</span>`:''}`;
    }else{
      tooltip.innerHTML=`<b>${esc(t('map.areaTitle'))} · ${esc(t('results.longest',{value:num(cell.slowest)}))}</b>`;
    }
    tooltip.hidden=false;
  },700);
}
function hideTooltip(){
  clearTimeout(tooltipTimer);
  tooltipTimer=null;hoverCell=null;
  const tooltip=$('mapTooltip');if(tooltip)tooltip.hidden=true;
}
function legLabel(leg){return t('route.leg',{mode:t('mode.'+leg.mode),line:leg.line,time:minuteText(leg.minutes)}).replace(/\s+/g,' ').trim();}
function resultMatches(result,sel){
  if(!result||!sel)return false;
  return result.key===sel.key||(Number.isFinite(sel.node)&&result.node===sel.node)||
    (Number.isFinite(sel.lat)&&Number.isFinite(sel.lon)&&Math.abs(result.lat-sel.lat)<1e-5&&Math.abs(result.lon-sel.lon)<1e-5);
}
function buildResultFromCell(cell,active=activePeople){
  const node=cell.node,lat=NODES.lat[node],lon=NODES.lon[node],round=v=>round1(v);
  const result={
    key:cell.key,node,label:cell.label,catKey:cell.keyCat,district:districtFor(lat,lon),lat,lon,
    cellLat:cell.cy*CELL_SIZE+CELL_SIZE/2,cellLon:cell.cx*CELL_SIZE+CELL_SIZE/2,
    times:cell.times.map(round),fastest:round(cell.fastest),slowest:round(cell.slowest),gap:round(cell.gap),score:round(cell.score),
    fit:cellPreference(cell),vector:cellVector(cell),count:cellCount(cell),
  };
  result.routes=sols.map((solution,j)=>describe(solution,active[j].origin,node));
  result.paths=result.routes.map(route=>route.path);
  return result;
}
function selectCell(cell){
  hideTooltip();
  const active=activePeople,match=results.findIndex(result=>resultMatches(result,{key:cell.key,node:cell.node}));
  if(match>=0){selection={kind:'result',index:match};sharedSelection=null;selectResult(match,active);return;}
  const result=buildResultFromCell(cell,active);
  selection={kind:'cell',key:cell.key,node:cell.node,lat:result.lat,lon:result.lon};
  sharedSelection=null;
  renderSelection(result,active);
}
function applySelection(active=activePeople){
  if(sharedSelection){
    const shared=sharedSelection;
    let index=-1;
    if(shared.kind==='result'&&Number.isFinite(Number(shared.index)))index=clamp(Math.round(Number(shared.index)),0,Math.max(0,results.length-1));
    else index=results.findIndex(result=>resultMatches(result,shared));
    if(index>=0&&results[index]){selection={kind:'result',index};sharedSelection=null;selectResult(index,active);return;}
    const cell=cloudCells.find(candidate=>resultMatches({key:candidate.key,node:candidate.node,lat:NODES.lat[candidate.node],lon:NODES.lon[candidate.node]},shared));
    if(cell){selection={kind:'cell',key:cell.key,node:cell.node};sharedSelection=null;renderSelection(buildResultFromCell(cell,active),active);return;}
    sharedSelection=null;
  }
  if(selection?.kind==='cell'){
    const cell=cloudCells.find(candidate=>candidate.key===selection.key);
    if(cell){renderSelection(buildResultFromCell(cell,active),active);return;}
  }
  selectResult(clamp(Number(selection?.index)||0,0,Math.max(0,results.length-1)),active);
}
function renderSelection(r,active=activePeople){
  if(!r)return;
  const index=results.findIndex(result=>resultMatches(result,r));
  selected=index;
  $('detail').hidden=false;
  document.querySelectorAll('.result').forEach((el,j)=>{
    const on=j===index&&index>=0;el.classList.toggle('active',on);el.setAttribute('aria-selected',String(on));el.tabIndex=on?0:-1;});
  routeLayer.clearLayers();pointLayer.clearLayers();
  let legCount=0;
  r.routes.forEach((route,j)=>{
    route.legs.forEach(leg=>{
      if(leg.coords.length<2)return;
      legCount++;
      const dash=leg.mode==='walk'?'1 6':leg.mode==='bus'?'8 5':null;
      L.polyline(leg.coords,{pane:'routePane',color:PERSON_COLORS[j%PERSON_COLORS.length],weight:leg.mode==='walk'?2:4,opacity:leg.mode==='walk'?.7:1,dashArray:dash,className:`route-line route-${leg.mode} route-person-${j}`})
        .bindTooltip(`${displayName(active[j],j)}: ${legLabel(leg)}`).addTo(routeLayer);
    });
  });
  L.circleMarker([r.lat,r.lon],{pane:'pointPane',radius:12,color:ACCENT,weight:2,fillColor:ACCENT,fillOpacity:.16}).addTo(pointLayer);
  L.circleMarker([r.lat,r.lon],{pane:'pointPane',radius:5,color:ACCENT,weight:2,fillColor:ACCENT,fillOpacity:1}).bindPopup(`<b>${esc(r.label)}</b>`).addTo(pointLayer);
  $('detailTitle').textContent=r.label;
  $('detailDistrict').textContent=r.district;
  const preference=betaVectorsEnabled()?` ${preferenceText(r.fit)}`:'';
  $('detailSub').textContent=`${t('results.score',{value:num(r.score)})} ${t('results.spread',{value:num(r.gap)})} ${t('results.longest',{value:num(r.slowest)})}${preference}`;
  $('steps').innerHTML=legCount?r.routes.map((route,j)=>`<div class="step">
    <span class="dot" style="${avatarStyle(j)}">${esc(initialsFor(displayName(active[j],j)))}</span>
    <span class="txt"><b>${esc(displayName(active[j],j))}</b><span class="legs">${route.legs.map(leg=>`<span class="leg route-${leg.mode}">${esc(legLabel(leg))}</span>`).join('')}</span><span class="muted">${esc(minuteText(r.times[j]))}</span></span></div>`).join(''):`<div class="step route-empty"><span class="txt"><b>${esc(r.label)}</b><span class="muted">${esc(t('results.noRoutes'))}</span></span></div>`;
  const pts=r.paths.flat().concat(active.map(p=>[p.origin.lat,p.origin.lon]));
  if(pts.length)map.fitBounds(pts,{padding:[60,60],maxZoom:14});
}
function selectResult(i,active=activePeople){
  const r=results[i];if(!r)return;
  selection={kind:'result',index:i};sharedSelection=null;
  renderSelection(r,active);
}
function scheduleRecompute(){
  clearTimeout(recomputeTimer);
  recomputeTimer=setTimeout(()=>{recomputeTimer=null;triggerSearch();},RECOMPUTE_DELAY);
}
function triggerSearch(){
  clearTimeout(recomputeTimer);recomputeTimer=null;
  const token=++workSeq;
  if(!NET){
    setWorking(true);
    loadNetwork().then(()=>{
      if(token!==workSeq)return;
      setWorking(false);compute();
    }).catch(err=>{
      if(token!==workSeq)return;
      console.error(err);setWorking(false);renderEmpty();showError(t('error.timetableFailed',{message:err.message}));
    });
    return;
  }
  setWorking(true);
  setTimeout(()=>{
    if(token!==workSeq)return;
    try{setWorking(false);compute();}catch(err){console.error(err);setWorking(false);renderEmpty();showError(t('error.searchFailed',{message:err.message}));}
  },30);
}
function rerender(){
  applyStaticText();
  people.forEach(p=>{if(p.origin)p.origin.district=districtFor(p.origin.lat,p.origin.lon);});
  directory.forEach(p=>{p.district=districtFor(p.origin.lat,p.origin.lon);});
  results.forEach(r=>{r.district=districtFor(r.lat,r.lon);});
  updateSettingsLabels();
  renderResultCount();
  renderCards();
  if(results.length){renderResults(activePeople);drawOrigins(activePeople);drawCloud(settings.budget);applySelection(activePeople);}
  else renderEmpty();
  renderDirectoryList();
}

async function init(){
  map=L.map('map',{zoomControl:false,keyboard:true,minZoom:1,maxBounds:[[180,-Infinity],[-180,Infinity]],maxBoundsViscosity:1,attributionControl:true}).setView([22.31,114.17],12);
  map.attributionControl.setPrefix('');
  map.attributionControl.addAttribution('© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap contributors</a>, <a href="https://openfreemap.org/" target="_blank" rel="noopener noreferrer">OpenFreeMap</a>, © OpenMapTiles · <a href="https://github.com/viscory/zg852/issues" target="_blank" rel="noopener noreferrer">Report a map issue</a>');
  L.control.zoom({position:'bottomright'}).addTo(map);
  map.createPane('routePane').style.zIndex=450;
  map.createPane('pointPane').style.zIndex=460;
  maplibreGL({style:CLEAN_STYLE,interactive:false,attributionControl:false}).addTo(map);
  cloudLayer=L.layerGroup().addTo(map);routeLayer=L.layerGroup({pane:'routePane'}).addTo(map);
  pointLayer=L.layerGroup({pane:'pointPane'}).addTo(map);originLayer=L.layerGroup({pane:'pointPane'}).addTo(map);
  map.on('click',e=>{if(pinTarget)setPinOrigin(pinTarget,e.latlng.lat,e.latlng.lng);});
  await Promise.all([loadNodes(),loadDistricts(),ensureCatalog('en')]);
  EN=I18N.en;
  const hashLocale=readHashState()?.locale;
  const storedLocale=LOCALES.includes(hashLocale)?hashLocale:(localStorage.getItem(KEY.locale)||detectLocale());
  if(storedLocale!=='en'){try{await ensureCatalog(storedLocale);}catch(e){I18N[storedLocale]=EN;}}
  locale=LOCALES.includes(storedLocale)?storedLocale:'en';
  setDocumentLocale();
  if(!applySharedState())restoreState();else applySettingsToDom();
  if(betaVectorsEnabled())await loadPoi();
  restoreDirectory();
  applyStaticText();
  renderCards();
  renderEmpty();
  renderDirectoryList();
  drawOrigins();
  loadNetwork().catch(err=>{console.error(err);showError(t('error.timetableFailed',{message:err.message}));});
}

$('add').onclick=()=>{if(people.length<8){people.push({id:`p${seq++}`,name:defaultName(people.length),origin:null});renderCards();save();}};
$('library').onclick=openDirectory;
$('libraryClose').onclick=()=>$('peopleDialog').close();
$('directorySearch').oninput=renderDirectoryList;
$('peopleDialog').addEventListener('close',()=>{pendingDelete=null;lastDialogFocus?.focus?.();});
document.querySelectorAll('.chip').forEach(chip=>chip.onclick=()=>{chip.setAttribute('aria-pressed',String(chip.getAttribute('aria-pressed')!=='true'));clearError();readSettingsFromDom();});
$('tolerance').oninput=readSettingsFromDom;
$('budget').oninput=readSettingsFromDom;
$('betaVectors').onchange=async()=>{
  settings.beta={vectors:$('betaVectors').checked};
  save();
  applyBetaFeatures();
  if(betaVectorsEnabled())await loadPoi();
  if(results.length)triggerSearch();
};
document.querySelectorAll('[data-vector]').forEach(input=>{input.oninput=readSettingsFromDom;});
$('locale').onchange=e=>changeLocale(e.target.value);
$('go').onclick=triggerSearch;
$('recenter').onclick=recenterMap;
$('share').onclick=shareScenario;
$('cancelPin').onclick=clearPinMode;
$('reset').onclick=()=>{[...Object.values(KEY)].forEach(k=>localStorage.removeItem(k));location.reload();};
document.addEventListener('click',e=>{document.querySelectorAll('.suggestions').forEach(s=>{if(!s.hidden&&!s.contains(e.target)){s.hidden=true;const input=s.parentElement.querySelector('.start-input');input?.setAttribute('aria-expanded','false');}});});
document.addEventListener('keydown',e=>{
  if(pinTarget&&e.key==='Escape'){
    e.preventDefault();clearPinMode();
  }
});
if('serviceWorker' in navigator)navigator.serviceWorker.register('sw.js').catch(()=>{});
init();
