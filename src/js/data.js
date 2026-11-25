import { HKBUS_SEARCH_URL,MTR_LINE_COLORS,MTR_LINE_DEFAULT_COLOR } from './config.js';
import { store } from './store.js';
import { isNum,haversine } from './util.js';
import { t } from './i18n.js';

export function nodePriority(kind){return kind===1?0:kind===3?1:kind===4?2:3;}
export function catKey(priority){return priority===0?'station':priority===1?'exit':'bus';}
export function hkbusUrl(lineIndex){return store.HKBUS_URLS?.[lineIndex]||HKBUS_SEARCH_URL;}
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
  for(let i=0;i<store.NODES.names.length;i++)if(store.NODES.kind[i]===1||store.NODES.kind[i]===3||store.NODES.kind[i]===4)store.surface.push(i);
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
  for(let i=0;i<store.NODES.names.length;i++)if(store.lowerNames[i]===String(name).toLowerCase()&&store.NODES.kind[i]===1)return i;
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
    kind:'local',node:idx,label:store.NODES.names[idx],tagKey:store.NODES.kind[idx]===1?'station':store.NODES.kind[idx]===3?'exit':'bus',
    lat:store.NODES.lat[idx],lon:store.NODES.lon[idx],district:districtFor(store.NODES.lat[idx],store.NODES.lon[idx]),count:1,
  }));
}