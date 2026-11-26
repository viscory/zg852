import { MTR_LINE_COLORS,MTR_LINE_DEFAULT_COLOR } from './config.js';
import { store } from './store.js';
import { isNum,haversine } from './util.js';
import { t } from './i18n.js';

// Node kinds come from nodes.json. The mapping below is the single source of
// truth for both exact-name tie-breaks and the visible place-category tag.
export const NODE_KIND=Object.freeze({STATION:1,EXIT:3,BUS_STOP:4});
const KIND_PRIORITY=new Map([[NODE_KIND.STATION,0],[NODE_KIND.EXIT,1],[NODE_KIND.BUS_STOP,2]]);
const PRIORITY_LABEL=new Map([[0,'station'],[1,'exit'],[2,'bus']]);
export function nodePriority(kind){return KIND_PRIORITY.get(kind)??3;}
export function catKey(priority){return PRIORITY_LABEL.get(priority)??'bus';}
// hkbus.json has one positional slot per network line; nulls are alignment for
// lines without a published route page, so the line index maps straight there.
// The parallel hkbus-meta.json records each slot's status (ok, fallback, etc.),
// but the app deliberately ignores that status record: a usable URL alone
// decides whether a route chip is offered.
export const HKBUS_URL_MISSING=null;
export function hkbusUrl(lineIndex){return store.HKBUS_URLS?.[lineIndex]??HKBUS_URL_MISSING;}
// One resolver for every route chip: a link is only offered when the bundled
// catalogue has a real route page. A generic search is not a route link.
export const GENERIC_BUS_SEARCH_URL='https://hkbus.app/en/search';
export function routeLink(leg){
  if(!leg||leg.mode!=='bus'||!Number.isInteger(leg.lineIndex))return null;
  const uri=hkbusUrl(leg.lineIndex);
  if(!uri||uri===GENERIC_BUS_SEARCH_URL)return null;
  return {uri,titleKey:'route.busLink'};
}
export function mtrLineCode(line){
  const match=/^MTR\s+([A-Z]{3})$/.exec(String(line||''));
  return match&&MTR_LINE_COLORS[match[1]]?match[1]:'';
}
export function mtrColor(line){
  const code=mtrLineCode(line);
  return code?MTR_LINE_COLORS[code]:MTR_LINE_DEFAULT_COLOR;
}

async function fetchJson(url,label){
  const response=await fetch(url);
  if(!response.ok)throw new Error(`${label} ${response.status}`);
  return response.json();
}
export async function loadNodes(){
  const nodes=await fetchJson('data/nodes.json','Nodes');
  if(!nodes||!Array.isArray(nodes.names)||!Array.isArray(nodes.kind)||!Array.isArray(nodes.lat)||!Array.isArray(nodes.lon))throw new Error('Nodes data is invalid');
  store.NODES=nodes;
  store.surface=[];
  for(let i=0;i<store.NODES.names.length;i++)if(store.NODES.kind[i]===NODE_KIND.STATION||store.NODES.kind[i]===NODE_KIND.EXIT||store.NODES.kind[i]===NODE_KIND.BUS_STOP)store.surface.push(i);
  store.lowerNames=store.NODES.names.map(name=>String(name).toLowerCase());
}
export async function loadNetwork(){
  if(store.NET)return store.NET;
  store.NET=await fetchJson('data/network.json','Timetable');
  if(!store.NET||!Array.isArray(store.NET.walk)||!Array.isArray(store.NET.lines))throw new Error('Timetable data is invalid');
  try{store.HKBUS_URLS=await fetchJson('data/hkbus.json','Bus URLs');}
  catch(err){console.error(err);store.HKBUS_URLS=[];}
  const n=store.NODES.names.length;
  store.walkAdj=Array.from({length:n},()=>[]);
  store.rideAdj=Array.from({length:n},()=>[]);
  store.nodeLines=Array.from({length:n},()=>[]);
  store.NET.walk.forEach(([a,b,d])=>{store.walkAdj[a].push([b,d]);store.walkAdj[b].push([a,d]);});
  store.NET.lines.forEach((line,li)=>{for(let i=0;i<line.s.length;i++){
    const node=line.s[i];store.nodeLines[node].push(li);
    if(i+1<line.s.length)store.rideAdj[node].push([li,line.s[i+1],line.e[i],i]);
  }});
  document.documentElement.dataset.net='ready';
  return store.NET;
}
export async function loadDistricts(){
  store.DISTRICTS=await fetchJson('data/districts.json','Districts');
  if(!Array.isArray(store.DISTRICTS))throw new Error('Districts data is invalid');
}
export async function loadFares(){
  if(store.MTR_FARES)return store.MTR_FARES;
  store.MTR_FARES=await fetchJson('data/mtr-fares.json','MTR fares');
  if(!store.MTR_FARES?.fares||!store.MTR_FARES?.nodeStation)throw new Error('MTR fare data is invalid');
  store.fareHeatMax=null;
  // The bus/minibus/ferry snapshot is optional: a missing table must degrade
  // to an explicitly flagged estimate, not break the app or hide MTR fares.
  try{store.ROUTE_FARES=await fetchJson('data/route-fares.json','Route fares');}
  catch(err){console.error(err);store.ROUTE_FARES={fares:{}};}
  return store.MTR_FARES;
}
export async function loadPoi(){
  if(store.poiLoaded)return store.POI;
  if(store.poiLoading)return store.poiLoading;
  store.poiLoading=(async()=>{
    try{store.POI=await fetchJson('data/poi-index.json','POI index');}
    catch(err){console.error(err);store.POI={cells:{}};}
    store.poiLoaded=true;
    return store.POI;
  })();
  try{return await store.poiLoading;}finally{store.poiLoading=null;}
}
const districtCache=new Map();
export function districtFor(lat,lon){
  if(!store.DISTRICTS.length||!isNum(lat)||!isNum(lon))return t('district.unknown');
  const key=`${lat},${lon}`;
  let best=districtCache.get(key);
  if(!best){
    best=store.DISTRICTS[0];
    let bestD=Infinity;
    for(const d of store.DISTRICTS){
      const distance=haversine(lat,lon,d.lat,d.lon);
      if(distance<bestD){best=d;bestD=distance;}
    }
    districtCache.set(key,best);
  }
  return best.name[store.locale]||best.name.en||t('district.unknown');
}
export function findExact(name){
  for(let i=0;i<store.NODES.names.length;i++)if(store.lowerNames[i]===String(name).toLowerCase()&&store.NODES.kind[i]===NODE_KIND.STATION)return i;
  return null;
}
export function searchPlaces(q,limit=8){
  const ql=q.trim().toLowerCase();if(!ql||!store.NODES)return[];
  const exact=[],partial=[];
  for(const idx of store.surface){
    const low=store.lowerNames[idx];
    if(low===ql)exact.push(idx);else if(low.includes(ql))partial.push(idx);
  }
  exact.sort((a,b)=>nodePriority(store.NODES.kind[a])-nodePriority(store.NODES.kind[b]));
  partial.sort((a,b)=>nodePriority(store.NODES.kind[a])-nodePriority(store.NODES.kind[b])||store.NODES.names[a].length-store.NODES.names[b].length);
  return exact.concat(partial).slice(0,limit).map(idx=>({
    kind:'local',node:idx,label:store.NODES.names[idx],tagKey:catKey(nodePriority(store.NODES.kind[idx])),
    lat:store.NODES.lat[idx],lon:store.NODES.lon[idx],district:districtFor(store.NODES.lat[idx],store.NODES.lon[idx]),count:1,
  }));
}