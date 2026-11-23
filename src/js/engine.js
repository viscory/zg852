import { MAX_CLOUD_CELLS,RECOMPUTE_DELAY } from './config.js';
import { store } from './store.js';
import { $,clamp } from './util.js';
import { t,applyStaticText } from './i18n.js';
import { districtFor,loadNetwork } from './data.js';
import { cellFitScore } from './vectors.js';
import { sourcesFor,solve,bestTimes,buildCells,prepareRoutes,cellToResult } from './routing.js';
import { save } from './state.js';
import { showError,clearError,renderEmpty,renderResults,renderDirectoryList,updateSettingsLabels,renderCards,setWorking } from './ui.js';
import { drawOrigins,drawCloud,applySelection,applyMapLabels } from './map.js';

export function compute(){
  clearError();
  if(!store.NET){renderEmpty();showError(t('error.loading'));return;}
  if(store.people.some(p=>!p.origin)){renderEmpty();showError(t('error.missingOrigins'));return;}
  store.activePeople=store.people.filter(p=>p.origin);
  if(store.activePeople.length<2){renderEmpty();showError(t('error.needTwo'));return;}
  const mask=store.settings.modes.reduce((m,mode)=>m|(mode==='rail'?1|(1<<3):mode==='bus'?2|(1<<2):0),0);
  if(!mask){renderEmpty();showError(t('error.noMode'));return;}
  const tolerance=clamp(Number($('tolerance').value),0.05,0.5,0.1),budget=Number($('budget').value);
  store.settings.tolerance=tolerance;store.settings.budget=budget;save();
  // solve() depends only on origins, the mode mask, and the budget. Tolerance
  // and vector changes re-filter cells from the cached solutions instead of
  // re-running Dijkstra for every person.
  const solveKey=`${mask}:${budget}:${store.activePeople.map(p=>{const o=p.origin;return o.kind==='node'?`n${o.node}`:`c${o.lat},${o.lon}`;}).join('|')}`;
  if(store.solveKey!==solveKey){
    store.solveKey=solveKey;
    const sources=store.activePeople.map(p=>sourcesFor(p.origin,budget));
    if(sources.some(s=>!s.length)){renderEmpty();showError(t('error.noNearby'));return;}
    store.sols=sources.map(s=>solve(s,mask,budget));
  }
  if(store.sols.some(s=>!s.dist.size)){renderEmpty();showError(t('error.noReach'));return;}
  const grids=store.sols.map(bestTimes),cells=buildCells(grids,tolerance,budget);
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
  drawOrigins(store.activePeople);drawCloud(budget);applySelection(store.activePeople);
}
export function scheduleRecompute(){
  clearTimeout(store.recomputeTimer);
  store.recomputeTimer=setTimeout(()=>{store.recomputeTimer=null;triggerSearch();},RECOMPUTE_DELAY);
}
export function triggerSearch(){
  clearTimeout(store.recomputeTimer);store.recomputeTimer=null;
  const token=++store.workSeq;
  if(!store.NET){
    setWorking(true);
    loadNetwork().then(()=>{
      if(token!==store.workSeq)return;
      setWorking(false);compute();
    }).catch(err=>{
      if(token!==store.workSeq)return;
      console.error(err);setWorking(false);renderEmpty();showError(t('error.timetableFailed',{message:err.message}));
    });
    return;
  }
  setWorking(true);
  setTimeout(()=>{
    if(token!==store.workSeq)return;
    try{setWorking(false);compute();}catch(err){console.error(err);setWorking(false);renderEmpty();showError(t('error.searchFailed',{message:err.message}));}
  },30);
}
export function rerender(){
  applyStaticText();
  applyMapLabels();
  store.people.forEach(p=>{if(p.origin)p.origin.district=districtFor(p.origin.lat,p.origin.lon);});
  store.directory.forEach(p=>{p.district=districtFor(p.origin.lat,p.origin.lon);});
  store.results.forEach(r=>{r.district=districtFor(r.lat,r.lon);});
  updateSettingsLabels();
  renderCards();
  if(store.results.length){renderResults(store.activePeople);drawOrigins(store.activePeople);drawCloud(store.settings.budget);applySelection(store.activePeople);}
  else renderEmpty();
  renderDirectoryList();
}