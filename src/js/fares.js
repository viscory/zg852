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
