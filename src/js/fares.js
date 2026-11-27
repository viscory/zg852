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
  const table=store.MTR_FARES.aelFares;
  if(!table)return null;
  return table[fareKey(from,to)]??null;
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
// Beta-only logging: while the beta vectors setting is on, a repeated
// missing-fare warning is emitted once per distinct message; otherwise nothing
// is logged.
export function warnOnce(...args){
  if(!store.settings?.beta?.vectors)return;
  const key=JSON.stringify(args);
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
  // Scale to the fares actually painted on the map, not to the whole published
  // table: one Airport Express fare (HK$120) would otherwise push every
  // ordinary HK$4-16 fare into the same darkest swatch. There are at most 600
  // drawn cells, so recomputing here needs no stale cache to invalidate.
  let max=0;
  if(Array.isArray(store.cloudCells))for(const cell of store.cloudCells){
    const value=cell?.maxFare;
    if(isNum(value)&&value>max)max=value;
  }
  return max>0?Math.ceil(max):FARE_HEAT_FALLBACK_MAX;
}
