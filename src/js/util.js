import { PERSON_COLORS,WALK_SPEED_KMH,WALK_DETOUR } from './config.js';

export const $=id=>document.getElementById(id);
export const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const ICONS={globe:'globe',up:'arrow-up',down:'arrow-down',pin:'map-pin',centre:'scan',save:'bookmark-plus',remove:'trash-2',add:'add',library:'library',search:'search',reset:'reset',edit:'edit',close:'close',rail:'rail',bus:'bus',share:'share',food:'food',drinks:'drinks',activities:'activities',culture:'culture',landmark:'landmark',outdoors:'outdoors',shopping:'shopping'};
export const icon=name=>`<span class="icon icon-${ICONS[name]}" aria-hidden="true"></span>`;
export const personColor=i=>PERSON_COLORS[i%PERSON_COLORS.length];
export const initialsFor=name=>{const parts=String(name||'').trim().split(/\s+/).filter(Boolean);return (parts.length?parts.slice(0,2).map(part=>part[0]).join(''):'?').toUpperCase();};
export const avatarClass=i=>`person-${i%PERSON_COLORS.length}`;
export const clamp=(v,lo,hi,fallback)=>Number.isFinite(v)?Math.min(hi,Math.max(lo,v)):fallback;
export const isNum=v=>typeof v==='number'&&Number.isFinite(v);
export const clone=v=>JSON.parse(JSON.stringify(v));
export function round1(value){return Math.round(value*10)/10;}
export function round2(value){return Math.round(value*100)/100;}
export function haversine(lat1,lon1,lat2,lon2){
  const r=Math.PI/180,dlat=(lat2-lat1)*r,dlon=(lon2-lon1)*r;
  const a=Math.sin(dlat/2)**2+Math.cos(lat1*r)*Math.cos(lat2*r)*Math.sin(dlon/2)**2;
  return 2*6371000*Math.asin(Math.sqrt(a));
}
export function walkMinutes(metres){return metres/1000/WALK_SPEED_KMH*60*WALK_DETOUR+1;}
export function decodeBase64Url(value){
  const base64=String(value).replace(/-/g,'+').replace(/_/g,'/');
  const padded=base64+'='.repeat((4-base64.length%4)%4);
  const binary=atob(padded);
  return new TextDecoder().decode(Uint8Array.from(binary,c=>c.charCodeAt(0)));
}
export function encodeBase64Url(value){
  const bytes=new TextEncoder().encode(JSON.stringify(value));
  let binary='';
  bytes.forEach(byte=>{binary+=String.fromCharCode(byte);});
  return btoa(binary).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
}
