import { LETTERS,TRAVEL_BUDGET_MINUTES,isUnboundedTolerance } from './config.js';
import { store } from './store.js';
import { heatValue,rankInputs } from './model.js';
import { displayName,copyText } from './state.js';

// A self-contained snapshot of everything that went into the visible routes.
// No personal data beyond the names and places the user already typed.

function lineFacts(index){
  const line=store.NET?.lines?.[index];
  if(!line)return{};
  return{line:line.l,lineName:line.n,lineWait:line.w,lineHalfHeadway:line.h,category:line.c};
}

function legFacts(leg,person){
  const fromIndex=leg.fromNode,toIndex=leg.toNode;
  return{
    mode:leg.mode,
    line:leg.line||'',
    lineName:leg.lineName||'',
    ...(leg.lineIndex===undefined?{}:lineFacts(leg.lineIndex)),
    from:leg.from,
    to:leg.to,
    fromNode:fromIndex,
    toNode:toIndex,
    fromStop:Number.isInteger(fromIndex)?store.NODES?.names?.[fromIndex]??null:null,
    toStop:Number.isInteger(toIndex)?store.NODES?.names?.[toIndex]??null:null,
    minutes:Math.round((leg.minutes||0)*10)/10,
    stopCount:leg.stopCount||0,
    interchangeWait:leg.interchangeWait||0,
    fare:leg.fare||0,
    fareEstimated:!!leg.fareEstimated,
    fareSource:leg.fareSource||null,
    person,
  };
}

function areaFacts(result){
  const metric=store.settings.fairness==='fare'?'fare':'time';
  return{
    key:result.key,
    node:result.node,
    label:result.label,
    district:result.district,
    lat:result.lat,
    lon:result.lon,
    times:result.times,
    fastest:result.fastest,
    slowest:result.slowest,
    gap:result.gap,
    score:result.score,
    fareGap:result.fareGap??null,
    fareSpread:result.fareSpread??null,
    totalFare:result.totalFare??null,
    fareEstimated:result.fareEstimated??false,
    rankInputs:rankInputs(result,metric),
    heatValue:heatValue(result,metric),
    interestFit:result.fit,
    interestRating:result.rating??null,
    interestRatings:result.ratings??null,
    routes:(result.routes||[]).map((route,j)=>({
      person:displayName(store.activePeople[j],j),
      legs:(route.legs||[]).map(leg=>legFacts(leg,j)),
      fares:route.fares||null,
      totalMinutes:result.times?.[j]??null,
    })),
  };
}

export function diagnosticData(){
  const selectedIndex=store.selection?.kind==='result'?Number(store.selection.index):store.selected;
  const selected=store.results?.[selectedIndex]||null;
  const tolerance=Number(store.settings.tolerance)||0;
  const fareTolerance=Number(store.settings.fareTolerance)||0;
  return{
    schema:1,
    generatedAt:new Date().toISOString(),
    app:{name:'就腳 zau6 goek3',url:location.href,locale:store.locale},
    settings:{
      fairness:store.settings.fairness==='fare'?'fare':'time',
      modes:store.settings.modes||[],
      tolerance,
      tolerancePercent:Math.round(tolerance*100),
      toleranceLimited:!isUnboundedTolerance(tolerance),
      fareTolerance,
      fareTolerancePercent:Math.round(fareTolerance*100),
      fareToleranceLimited:!isUnboundedTolerance(fareTolerance),
      travelBudgetMinutes:TRAVEL_BUDGET_MINUTES,
      unbounded:!!store.unbounded,
      includeHeadway:store.settings.includeHeadway!==false,
      beta:store.settings.beta||null,
      vectors:store.settings.vectors||null,
    },
    people:store.people.map((person,i)=>({
      letter:LETTERS[i%LETTERS.length],
      name:person.name,
      walkMinutes:person.walkMinutes,
      origin:person.origin?{
        kind:person.origin.kind,
        node:person.origin.node??null,
        label:person.origin.label,
        source:person.origin.source||null,
        lat:person.origin.lat,
        lon:person.origin.lon,
        osm:person.origin.osm||null,
        district:person.origin.district||null,
      }:null,
    })),
    solveKey:store.solveKey||null,
    selection:store.selection||null,
    selectedArea:selected?areaFacts(selected):null,
    freePoint:store.pointSelection||null,
    hotspotCount:store.cloudCells?.length||0,
    hotspots:(store.cloudCells||[]).map(cell=>({
      key:cell.key,node:cell.node,label:cell.label,
      lat:store.NODES?.lat?.[cell.node]??null,
      lon:store.NODES?.lon?.[cell.node]??null,
      times:cell.times,fastest:cell.fastest,slowest:cell.slowest,gap:cell.gap,
    })),
    areas:(store.results||[]).map(areaFacts),
  };
}

function stamp(){
  const now=new Date();
  const pad=value=>String(value).padStart(2,'0');
  return `${now.getFullYear()}${pad(now.getMonth()+1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}`;
}

export function downloadJson(filename,text){
  const url=URL.createObjectURL(new Blob([text],{type:'application/json'}));
  const anchor=document.createElement('a');
  anchor.href=url;
  anchor.download=filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
}

export async function exportDiagnostics(){
  try{
    const text=JSON.stringify(diagnosticData(),null,2);
    downloadJson(`zg852-diagnostics-${stamp()}.json`,text);
    let copied=false;
    try{await copyText(text);copied=true;}
    catch(err){console.warn(err);}
    return{copied,text};
  }catch(err){
    console.error(err);
    return{ok:false,error:err};
  }
}
