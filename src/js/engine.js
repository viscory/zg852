import { MAX_CLOUD_CELLS,MAX_COST_CELLS,RECOMPUTE_DELAY,TRAVEL_BUDGET_MINUTES,FARE_GAP_FLOOR,travelTolerance,fareTolerance,isUnboundedTolerance } from './config.js';
import { store } from './store.js';

import { t,applyStaticText } from './i18n.js';
import { districtFor,loadNetwork } from './data.js';
import { cellFitScore } from './vectors.js';
import { sourcesFor,solve,bestTimes,walkTimes,walkBudget,buildCells,prepareRoutes,cellToResult,meetingTieBreak,meetingSuitability,legLabel } from './routing.js';
import { save } from './state.js';
import { showError,clearError,renderEmpty,renderResults,renderDirectoryList,updateSettingsLabels,refreshTranslatedNames,setWorking,setSidebarFace,applyUnboundedUi,hasPendingOrigins } from './ui.js';
import { drawOrigins,drawCloud,applySelection,applyMapLabels } from './map.js';

export function compute(reveal=false){
  clearError();
  // Typed but unchosen place names must not silently fall back to an older
  // origin: ask for a suggestion before any origin is read.
  if(hasPendingOrigins()){renderEmpty();showError(t('search.selectSuggestion'));return;}
  if(!store.NET){renderEmpty();showError(t('error.loading'));return;}
  if(store.people.some(p=>!p.origin)){renderEmpty();showError(t('error.missingOrigins'));return;}
  store.activePeople=store.people.filter(p=>p.origin);
  if(store.activePeople.length<2){renderEmpty();showError(t('error.needTwo'));return;}
  const mask=store.settings.modes.reduce((m,mode)=>m|(mode==='rail'?1|(1<<3):mode==='bus'?2|(1<<2):0),0);
  if(!mask){renderEmpty();showError(t('error.noMode'));return;}
  const metric=store.settings.fairness==='fare'?'fare':'time';
  const tolerance=travelTolerance(store.settings.tolerance);
  const fareLimit=fareTolerance(store.settings.fareTolerance);
  store.settings.fairness=metric;store.settings.tolerance=tolerance;store.settings.fareTolerance=fareLimit;
  store.unbounded=isUnboundedTolerance(metric==='fare'?fareLimit:tolerance);
  if(!store.unbounded)store.pointSelection=null;
  applyUnboundedUi();
  save();
  // solve() depends only on origins, the mode mask, the headway setting, and
  // the fixed travel cap. Tolerance and vector changes re-filter cells from
  // the cached solutions instead of re-running Dijkstra for every person.
  const solveKey=`${mask}:${TRAVEL_BUDGET_MINUTES}:${store.activePeople.map(p=>{const o=p.origin;return o.kind==='node'?`n${o.node}`:`c${o.lat},${o.lon}`;}).join('|')}:h${store.settings.includeHeadway===false?0:1}`;
  if(store.solveKey!==solveKey){
    store.solveKey=solveKey;
    const sources=store.activePeople.map(p=>sourcesFor(p.origin,TRAVEL_BUDGET_MINUTES));
    if(sources.some(s=>!s.length)){renderEmpty();showError(t('error.noNearby'));return;}
    store.sols=sources.map(s=>solve(s,mask,TRAVEL_BUDGET_MINUTES));
  }
  if(store.sols.some(s=>!s.dist.size)){renderEmpty();showError(t('error.noReach'));return;}
  const grids=store.sols.map(bestTimes),walkGrids=store.sols.map(walkTimes);
  // If no node is reachable by everyone, the starts are on disconnected
  // networks (for example an outlying island with no modelled ferry). Say so
  // instead of blaming the tolerance and telling the user to enable a mode
  // that is already on.
  if(!grids[0].some((_,index)=>grids.every(grid=>isFinite(grid[index])))){
    renderEmpty();
    showError(t('error.noReach'));
    return;
  }
  // Walk budgets only re-weight the cached solutions; Dijkstra and solveKey stay untouched.
  const effectiveGrids=grids.map((grid,i)=>{
    const limit=walkBudget(store.activePeople[i]),out=new Float64Array(grid.length);
    for(let idx=0;idx<grid.length;idx++){const walk=walkGrids[i][idx];out[idx]=isFinite(walk)&&walk<=limit?walk:grid[idx];}
    return out;
  });
  store.effectiveGrids=effectiveGrids;
  if(metric==='time'){
    // Unbounded mode keeps every reachable node available for free-point picks.
    const cells=buildCells(effectiveGrids,store.unbounded?Infinity:tolerance,TRAVEL_BUDGET_MINUTES);
    const ordered=cells.map(cell=>({cell,fitScore:cellFitScore(cell)})).sort((a,b)=>meetingTieBreak(a,b,item=>item.fitScore));
    store.cloudCells=ordered.slice(0,MAX_CLOUD_CELLS).map(item=>item.cell);
    store.results=ordered.slice(0,7).map(({cell:c})=>cellToResult(c));
    store.results.forEach(r=>prepareRoutes(r,store.activePeople));
  }else{
    // Fare fairness is a real objective: keep the 60-minute budget, drop the
    // time-disparity filter, rank the time-feasible pool by fare disparity.
    const timeCells=buildCells(effectiveGrids,Infinity,TRAVEL_BUDGET_MINUTES);
    const ordered=timeCells.map(cell=>({cell,fitScore:cellFitScore(cell)}))
      .sort((a,b)=>meetingTieBreak(a,b,item=>item.fitScore)).slice(0,MAX_COST_CELLS);
    const cacheKey=`${solveKey}|${store.activePeople.map(p=>walkBudget(p)).join(',')}`;
    if(store.costCacheKey!==cacheKey){store.costCacheKey=cacheKey;store.costCache=new Map();}
    const fareUnbounded=isUnboundedTolerance(fareLimit);
    const passing=[];
    for(const {cell,fitScore} of ordered){
      let cached=store.costCache.get(cell.key);
      if(!cached){
        const probe=cellToResult(cell);
        prepareRoutes(probe,store.activePeople);
        const fares=probe.routes.map(route=>Number(route.fares?.total)||0);
        const minFare=Math.min(...fares),maxFare=Math.max(...fares);
        const fareGap=Math.round((maxFare-minFare)*10)/10;
        const fareScore=Math.round((maxFare+fareGap)*10)/10;
        cached={fares,minFare,maxFare,fareGap,fareScore};
        store.costCache.set(cell.key,cached);
      }
      if(!fareUnbounded&&cached.fareGap>Math.max(cached.minFare*fareLimit,FARE_GAP_FLOOR))continue;
      cell.fares=cached.fares;cell.maxFare=cached.maxFare;cell.fareGap=cached.fareGap;cell.fareScore=cached.fareScore;
      passing.push({cell,fitScore});
    }
    passing.sort((a,b)=>(a.cell.fareScore-b.cell.fareScore)||(meetingSuitability(a)-meetingSuitability(b))||String(a.cell.key).localeCompare(String(b.cell.key)));
    store.cloudCells=passing.slice(0,MAX_CLOUD_CELLS).map(item=>item.cell);
    store.results=passing.slice(0,7).map(({cell})=>{
      const result=cellToResult(cell);
      prepareRoutes(result,store.activePeople);
      return result;
    });
  }
  if(!store.results.length){
    renderEmpty();
    if(metric==='fare')showError(t('results.noFitFare'));
    else{
      const mode=store.settings.modes.length===1?store.settings.modes[0]:null;
      showError(t(mode==='rail'?'results.noFitMtr':mode==='bus'?'results.noFitBus':'results.noFit'));
    }
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