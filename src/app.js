import { LOCALES,KEY } from './js/config.js';
import { store } from './js/store.js';
import { $ } from './js/util.js';
import { t,ensureCatalog,detectLocale,setDocumentLocale,changeLocale,applyStaticText } from './js/i18n.js';
import { loadNodes,loadDistricts,loadFares,loadNetwork,loadPoi } from './js/data.js';
import { betaVectorsEnabled } from './js/vectors.js';
import { applySharedState,restoreState,restoreDirectory,restoreSelection,readSavedSelection,shareScenario,readHashState,save } from './js/state.js';
import { triggerSearch } from './js/engine.js';
import { createMap,drawOrigins } from './js/map.js';
import { renderCards,renderEmpty,renderDirectoryList,applySettingsToDom,applyBetaFeatures,applyUnboundedUi,readSettingsFromDom,openDirectory,closeDialog,openLegal,clearError,clearPinMode,showError,showActionStatus,commitPeople,setSidebarFace,flashTooltip,setFairness,clearPointNotice } from './js/ui.js';
import { exportDiagnostics } from './js/diagnostics.js';
import { clearPoint } from './js/map.js';
import { initScrollShadows } from './js/scroll.js';
import { initMobile,isMobileLayout,setMobileView,openMobileRoute,closeMobileRoute } from './js/mobile.js';

function storedValue(key){
  try{return localStorage.getItem(key);}
  catch(err){console.error(err);return null;}
}
function loadFailure(label,err){
  const message=`${label}: ${err?.message||String(err)}`;
  return t(label==='Timetable'?'error.timetableFailed':'error.searchFailed',{message});
}
async function init(){
  const errors=[];
  let mapError=null;
  try{createMap();}catch(err){console.error(err);mapError=err;}
  const sources=await Promise.allSettled([loadNodes(),loadDistricts(),loadFares(),ensureCatalog('en')]);
  ['Nodes','Districts','MTR fares','English catalogue'].forEach((label,i)=>{
    const result=sources[i];
    if(result.status==='rejected'){
      console.error(result.reason);
      errors.push(loadFailure(label,result.reason));
    }
  });
  if(sources[3].status==='fulfilled')store.EN=store.I18N.en;
  if(sources[0].status==='rejected')document.documentElement.dataset.net='error';
  const hashLocale=readHashState()?.locale;
  const storedLocale=LOCALES.includes(hashLocale)?hashLocale:(storedValue(KEY.locale)||detectLocale());
  if(storedLocale!=='en'){
    try{await ensureCatalog(storedLocale);}
    catch(err){console.error(err);store.I18N[storedLocale]=store.EN;errors.push(loadFailure(`${storedLocale} catalogue`,err));}
  }
  store.locale=LOCALES.includes(storedLocale)?storedLocale:'en';
  setDocumentLocale();
  // A share link carries both the setup and the chosen result. Re-run the
  // search once the timetable is available so the recipient sees the meeting
  // point immediately instead of an empty results panel.
  const sharedScenario=applySharedState();
  if(!sharedScenario)restoreState();else applySettingsToDom();
  const pendingSelection=readSavedSelection();
  await loadPoi();
  restoreDirectory();
  applyStaticText();
  renderCards();
  renderEmpty();
  renderDirectoryList();
  restoreSelection(pendingSelection);
  applyUnboundedUi();
  if(mapError)errors.push(t('error.mapFailed',{message:mapError.message||String(mapError)}));
  if(errors.length)showError(errors.join(' '));
  try{drawOrigins();}catch(err){console.error(err);}
  if(document.documentElement.dataset.net!=='error'&&store.NODES?.names?.length){
    loadNetwork().then(()=>{
      if(sharedScenario&&store.people.length>=2){
        setMobileView('map');
        triggerSearch(!isMobileLayout());
        if(isMobileLayout())setTimeout(()=>{if(store.results.length&&store.selection)openMobileRoute();},900);
      }
    }).catch(err=>{
      console.error(err);
      document.documentElement.dataset.net='error';
      showError([...errors,loadFailure('Timetable',err)].join(' '));
    });
  }
}

