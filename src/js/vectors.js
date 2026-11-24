import { VECTOR_KEYS,VECTOR_BONUS_MINUTES } from './config.js';
import { store } from './store.js';
import { round1,round2,clamp } from './util.js';
import { t,num } from './i18n.js';

export function defaultVectors(){return Object.fromEntries(VECTOR_KEYS.map(k=>[k,0]));}
export function betaVectorsEnabled(){return !!(store.settings.beta&&store.settings.beta.vectors);}
export function normalizeVectors(raw){
  const fallback=defaultVectors();
  if(!raw||typeof raw!=='object')return fallback;
  for(const key of VECTOR_KEYS)fallback[key]=Math.round(clamp(Number(raw[key]),-3,3,0));
  return fallback;
}
export function migrateVectors(raw){
  if(raw&&typeof raw==='object'&&VECTOR_KEYS.every(key=>Number(raw[key])===1))return defaultVectors();
  return normalizeVectors(raw);
}
export function vectorLabel(value){
  const amount=Number(value)||0;
  if(!amount)return t('vector.off');
  return amount<0?t('vector.avoid',{value:Math.abs(amount)}):t('vector.prefer',{value:amount});
}
export function preferenceText(value){
  const amount=round1(Math.abs(value));
  if(value>0.05)return t('results.preferenceUp',{value:num(amount)});
  if(value<-0.05)return t('results.preferenceDown',{value:num(amount)});
  return t('results.preferenceNone');
}
export function cellVector(cell){
  const values=store.POI?.cells?.[cell.key]?.v;
  if(!values)return Object.fromEntries(VECTOR_KEYS.map(key=>[key,0]));
  return Object.fromEntries(VECTOR_KEYS.map(key=>[key,Number(values[key])||0]));
}
export function cellCount(cell){
  const counts=store.POI?.cells?.[cell.key]?.n||{};
  return Object.fromEntries(VECTOR_KEYS.map(key=>[key,Number(counts[key])||0]));
}
export function cellTopNames(cell){
  const top=store.POI?.cells?.[cell.key]?.top||{};
  return VECTOR_KEYS.flatMap(key=>top[key]||[]).slice(0,3);
}
// POI values are already log-normalised to 0..1 per category (see
// scripts/build_poi_index.py). Surface that as a readable 0..100 rating rather
// than treating the raw decimals as an opaque preference input.
export function categoryRating(value){
  return Math.round(clamp(Number(value)||0,0,1)*100);
}
export function cellRatings(cell){
  const values=cellVector(cell),counts=cellCount(cell);
  return VECTOR_KEYS.map(key=>({key,rating:categoryRating(values[key]),count:counts[key]}));
}
export function overallRating(cell){
  const values=cellVector(cell);
  return categoryRating(VECTOR_KEYS.reduce((sum,key)=>sum+(Number(values[key])||0),0)/VECTOR_KEYS.length);
}
export function cellPreference(cell){
  if(!betaVectorsEnabled())return 0;
  const vectors=normalizeVectors(store.settings.vectors),values=cellVector(cell);
  const total=VECTOR_KEYS.reduce((sum,key)=>sum+Math.abs(vectors[key]),0);
  if(!total)return 0;
  const weighted=VECTOR_KEYS.reduce((sum,key)=>sum+vectors[key]*values[key],0);
  return round2(weighted/total*VECTOR_BONUS_MINUTES);
}
export function cellFitScore(cell){return cell.score-cellPreference(cell);}