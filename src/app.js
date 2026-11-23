import { LOCALES,KEY } from './js/config.js';
import { store } from './js/store.js';
import { $ } from './js/util.js';
import { t,ensureCatalog,detectLocale,setDocumentLocale,changeLocale,applyStaticText } from './js/i18n.js';
import { loadNodes,loadDistricts,loadNetwork,loadPoi } from './js/data.js';
import { betaVectorsEnabled } from './js/vectors.js';
import { defaultName,applySharedState,restoreState,restoreDirectory,shareScenario,readHashState,save } from './js/state.js';
import { triggerSearch } from './js/engine.js';
import { createMap,drawOrigins } from './js/map.js';
import { renderCards,renderEmpty,renderDirectoryList,applySettingsToDom,applyBetaFeatures,readSettingsFromDom,openDirectory,closeDialog,openLegal,clearError,clearPinMode,showError,commitPeople,setSidebarFace } from './js/ui.js';

async function init(){
  let mapError=null;
  try{createMap();}catch(err){console.error(err);mapError=err;}
  await Promise.all([loadNodes(),loadDistricts(),ensureCatalog('en')]);
  store.EN=store.I18N.en;
  const hashLocale=readHashState()?.locale;
  const storedLocale=LOCALES.includes(hashLocale)?hashLocale:(localStorage.getItem(KEY.locale)||detectLocale());
  if(storedLocale!=='en'){try{await ensureCatalog(storedLocale);}catch(e){store.I18N[storedLocale]=store.EN;}}
  store.locale=LOCALES.includes(storedLocale)?storedLocale:'en';
  setDocumentLocale();
  if(!applySharedState())restoreState();else applySettingsToDom();
  if(betaVectorsEnabled())await loadPoi();
  restoreDirectory();
  applyStaticText();
  renderCards();
  renderEmpty();
  renderDirectoryList();
  if(mapError)showError(t('error.mapFailed',{message:mapError.message||String(mapError)}));
  try{drawOrigins();}catch(err){console.error(err);}
  loadNetwork().catch(err=>{console.error(err);showError(t('error.timetableFailed',{message:err.message}));});
}

$('add').onclick=()=>{if(store.people.length<8){store.people.push({id:`p${store.seq++}`,name:defaultName(store.people.length),origin:null,focus:'time',walkMinutes:20});commitPeople();}};
$('library').onclick=openDirectory;
$('libraryClose').onclick=()=>closeDialog($('peopleDialog'));
$('directorySearch').oninput=renderDirectoryList;
$('peopleDialog').addEventListener('close',()=>{store.pendingDelete=null;store.lastDialogFocus?.focus?.();});
$('legalDialog')?.addEventListener('close',()=>{store.lastDialogFocus?.focus?.();});
$('legalClose')?.addEventListener('click',()=>closeDialog($('legalDialog')));
$('legalDone')?.addEventListener('click',()=>closeDialog($('legalDialog')));
document.querySelectorAll('.legal-button[data-legal]').forEach(button=>{button.onclick=()=>openLegal(button.dataset.legal);});
document.querySelectorAll('.chip').forEach(chip=>chip.onclick=()=>{chip.setAttribute('aria-pressed',String(chip.getAttribute('aria-pressed')!=='true'));clearError();readSettingsFromDom();});
$('tolerance').oninput=readSettingsFromDom;
async function setBetaEnabled(enabled){
  store.settings.beta={vectors:!!enabled};
  save();
  applyBetaFeatures();
  if(betaVectorsEnabled())await loadPoi();
  if(store.results.length)triggerSearch();
}
$('betaBadge').onclick=()=>setBetaEnabled(!betaVectorsEnabled());
document.querySelectorAll('[data-vector]').forEach(input=>{input.oninput=readSettingsFromDom;});
$('locale').onchange=e=>changeLocale(e.target.value);
$('swapFace').onclick=()=>setSidebarFace(store.sidebarFace==='people'?'detail':'people');
$('go').onclick=()=>triggerSearch();
$('emptyRun').onclick=()=>triggerSearch();
$('share').onclick=shareScenario;
$('cancelPin').onclick=clearPinMode;
document.addEventListener('click',e=>{document.querySelectorAll('.suggestions').forEach(s=>{if(!s.hidden&&!s.contains(e.target)){s.hidden=true;const input=s.parentElement.querySelector('.start-input');input?.setAttribute('aria-expanded','false');}});});
document.addEventListener('keydown',e=>{
  if(store.pinTarget&&e.key==='Escape'){
    e.preventDefault();clearPinMode();
  }
});
if('serviceWorker' in navigator)navigator.serviceWorker.register('sw.js').catch(()=>{});
init();