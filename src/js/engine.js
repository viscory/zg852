import { MAX_CLOUD_CELLS,MAX_COST_CELLS,RECOMPUTE_DELAY,TRAVEL_BUDGET_MINUTES,FARE_GAP_FLOOR,activeFairnessMetric,travelTolerance,fareTolerance,isUnboundedTolerance,modesMask } from './config.js';
import { store } from './store.js';
import { compareAreaRank,fairnessTolerance,noFitErrorKey,noReachErrorKey } from './model.js';

import { t,applyStaticText } from './i18n.js';
import { districtFor,loadNetwork } from './data.js';
import { cellFitScore,cellPreference } from './vectors.js';
import { sourcesFor,solve,bestTimes,walkTimes,walkBudget,buildCells,prepareRoutes,cellToResult,legLabel,SOURCE_NO_STOP,SOURCE_WRONG_MODE,SOURCE_OUTSIDE_WALK } from './routing.js';
import { save } from './state.js';
import { showError,clearError,renderEmpty,renderResults,renderDirectoryList,updateSettingsLabels,refreshTranslatedNames,setWorking,setSidebarFace,applyUnboundedUi,hasPendingOrigins } from './ui.js';
import { drawOrigins,drawCloud,applySelection,applyMapLabels } from './map.js';

const SOURCE_ERROR_KEYS={
  [SOURCE_NO_STOP]:'error.noNearby',
  [SOURCE_WRONG_MODE]:'error.noNearbyMode',
  [SOURCE_OUTSIDE_WALK]:'error.noNearby',
};
const rankCells = cells => cells.map(cell=>{
  const vectorAdjustment=cellPreference(cell);
  return {cell,vectorAdjustment,fitScore:cellFitScore(cell)};
}).sort((a,b)=>compareAreaRank(a,b,'time'));