$('add').onclick=()=>{if(store.people.length<8){store.people.push({id:`p${store.seq++}`,name:'',origin:null,walkMinutes:20});commitPeople();}};
$('library').onclick=openDirectory;
$('libraryClose').onclick=()=>closeDialog($('peopleDialog'));
$('directorySearch').oninput=renderDirectoryList;
$('peopleDialog').addEventListener('close',()=>{store.pendingDelete=null;store.lastDialogFocus?.focus?.();});
$('legalDialog')?.addEventListener('close',()=>{store.lastDialogFocus?.focus?.();});
$('legalClose')?.addEventListener('click',()=>closeDialog($('legalDialog')));
$('legalDone')?.addEventListener('click',()=>closeDialog($('legalDialog')));
document.querySelectorAll('dialog').forEach(dialog=>{
  dialog.addEventListener('keydown',event=>{
    if(event.key!=='Tab')return;
    const focusable=[...dialog.querySelectorAll('button:not([disabled]),[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])')].filter(el=>el.offsetParent);
    if(!focusable.length)return;
    const first=focusable[0],last=focusable[focusable.length-1];
    if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}
    else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
  });
});
document.querySelectorAll('.legal-button[data-legal]').forEach(button=>{button.onclick=()=>openLegal(button.dataset.legal);});
document.querySelectorAll('.chip').forEach(chip=>chip.onclick=()=>{
  const on=chip.getAttribute('aria-pressed')==='true';
  if(on&&document.querySelectorAll('.chip[aria-pressed="true"]').length<=1){
    const message=t('error.noMode');
    showError(message);
    showActionStatus(message);
    flashTooltip(chip,message);
    return;
  }
  chip.setAttribute('aria-pressed',String(!on));
  clearError();readSettingsFromDom();
});
document.querySelectorAll('#fairnessToggle [data-fairness]').forEach(button=>button.onclick=()=>setFairness(button.dataset.fairness));
$('tolerance').oninput=readSettingsFromDom;
async function setBetaEnabled(enabled){
  store.settings.beta={vectors:!!enabled};
  save();
  applyBetaFeatures();
  await loadPoi();
  if(store.results.length)triggerSearch();
}
$('betaBadge').onclick=()=>setBetaEnabled(!betaVectorsEnabled());
$('mobileBeta')?.addEventListener('click',()=>setBetaEnabled(!betaVectorsEnabled()));
document.querySelectorAll('[data-vector]').forEach(input=>{input.oninput=readSettingsFromDom;});
$('locale').onchange=e=>changeLocale(e.target.value);
window.addEventListener('hashchange',()=>{
  if(!location.hash.startsWith('#s=')||!applySharedState(true))return;
  applySettingsToDom();renderCards();drawOrigins();
  if(store.people.length>=2)triggerSearch(!isMobileLayout());
});
$('swapFace').onclick=()=>setSidebarFace(store.sidebarFace==='people'?'detail':'people');
$('jumpSettings')?.addEventListener('click',()=>{
  const heading=$('optionsHeading');
  if(!heading)return;
  heading.scrollIntoView({block:'start',behavior:'smooth'});
  heading.focus({preventScroll:true});
});
$('go').onclick=()=>{setMobileView('results');triggerSearch(!isMobileLayout());};
$('share').onclick=shareScenario;
$('cancelPin').onclick=()=>{clearPinMode();setMobileView('plan');};
$('closeRoute')?.addEventListener('click',closeMobileRoute);
$('clearPoint').onclick=clearPoint;
$('dismissPointNotice').onclick=clearPointNotice;
$('exportDiagnostics').onclick=async event=>{
  const button=event.currentTarget;
  const result=await exportDiagnostics();
  const message=result.ok===false?'diag.failed':result.copied?'diag.copied':'diag.downloaded';
  const status=$('diagStatus');
  if(status){status.textContent=t(message);status.hidden=false;}
  flashTooltip(button,t(message));
};
document.addEventListener('click',e=>{document.querySelectorAll('.suggestions').forEach(s=>{if(!s.hidden&&!s.contains(e.target)){s.hidden=true;const input=s.parentElement.querySelector('.start-input');input?.setAttribute('aria-expanded','false');}});});
document.addEventListener('keydown',e=>{
  if(store.pinTarget&&e.key==='Escape'){
    e.preventDefault();clearPinMode();setMobileView('plan');
  }
});
if('serviceWorker' in navigator)navigator.serviceWorker.register('sw.js').catch(()=>{});

 function setDisclosure(root,open){
  if(!root)return;
  root.classList.toggle('open',!!open);
  root.querySelector('.disclosure-head')?.setAttribute('aria-expanded',String(!!open));
}
document.querySelectorAll('.disclosure').forEach(root=>{
  const head=root.querySelector('.disclosure-head');
  if(!head)return;
  setDisclosure(root,root.classList.contains('open'));
  head.addEventListener('click',()=>setDisclosure(root,!root.classList.contains('open')));
});
initMobile();
initScrollShadows();
init().catch(err=>{
  console.error(err);
  if(document.documentElement.dataset.net!=='ready')document.documentElement.dataset.net='error';
  showError(t('error.searchFailed',{message:err?.message||String(err)}));
});