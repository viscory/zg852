import { PERSON_COLORS,WALK_SPEED_KMH,WALK_DETOUR,ROUNDING_SCALES,EARTH_RADIUS_M,SHARED_CONSTANTS } from './config.js';

export const $=id=>document.getElementById(id);
export const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const ICONS={up:'arrow-up',down:'arrow-down',pin:'map-pin',centre:'scan',save:'bookmark-plus',remove:'trash-2',add:'add',edit:'edit'};
export const icon=name=>`<span class="icon icon-${ICONS[name]}" aria-hidden="true"></span>`;
export const initialsFor=name=>{const parts=String(name||'').trim().split(/\s+/).filter(Boolean);return (parts.length?parts.slice(0,2).map(part=>part[0]).join(''):'?').toUpperCase();};
export const avatarClass=i=>`person-${i%PERSON_COLORS.length}`;
export const clamp=(v,lo,hi,fallback)=>Number.isFinite(v)?Math.min(hi,Math.max(lo,v)):fallback;
export const isNum=v=>typeof v==='number'&&Number.isFinite(v);
export const clone=v=>JSON.parse(JSON.stringify(v));
export function round1(value){return Math.round(value*ROUNDING_SCALES.minutes)/ROUNDING_SCALES.minutes;}
export function round2(value){return Math.round(value*ROUNDING_SCALES.percent)/ROUNDING_SCALES.percent;}
export function haversine(lat1,lon1,lat2,lon2){
  const r=Math.PI/180,dlat=(lat2-lat1)*r,dlon=(lon2-lon1)*r;
  const a=Math.sin(dlat/2)**2+Math.cos(lat1*r)*Math.cos(lat2*r)*Math.sin(dlon/2)**2;
  return 2*EARTH_RADIUS_M*Math.asin(Math.sqrt(a));
}
// Access walks use this extra minute so a very short first hop does not round
// away to zero and the detour estimate's sub-minute error does not give the
// start a free hop. The terminal walk to a pinned point is computed from raw
// metres instead, without this buffer.
export const WALK_ROUNDING_BUFFER_MIN=1;
export function walkMinutes(metres){return metres/SHARED_CONSTANTS.metresPerKm/WALK_SPEED_KMH*SHARED_CONSTANTS.secondsPerMinute*WALK_DETOUR+WALK_ROUNDING_BUFFER_MIN;}
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
