import { FARE_HEAT_FALLBACK_MAX,LIGHT_RAIL_FARES } from './config.js';
import { store } from './store.js';
import { isNum } from './util.js';

// Adult Octopus fares are looked up from the bundled MTR station-pair matrix,
// not recomputed from line distance. The matrix keys use our station node ids.
function stationNode(node){
  if(!store.MTR_FARES||!isNum(node))return null;
  const mapped=store.MTR_FARES.nodeStation[node];
  return mapped===undefined?null:mapped;
}

// Both matrices store every station pair in both directions with the same
// value. Canonicalising the pair once removes the mirrored lookup; from===to
// naturally needs only that single lookup too.
export function fareKey(fromStation,toStation){
  return fromStation<=toStation?`${fromStation}|${toStation}`:`${toStation}|${fromStation}`;
}

export function railFare(fromNode,toNode){
  const from=stationNode(fromNode),to=stationNode(toNode);
  if(from===null||to===null)return null;
  return store.MTR_FARES.fares[fareKey(from,to)]??null;
}

export function aelFareForNodes(fromNode,toNode){
  const from=stationNode(fromNode),to=stationNode(toNode);
  if(from===null||to===null)return null;
  return store.MTR_FARES.aelFares[fareKey(from,to)]??null;
}

// A fare is estimated only when an exact published value was unavailable and a
// distance band had to stand in. An exact snapshot fare — MTR station-pair,
// Airport Express, Light Rail chart, or Transport Department full fare — is
// shown as exact, whatever the travel mode. This keeps the ≈ marker tied to the
// data's provenance rather than to presentation preferences.
export function isEstimatedFare(leg,official){
  return official===null;
}

const warnedOnce=new Set();
// Diagnostics-only logging. Production stays silent; a repeated missing-fare
// warning is emitted once per distinct message while beta diagnostics are on.
export function warnOnce(...args){
  if(!store.settings?.beta?.vectors)return;
  const key=args.map(value=>String(value)).join('\u0000');
  if(warnedOnce.has(key))return;
  warnedOnce.add(key);
  console.warn(...args);
}
// The chart counts the boarding and alighting stops, so a leg with N ride
// edges covers N+1 stops. Consecutive legs are added before this lookup.
export function lightRailFare(stops){
  const count=Math.max(1,Math.round(stops));
  return LIGHT_RAIL_FARES.find(([limit])=>count<=limit)[1];
}
export function fareHeatMax(){
  if(isNum(store.fareHeatMax)&&store.fareHeatMax>0)return store.fareHeatMax;
  let max=0;
  const data=store.MTR_FARES;
  if(data)for(const table of [data.fares,data.aelFares]){
    if(!table||typeof table!=='object')continue;
    for(const value of Object.values(table))if(isNum(value)&&value>max)max=value;
  }
  store.fareHeatMax=max>0?Math.ceil(max):FARE_HEAT_FALLBACK_MAX;
  return store.fareHeatMax;
}
