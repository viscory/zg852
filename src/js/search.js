import { HK_BBOX,HK_CENTER,KEY } from './config.js';
import { store } from './store.js';
import { isNum,haversine } from './util.js';
import { t } from './i18n.js';
import { districtFor } from './data.js';

export function loadGeoCache(){
  try{const raw=JSON.parse(localStorage.getItem(KEY.geocache));if(raw&&typeof raw==='object'&&!Array.isArray(raw))store.geoCache=raw;}catch(e){}
}
export function saveGeoCache(){
  try{localStorage.setItem(KEY.geocache,JSON.stringify(Object.fromEntries(Object.entries(store.geoCache).slice(-60))));}catch(e){}
}
export function normLabel(value){return value.toLowerCase().normalize('NFKD').replace(/[^\p{L}\p{N}]+/gu,' ').trim();}
export function dedupePlaces(entries,limit=8){
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
export function formatPhoton(p){
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
export function photonTag(p){
  if(p.housenumber||p.street)return 'address';
  if(['amenity','tourism','shop','leisure'].includes(p.osm_key))return 'place';
  if(p.city||p.town)return 'city';
  return 'place';
}
export function photonLang(){
  const codes={'zh-Hant':'zh','zh-Hans':'zh',ja:'ja',ko:'ko',hi:'hi',ur:'ur',id:'id',fr:'fr',th:'th',vi:'vi',ne:'ne',es:'es',de:'de'};
  return codes[store.locale]||'en';
}
export async function photonSearch(q,signal){
  const key=q.trim().toLowerCase();
  if(store.geoCache[key])return store.geoCache[key];
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
  store.geoCache[key]=items;saveGeoCache();return items;
}