export function compute(reveal=false){
  clearError();
  // Typed but unchosen place names must not silently fall back to an older
  // origin: ask for a suggestion before any origin is read.
  if(hasPendingOrigins()){renderEmpty();showError(t('search.selectSuggestion'));return;}
  if(!store.NET){renderEmpty();showError(t('error.loading'));return;}
  if(store.people.some(p=>!p.origin)){renderEmpty();showError(t('error.missingOrigins'));return;}
  store.activePeople=store.people.filter(p=>p.origin);
  if(store.activePeople.length<2){renderEmpty();showError(t('error.needTwo'));return;}
  const mask=modesMask(store.settings.modes);
  if(!mask){renderEmpty();showError(t('error.noMode'));return;}
  const metric=activeFairnessMetric(store.settings.fairness);
  const tolerance=travelTolerance(store.settings.tolerance);
  const fareLimit=fareTolerance(store.settings.fareTolerance);
  store.settings.fairness=metric;store.settings.tolerance=tolerance;store.settings.fareTolerance=fareLimit;
  store.unbounded=isUnboundedTolerance(metric==='fare'?fareLimit:tolerance);
  if(!store.unbounded)store.pointSelection=null;
  applyUnboundedUi();
  save();
  // solve() depends only on origins, the mode mask, headway and the fixed
  // travel cap. Time/fare tolerance and vector changes re-filter cached
  // solutions instead of re-running Dijkstra.
  const solveKey=`${mask}:${TRAVEL_BUDGET_MINUTES}:${store.activePeople.map(p=>{const o=p.origin;return o.kind==='node'?`n${o.node}`:`c${o.lat},${o.lon}`;}).join('|')}:h${store.settings.includeHeadway===false?0:1}`;
  if(store.solveKey!==solveKey){
    store.solveKey=solveKey;
    const sourceResults=store.activePeople.map(p=>sourcesFor(p.origin,TRAVEL_BUDGET_MINUTES));
    const missingSources=sourceResults.find(result=>!result.sources.length);
    if(missingSources){
      renderEmpty();
      showError(t(SOURCE_ERROR_KEYS[missingSources.reason]||'error.noNearby'));
      return;
    }
    store.sols=sourceResults.map(result=>solve(result.sources,mask,TRAVEL_BUDGET_MINUTES));
  }
  if(store.sols.every(s=>!s.dist.size)){renderEmpty();showError(t('error.noReach'));return;}
  if(store.sols.some(s=>!s.dist.size)){renderEmpty();showError(t('error.someNoReach'));return;}
  const grids=store.sols.map(bestTimes),walkGrids=store.sols.map(walkTimes);
  // If no node is reachable by everyone, the starts are on disconnected
  // networks (for example an outlying island with no modelled ferry). Say so
  // instead of blaming the tolerance and telling the user to enable a mode
  // that is already on.
  if(!grids[0].some((_,index)=>grids.every(grid=>isFinite(grid[index])))){
    renderEmpty();
    showError(t(noReachErrorKey('no-common-area')));
    return;
  }
  // A direct walk is only credited when it fits the person's walk tolerance;
  // otherwise the same destination is reached through the transit grid. This
  // keeps the walk cap and the pin walk check on the same raw (unrounded) value.
  const effectiveGrids=grids.map((grid,i)=>{
    const limit=walkBudget(store.activePeople[i]),out=new Float64Array(grid.length);
    for(let idx=0;idx<grid.length;idx++){const walk=walkGrids[i][idx];out[idx]=isFinite(walk)&&walk<=limit?walk:grid[idx];}
    return out;
  });
  store.effectiveGrids=effectiveGrids;
  if(metric==='time'){
    // Unbounded mode keeps every reachable node available for free-point picks.
    const cells=buildCells(effectiveGrids,store.unbounded?Infinity:fairnessTolerance('time',store.settings),TRAVEL_BUDGET_MINUTES);
    const ordered=rankCells(cells);
    store.cloudCells=ordered.slice(0,MAX_CLOUD_CELLS).map(item=>item.cell);
    store.results=ordered.slice(0,7).map(({cell:c})=>cellToResult(c));
    store.results.forEach(r=>prepareRoutes(r,store.activePeople));
  }else{
    // Fare mode keeps the same time-feasibility filter and 90-minute cap, then
    // orders the surviving cells by the worst fare anyone pays.
    const timeTolerance=fairnessTolerance('time',store.settings);
    const timeCells=buildCells(effectiveGrids,timeTolerance,TRAVEL_BUDGET_MINUTES);
    const ordered=rankCells(timeCells).slice(0,MAX_COST_CELLS);
    const cacheKey=`${solveKey}|${store.activePeople.map(p=>walkBudget(p)).join(',')}`;
    if(store.costCacheKey!==cacheKey){store.costCacheKey=cacheKey;store.costCache=new Map();}
    const fareUnbounded=isUnboundedTolerance(fareLimit);
    const passing=[];
    for(const {cell,fitScore,vectorAdjustment} of ordered){
      let cached=store.costCache.get(cell.key);
      if(!cached){
        const probe=cellToResult(cell);
        prepareRoutes(probe,store.activePeople);
        const fares=probe.routes.map(route=>Number(route.fares?.total)||0);
        const minFare=Math.min(...fares),maxFare=Math.max(...fares);
        const totalFare=Math.round(fares.reduce((sum,value)=>sum+value,0)*10)/10;
        const meanFare=Math.round((totalFare/fares.length)*100)/100;
        const fareGap=Math.round((maxFare-minFare)*10)/10;
        // Relative spread uses the typical fare as its denominator. The old
        // min-fare denominator rejected walk+transit pairs and doubled the gap
        // in the score for anyone who walked.
        const fareSpread=Math.round((fareGap/Math.max(meanFare,1))*100)/100;
        const fareScore=Math.round((totalFare+Math.min(fareGap,totalFare))*10)/10;
        cached={fares,minFare,maxFare,totalFare,meanFare,fareGap,fareSpread,fareScore,
          estimated:probe.routes.some(route=>route.fares?.estimated)};
        store.costCache.set(cell.key,cached);
      }
      if(!fareUnbounded&&cached.fareGap>Math.max(cached.meanFare*fareLimit,FARE_GAP_FLOOR))continue;
      cell.fitScore=fitScore;cell.vectorAdjustment=vectorAdjustment;
      cell.fares=cached.fares;cell.maxFare=cached.maxFare;cell.totalFare=cached.totalFare;
      cell.fareGap=cached.fareGap;cell.fareSpread=cached.fareSpread;cell.fareScore=cached.fareScore;
      cell.fareEstimated=cached.estimated;
      passing.push({cell,fitScore});
    }
    // One shared fare ordering: the displayed fare spread first, then the
    // largest fare chip, the displayed time numbers and the disclosed interest
    // preference. The heat legend separately explains its largest-fare colour.
    passing.sort((a,b)=>compareAreaRank(a.cell,b.cell,'fare'));
    store.cloudCells=passing.slice(0,MAX_CLOUD_CELLS).map(item=>item.cell);
    store.results=passing.slice(0,7).map(({cell})=>{
      const result=cellToResult(cell);
      prepareRoutes(result,store.activePeople);
      return result;
    });
  }
  if(!store.results.length){
    renderEmpty();
    showError(t(metric==='fare'?'results.noFitFare':noFitErrorKey(store.settings.modes)));
    return;
  }
  renderResults(store.activePeople);
  drawOrigins(store.activePeople);drawCloud(TRAVEL_BUDGET_MINUTES);applySelection(store.activePeople);
  if(reveal===true)setSidebarFace('detail');
}
export function scheduleRecompute(){
  clearTimeout(store.recomputeTimer);
  store.recomputeTimer=setTimeout(()=>{store.recomputeTimer=null;triggerSearch();},RECOMPUTE_DELAY);
}
export function triggerSearch(reveal=false){
  clearTimeout(store.recomputeTimer);store.recomputeTimer=null;
  const token=++store.workSeq;
  if(!store.NET){
    setWorking(true);
    loadNetwork().then(()=>{
      if(token!==store.workSeq)return;
      setWorking(false);compute(reveal);
    }).catch(err=>{
      if(token!==store.workSeq)return;
      console.error(err);setWorking(false);renderEmpty();showError(t('error.timetableFailed',{message:err.message}));
    });
    return;
  }
  setWorking(true);
  setTimeout(()=>{
    if(token!==store.workSeq)return;
    try{setWorking(false);compute(reveal);}catch(err){console.error(err);setWorking(false);renderEmpty();showError(t('error.searchFailed',{message:err.message}));}
  },30);
}
export function rerender(){
  applyStaticText();
  applyMapLabels();
  store.people.forEach(p=>{if(p.origin)p.origin.district=districtFor(p.origin.lat,p.origin.lon);});
  store.directory.forEach(p=>{p.district=districtFor(p.origin.lat,p.origin.lon);});
  store.results.forEach(r=>{
    r.district=districtFor(r.lat,r.lon);
    // describe() baked the old locale into leg.text; rebuild it so step chips
    // and route summaries follow the newly selected language.
    r.routes.forEach(route=>{
      route.legs.forEach(leg=>{leg.text=legLabel(leg);});
      route.text=route.legs.map(leg=>leg.text).join(' -> ')||t('route.already');
    });
  });
  updateSettingsLabels();
  applyUnboundedUi();
  // Keep cards (and any in-progress input) in place; refresh their translated
  // labels in place instead of rebuilding them.
  refreshTranslatedNames();
  if(store.results.length){renderResults(store.activePeople);drawOrigins(store.activePeople);drawCloud(TRAVEL_BUDGET_MINUTES);applySelection(store.activePeople);}
  else renderEmpty();
  renderDirectoryList();
}