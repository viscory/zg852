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

export function railFare(fromNode,toNode){
  const from=stationNode(fromNode),to=stationNode(toNode);
  if(from===null||to===null)return null;
  const table=store.MTR_FARES.fares;
  return table[`${from}|${to}`]??table[`${to}|${from}`]??null;
}

export function aelFareForNodes(fromNode,toNode){
  const from=stationNode(fromNode),to=stationNode(toNode);
  if(from===null||to===null)return null;
  const table=store.MTR_FARES.aelFares;
  return table[`${from}|${to}`]??table[`${to}|${from}`]??null;
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
