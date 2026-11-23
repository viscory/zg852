import { MAX_CLOUD_CELLS,RECOMPUTE_DELAY,TRAVEL_BUDGET_MINUTES,travelTolerance,isUnboundedTolerance } from './config.js';
import { store } from './store.js';
import { $ } from './util.js';
import { t,applyStaticText } from './i18n.js';
import { districtFor,loadNetwork } from './data.js';
import { cellFitScore } from './vectors.js';
import { sourcesFor,solve,bestTimes,walkTimes,walkBudget,buildCells,prepareRoutes,cellToResult } from './routing.js';
import { save } from './state.js';
import { showError,clearError,renderEmpty,renderResults,renderDirectoryList,updateSettingsLabels,renderCards,setWorking,setSidebarFace,applyUnboundedUi } from './ui.js';
import { drawOrigins,drawCloud,applySelection,applyMapLabels } from './map.js';

export function compute(reveal=false){
  clearError();
  if(!store.NET){renderEmpty();showError(t('error.loading'));return;}
  if(store.people.some(p=>!p.origin)){renderEmpty();showError(t('error.missingOrigins'));return;}
  store.activePeople=store.people.filter(p=>p.origin);
  if(store.activePeople.length<2){renderEmpty();showError(t('error.needTwo'));return;}
  const mask=store.settings.modes.reduce((m,mode)=>m|(mode==='rail'?1|(1<<3):mode==='bus'?2|(1<<2):0),0);
  if(!mask){renderEmpty();showError(t('error.noMode'));return;}
  const tolerance=travelTolerance($('tolerance').value);
  store.settings.tolerance=tolerance;
  store.unbounded=isUnboundedTolerance(tolerance);
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
  // Walk budgets only re-weight the cached solutions; Dijkstra and solveKey stay untouched.
  const effectiveGrids=grids.map((grid,i)=>{
    const limit=walkBudget(store.activePeople[i]),out=new Float64Array(grid.length);
    for(let idx=0;idx<grid.length;idx++){const walk=walkGrids[i][idx];out[idx]=isFinite(walk)&&walk<=limit?walk:grid[idx];}
    return out;
  });
  store.effectiveGrids=effectiveGrids;
  // Unbounded mode keeps every reachable node available for free-point picks.
  const cells=buildCells(effectiveGrids,store.unbounded?Infinity:tolerance,TRAVEL_BUDGET_MINUTES);
  const ordered=cells.map(cell=>({cell,fitScore:cellFitScore(cell)})).sort((a,b)=>a.fitScore-b.fitScore||a.cell.score-b.cell.score||a.cell.key.localeCompare(b.cell.key));
  store.cloudCells=ordered.slice(0,MAX_CLOUD_CELLS).map(item=>item.cell);
  store.results=ordered.slice(0,7).map(({cell:c})=>cellToResult(c));
  store.results.forEach(r=>prepareRoutes(r,store.activePeople));
  if(!store.results.length){
    renderEmpty();
    const mode=store.settings.modes.length===1?store.settings.modes[0]:null;
    showError(t(mode==='rail'?'results.noFitMtr':mode==='bus'?'results.noFitBus':'results.noFit'));
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
  store.results.forEach(r=>{r.district=districtFor(r.lat,r.lon);});
  updateSettingsLabels();
  applyUnboundedUi();
  renderCards();
  if(store.results.length){renderResults(store.activePeople);drawOrigins(store.activePeople);drawCloud(TRAVEL_BUDGET_MINUTES);applySelection(store.activePeople);}
  else renderEmpty();
  renderDirectoryList();
}