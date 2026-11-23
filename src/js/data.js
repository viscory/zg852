import { RAIL_FARE_BANDS,BUS_FARE_BANDS } from './config.js';
import { store } from './store.js';
import { isNum,haversine,round1 } from './util.js';
import { t } from './i18n.js';
import { betaVectorsEnabled } from './vectors.js';
import { bandFare,aelFare,rideMode } from './routing.js';

export function nodePriority(kind){return kind===1?0:kind===3?1:kind===4?2:3;}
export function catKey(priority){return priority===0?'station':priority===1?'exit':'bus';}

export async function loadNodes(){
  store.NODES=await fetch('data/nodes.json').then(r=>r.json());
  store.surface=[];
  for(let i=0;i<store.NODES.names.length;i++)if(store.NODES.kind[i]===1||store.NODES.kind[i]===3||store.NODES.kind[i]===4)store.surface.push(i);
  store.lowerNames=store.NODES.names.map(name=>String(name).toLowerCase());
}
function segmentKm(points){
  let metres=0;
  for(let i=1;i<points.length;i++){
    const a=points[i-1],b=points[i];
    if(Array.isArray(a)&&Array.isArray(b)&&isNum(a[0])&&isNum(a[1])&&isNum(b[0])&&isNum(b[1]))metres+=haversine(a[0],a[1],b[0],b[1]);
  }
  return metres/1000;
}
// A per-line fare used only by the fare fairness grid; route narration still
// uses routeFares() so its estimates follow the real interchange rules.
export function estimateLineFare(line){
  const stops=Array.isArray(line?.s)?line.s:[];
  if(String(line?.l||'').startsWith('MTR AEL')){
    const first=stops[0],last=stops[stops.length-1];
    return round1(aelFare(store.NODES?.names?.[first],store.NODES?.names?.[last]));
  }
  let km=0;
  if(Array.isArray(line?.g)&&line.g.length){
    for(const segment of line.g)if(Array.isArray(segment))km+=segmentKm(segment);
  }else{
    for(let i=1;i<stops.length;i++){
      const a=stops[i-1],b=stops[i];
      if(!store.NODES||!isNum(a)||!isNum(b))continue;
      km+=haversine(store.NODES.lat[a],store.NODES.lon[a],store.NODES.lat[b],store.NODES.lon[b])/1000;
    }
  }
  if(!isNum(km)||km<0)km=0;
  const mode=rideMode(line?.c);
  return round1(bandFare(km,mode==='rail'||mode==='lightRail'?RAIL_FARE_BANDS:BUS_FARE_BANDS));
}
export async function loadNetwork(){
  if(store.NET)return store.NET;
  store.NET=await fetch('data/network.json').then(r=>r.json());
  for(const line of store.NET.lines)line.f=estimateLineFare(line);
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
  store.DISTRICTS=await fetch('data/districts.json').then(r=>r.json());
}
export async function loadPoi(){
  if(!betaVectorsEnabled()){store.POI={cells:{}};return null;}
  if(store.poiLoaded)return store.POI;
  if(store.poiLoading)return store.poiLoading;
  store.poiLoading=(async()=>{
    try{
      const response=await fetch('data/poi-index.json');
      if(!response.ok)throw new Error(`POI index ${response.status}`);
      store.POI=await response.json();
    }catch(err){console.error(err);store.POI={cells:{}};}
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