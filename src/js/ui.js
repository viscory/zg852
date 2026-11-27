import { LETTERS,VECTOR_KEYS,FAIRNESS_METRICS,activeFairnessMetric,travelTolerance,fareTolerance,isUnboundedTolerance,toleranceFromSlider,sliderPositionForTolerance } from './config.js';
import { store } from './store.js';
import { snapWalkMinutes } from './model.js';
import { $,esc,icon,initialsFor,avatarClass,clone } from './util.js';
import { t,tp,intNum,minuteText } from './i18n.js';
import { normalizeVectors,vectorLabel,betaVectorsEnabled } from './vectors.js';
import { syncScrollShadows } from './scroll.js';
import { searchPlaces,districtFor } from './data.js';
import { dedupePlaces,normLabel,photonSearch } from './search.js';
import { fareMarkup,money } from './routing.js';
import { fareHeatMax } from './fares.js';
import { displayName,save,saveDirectory,profileFromPerson,profileLabel,profileDistrict } from './state.js';
import { scheduleRecompute } from './engine.js';
import { hideTooltip,clearMapOutput,selectResult } from './map.js';
import { isMobileLayout,setMobileView } from './mobile.js';


const LEGAL_KINDS=['privacy','terms','credits','process'];
// Deliberately keyed by DOM node: type-ahead state (pending matches, chosen
// suggestion, debounce handles) belongs to one input and must be collected with
// it. This is transient, input-scoped state only - no global configuration and
// no new globals are introduced.
const originStates=new WeakMap();
const tooltipTimers=new WeakMap();
const runningMotions=new WeakMap();
// Listeners waiting for the first successful search render (used by the mobile
// shared-link handoff). A Set makes registration idempotent and lets callers
// unsubscribe themselves without exposing any new global.
const searchSettledListeners=new Set();
export function onSearchSettled(callback){
  searchSettledListeners.add(callback);
  return ()=>searchSettledListeners.delete(callback);
}
function notifySearchSettled(){
  searchSettledListeners.forEach(callback=>callback());
}
// These frames are defined here so the Web Animations API owns the timing,
// cancellation and completion signal for the flip and mobile screen-in.
const FLIP_OUT_FRAMES=[{transform:'rotateY(0)'},{transform:'rotateY(90deg)'}];
const FLIP_IN_FRAMES=[{transform:'rotateY(-90deg)'},{transform:'none'}];
export const SCREEN_IN_FRAMES=[{opacity:0,transform:'translateY(6px)'},{opacity:1,transform:'none'}];
// One driver for the sidebar flip and the mobile screen-in. A new call cancels
// the animation already running on that element, reduced motion jumps straight
// to the end state, and onDone runs only once the element has settled. Returns
// false when the call was reduced or superseded, so callers can skip later steps.
export async function playMotion(element,keyframes,options,onDone){
  const previous=runningMotions.get(element);
  if(previous)previous.cancel();
  if(matchMedia('(prefers-reduced-motion: reduce)').matches){onDone?.();return false;}
  const animation=element.animate(keyframes,options);
  runningMotions.set(element,animation);
  try{await animation.finished;}catch{return false;}
  if(runningMotions.get(element)!==animation)return false;
  runningMotions.delete(element);
  animation.cancel();
  onDone?.();
  return true;
}
function originState(input,patch={}){
  if(!input)return null;
  let state=originStates.get(input);
  if(!state){state={person:null,sug:null,options:[],query:'',choosing:false,cancel:null};originStates.set(input,state);}
  return Object.assign(state,patch);
}
function placeKey(place){
  if(place?.kind==='local')return `local:${place.node}`;
  if(place?.osm?.id!=null)return `osm:${place.osm.type}:${place.osm.id}`;
  return `coords:${Number(place?.lat).toFixed(5)},${Number(place?.lon).toFixed(5)}:${normLabel(place?.label||'')}`;
}
function clearTypedError(input){
  input?.closest('.start-field')?.querySelector('.typed-origin-error')?.remove();
}
function showTypedError(input,message){
  const field=input?.closest('.start-field');if(!field)return;
  let el=field.querySelector('.typed-origin-error');
  if(!el){
    el=document.createElement('div');
    el.className='error suggestion-error typed-origin-error';
    el.setAttribute('role','alert');
    field.appendChild(el);
  }
  el.textContent=message;
}
function clearDirectoryError(){
  $('peopleDialog')?.querySelector('.directory-error')?.remove();
}
function showDirectoryError(message){
  const dialog=$('peopleDialog');if(!dialog)return;
  let el=dialog.querySelector('.directory-error');
  if(!el){
    el=document.createElement('div');
    el.className='error directory-error';el.setAttribute('role','alert');
    const list=$('directoryList');
    if(list)list.before(el);else dialog.appendChild(el);
  }
  el.textContent=message;
}
function personForInput(input){
  const state=originStates.get(input);
  if(state?.person)return state.person;
  const id=input?.closest('.card')?.dataset?.id;
  return id?store.people.find(p=>p.id===id)||null:null;
}
export function showError(message){
  const el=$('error');el.textContent=message;el.hidden=false;
  const mobile=$('mobileError');if(mobile){mobile.textContent=message;mobile.hidden=false;}
  const state=$('resultState');
  // The alert already says why there are no areas; the pre-search prompt would
  // contradict it.
  if(state&&!store.results.length)state.hidden=true;
  // The mobile Fair areas panel replaces the desktop alert, so its hint must
  // explain the failure instead of telling users to redo completed setup.
  if(!store.results.length)syncMobileResults('error',store.activePeople,message);
}
export function clearError(){
  const el=$('error');el.textContent='';el.hidden=true;
  const mobile=$('mobileError');if(mobile){mobile.textContent='';mobile.hidden=true;}
  syncMobileResults('ready');
}
let pointNoticeTimer=null;
function hidePointNotice(){
  clearTimeout(pointNoticeTimer);pointNoticeTimer=null;
  const notice=$('pointNotice');if(notice)notice.hidden=true;
}
export function showPointNotice(message){
  const notice=$('pointNotice'),text=$('pointNoticeText');
  if(!notice||!text)return;
  text.textContent=message;
  notice.hidden=false;
  applyUnboundedUi();
  clearTimeout(pointNoticeTimer);
  pointNoticeTimer=setTimeout(()=>{hidePointNotice();applyUnboundedUi();},7000);
}
export function clearPointNotice(){
  hidePointNotice();
  applyUnboundedUi();
}
export function setLabel(el,value){if(!el)return;el.setAttribute('aria-label',value);el.title=value;el.dataset.tooltip=value;}
// Typed start text is only a query until it is resolved to a real place. Keep
// the query beside the input so Enter, blur and Search can all commit it.
function resolveTypedOrigin(input,{announce=true,global=true}={}){
  if(!input)return true;
  const state=originState(input),person=personForInput(input),typed=input.value.trim();
  if(!typed||!person||typed===(person.origin?.label||'')){
    state.query='';clearTypedError(input);return true;
  }
  const key=normLabel(typed);
  const local=searchPlaces(typed,8).filter(place=>place.kind==='local'&&normLabel(place.label)===key);
  const displayed=state.options||[];
  let matches=displayed.filter(place=>normLabel(place.label)===key);
  if(!matches.length)matches=displayed.filter(place=>normLabel(place.label).includes(key));
  const unique=[...new Map([...local,...matches].map(place=>[placeKey(place),place])).values()];
  if(unique.length===1){
    setOrigin(person,unique[0],input,state.sug);
    state.query='';clearTypedError(input);return true;
  }
  state.query=typed;
  if(announce){
    const message=t('search.selectSuggestion');
    showTypedError(input,message);
    if(global)showError(message);
  }
  return false;
}
function resolveAllPendingOrigins(){
  let resolved=true;
  document.querySelectorAll('.start-input').forEach(input=>{
    if(!resolveTypedOrigin(input,{announce:true,global:false}))resolved=false;
  });
  if(!resolved)showError(t('search.selectSuggestion'));
  return resolved;
}
export function hasPendingOrigins(){
  return [...document.querySelectorAll('.start-input')].some(input=>{
    const person=personForInput(input),typed=input.value.trim();
    return Boolean(person&&typed&&typed!==(person.origin?.label||''));
  });
}
export async function setSidebarFace(face){
  if(face!=='people'&&face!=='detail'||store.sidebarFace===face)return;
  const stage=$('flipStage');
  const apply=()=>{
    store.sidebarFace=face;
    document.querySelectorAll('.side-left [data-face]').forEach(el=>{el.hidden=el.dataset.face!==face;});
    // The button names what it reveals, so the people inputs are never hidden
    // behind a control that sounds like it merely exchanges the two panes.
    const toggle=$('swapFace');
    if(toggle){
      const key=face==='people'?'sidebar.showRoute':'sidebar.showPeople';
      const label=t(key);
      toggle.dataset.i18nAriaLabel=key;
      toggle.dataset.i18nTooltip=key;
      toggle.setAttribute('aria-label',label);
      toggle.setAttribute('title',label);
      toggle.setAttribute('data-tooltip',label);
      const glyph=toggle.querySelector('.icon');
      if(glyph)glyph.className=`icon icon-${face==='people'?'route':'users'}`;
    }
  };
  if(!stage||matchMedia('(prefers-reduced-motion: reduce)').matches){apply();return;}
  stage.classList.remove('flip-in');
  stage.classList.add('flip-out');
  const completed=await playMotion(stage,FLIP_OUT_FRAMES,{duration:280,easing:'ease-in',fill:'forwards'},()=>{
    stage.classList.remove('flip-out');
    apply();
  });
  if(!completed)return;
  stage.classList.add('flip-in');
  await playMotion(stage,FLIP_IN_FRAMES,{duration:280,easing:'ease-out'},()=>{
    stage.classList.remove('flip-in');
  });
}
export function flashTooltip(element,message){
  if(!element)return;
  const original=element.dataset.tooltip||element.getAttribute('aria-label')||'';
  setLabel(element,message);
  clearTimeout(tooltipTimers.get(element));
  tooltipTimers.set(element,setTimeout(()=>setLabel(element,original),1600));
}
let actionStatusTimer=null;
export function hideActionStatus(){
  clearTimeout(actionStatusTimer);actionStatusTimer=null;
  const status=$('actionStatus');if(status){status.hidden=true;status.replaceChildren();}
}
export function showActionStatus(message,{actionLabel='',onAction=null,duration=6000}={}){
  const status=$('actionStatus');if(!status)return;
  clearTimeout(actionStatusTimer);
  status.replaceChildren();
  const text=document.createElement('span');
  text.textContent=message;
  status.appendChild(text);
  if(actionLabel&&typeof onAction==='function'){
    const button=document.createElement('button');
    button.type='button';button.className='action-undo';button.textContent=actionLabel;
    button.onclick=()=>{hideActionStatus();onAction();};
    status.appendChild(button);
  }
  status.hidden=false;
  actionStatusTimer=setTimeout(()=>{status.hidden=true;status.replaceChildren();},duration);
}
function activeMetric(){
  return activeFairnessMetric(store.settings.fairness);
}
function activeTolerance(metric=activeMetric()){
  return metric==='fare'?fareTolerance(store.settings.fareTolerance):travelTolerance(store.settings.tolerance);
}
export function setFairness(metric){
  if(!FAIRNESS_METRICS.includes(metric)||metric===activeMetric())return;
  store.settings.fairness=metric;
  save();
  applySettingsToDom();
  scheduleRecompute();
}
export function updateSettingsLabels(){
  const metric=activeMetric();
  const tolerance=activeTolerance(metric);
  const value=isUnboundedTolerance(tolerance)?t('options.unbounded'):`${Math.round(tolerance*100)}%`;
  const tolval=$('tolval');if(tolval)tolval.textContent=value;
  const slider=$('tolerance');if(slider)slider.setAttribute('aria-valuetext',value);
  const label=$('toleranceLabel');
  if(label){const key=metric==='fare'?'options.fareTolerance':'options.tolerance';label.dataset.i18n=key;label.textContent=t(key);}
  document.querySelectorAll('#fairnessToggle [data-fairness]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.fairness===metric)));
  const legend=$('legendFairText');
  if(legend){const key=metric==='fare'?'map.fairFare':'map.fairArea';legend.dataset.i18n=key;legend.textContent=t(key);}
  const scale=$('legendFareScale');
  if(scale){
    scale.hidden=metric!=='fare';
    if(metric==='fare')scale.textContent=`${money(0)}–${money(fareHeatMax())}`;
  }
  $('includeHeadway').checked=store.settings.includeHeadway!==false;
  store.settings.vectors=normalizeVectors(store.settings.vectors);
  VECTOR_KEYS.forEach(key=>{const label=$(`vec-${key}-val`);if(label)label.textContent=vectorLabel(store.settings.vectors[key]);});
}
// Free point picking needs a solved network and a completed search. Showing
// the hint earlier invites map taps that cannot produce a route yet.
export function isUnboundedReady(){
  return Boolean(store.unbounded&&store.NET&&store.effectiveGrids&&store.activePeople.length&&store.results.length);
}
export function applyUnboundedUi(){
  const ready=isUnboundedReady();
  if(!ready&&store.pointSelection)store.pointSelection=null;
  if(!store.unbounded)hidePointNotice();
  const pin=$('pinBanner');
  const pinning=Boolean(store.pinTarget)||Boolean(pin&&!pin.hidden);
  // The pin banner, point banner, notice and unlimited hint share the top slot;
  // the most specific state wins so they never stack or peek out behind each other.
  const noticeVisible=Boolean($('pointNotice')&&!$('pointNotice').hidden);
  const hint=$('unboundedHint');if(hint)hint.hidden=!ready||pinning||Boolean(store.pointSelection)||noticeVisible;
  const banner=$('pointBanner');if(banner)banner.hidden=!ready||!store.pointSelection;
  const label=$('pointLabel');if(label&&ready&&store.pointSelection)label.textContent=t('map.pinnedPoint');
}
export function applyBetaFeatures(){
  const enabled=betaVectorsEnabled();
  const stateKey=enabled?'beta.on':'beta.off';
  const badge=$('betaBadge');if(badge)badge.setAttribute('aria-pressed',String(enabled));
  const badgeState=$('betaBadgeState');if(badgeState){badgeState.dataset.i18n=stateKey;badgeState.textContent=t(stateKey);}
  const section=$('vectorSection');if(section)section.hidden=!enabled;
  const legendKey=$('legendVectorKey');if(legendKey)legendKey.hidden=!enabled;
  const diagnostics=$('exportDiagnostics');if(diagnostics)diagnostics.hidden=!enabled;
  const mobileBeta=$('mobileBeta');if(mobileBeta)mobileBeta.setAttribute('aria-pressed',String(enabled));
  const mobileBetaState=$('mobileBetaState');if(mobileBetaState){mobileBetaState.dataset.i18n=stateKey;mobileBetaState.textContent=t(stateKey);}
}
export function applySettingsToDom(){
  document.querySelectorAll('.chip').forEach(c=>c.setAttribute('aria-pressed',String(store.settings.modes.includes(c.dataset.mode))));
  const headway=$('includeHeadway');
  if(headway)headway.onchange=()=>{clearError();readSettingsFromDom();};
  const metric=activeMetric();
  $('tolerance').value=sliderPositionForTolerance(activeTolerance(metric));
  store.unbounded=isUnboundedTolerance(activeTolerance(metric));
  if(!store.unbounded)store.pointSelection=null;
  applyUnboundedUi();
  store.settings.vectors=normalizeVectors(store.settings.vectors);
  document.querySelectorAll('[data-vector]').forEach(input=>{input.value=store.settings.vectors[input.dataset.vector];});
  applyBetaFeatures();
  updateSettingsLabels();
}
export function readSettingsFromDom(){
  store.settings.modes=[...document.querySelectorAll('.chip[aria-pressed="true"]')].map(c=>c.dataset.mode);
  store.settings.includeHeadway=$('includeHeadway')?.checked!==false;
  const metric=activeMetric();
  const tolerance=toleranceFromSlider($('tolerance').value);
  if(metric==='fare')store.settings.fareTolerance=fareTolerance(tolerance);
  else store.settings.tolerance=travelTolerance(tolerance);
  store.unbounded=isUnboundedTolerance(activeTolerance(metric));
  if(!store.unbounded)store.pointSelection=null;
  applyUnboundedUi();
  const vectors=normalizeVectors(store.settings.vectors);
  document.querySelectorAll('[data-vector]').forEach(input=>{vectors[input.dataset.vector]=Number(input.value);});
  store.settings.vectors=vectors;
  applyBetaFeatures();
  updateSettingsLabels();
  save();
  scheduleRecompute();
}
export function syncMobileResults(mode='ready',active=store.activePeople,message=''){
  const row=$('mobileScenarioRow'),text=$('mobileScenarioText'),empty=$('mobileResultsEmpty');
  const title=$('mobileEmptyTitle'),hint=$('mobileEmptyHint'),button=$('goPlan');
  if(!row||!empty)return;
  if(!isMobileLayout()){row.hidden=true;empty.hidden=true;return;}
  if(mode==='error'){
    row.hidden=true;empty.hidden=false;
    if(title){title.dataset.i18n='results.emptyShort';title.textContent=t('results.emptyShort');}
    if(hint){hint.hidden=false;hint.dataset.i18n='';hint.textContent=message||t('results.emptyHint');}
    if(button)button.hidden=false;
    return;
  }
  if(mode==='loading'){
    row.hidden=true;empty.hidden=false;
    if(title){title.dataset.i18n='options.searching';title.textContent=t('options.searching');}
    if(hint)hint.hidden=true;
    if(button)button.hidden=true;
    return;
  }
  if(store.results.length){
    const labels=active.filter(person=>person.origin?.label).map(person=>person.origin.label);
    const summary=labels.length>2?`${labels[0]} → ${labels[1]} +${labels.length-2}`:labels.join(' → ');
    row.hidden=!summary;
    if(text)text.textContent=summary;
    empty.hidden=true;
  }else{
    row.hidden=true;empty.hidden=false;
    if(title){title.dataset.i18n='results.emptyShort';title.textContent=t('results.emptyShort');}
    if(hint){hint.hidden=false;hint.dataset.i18n='results.emptyHint';hint.textContent=t('results.emptyHint');}
    if(button){button.hidden=false;}
  }
}
function resultPersonMarkup(route,j,active){
  const name=esc(displayName(active[j],j));
  return `<span class="result-person"><span class="avatar ${avatarClass(j)}">${esc(initialsFor(displayName(active[j],j)))}</span><span class="person-name" title="${name}" aria-label="${name}">${name}</span>${fareMarkup(route)}</span>`;
}
function resultHeadMarkup(r){
  return `<span class="result-head"><b>${esc(r.label)}</b><span class="tag">${esc(t('cat.'+r.catKey))}</span><span class="district">${esc(r.district)}</span></span>`;
}
function resultTimesMarkup(r){
  return `<span class="result-times"><span>${esc(store.settings.fairness==='fare'?t('results.fareSpread',{value:money(r.fareGap)}):t('results.spread',{value:intNum(r.gap)}))}</span><span>${esc(t('results.longest',{value:intNum(r.slowest)}))}</span></span>`;
}
function resultRowMarkup(r,i,active){
  return `<div role="listitem"><button class="result-row" type="button" data-index="${i}" aria-label="${esc(`${t('results.selectTitle')}: ${r.label}`)}">
    ${resultHeadMarkup(r)}
    ${resultTimesMarkup(r)}
    <span class="result-people">${r.routes.map((route,j)=>resultPersonMarkup(route,j,active)).join('')}</span>
  </button></div>`;
}
export function renderResults(active=store.activePeople){
  const list=$('resultsList'),state=$('resultState'),count=$('nres');
  if(!list||!state||!count)return;
  if(!store.results.length){
    list.innerHTML='';
    state.textContent=t('results.empty');
    state.hidden=false;
    count.textContent='';
    syncMobileResults('ready',active);
    applyUnboundedUi();
    requestAnimationFrame(syncScrollShadows);
    return;
  }
  state.hidden=true;
  count.textContent=t('results.header',{count:store.results.length});
  syncMobileResults('ready',active);
  // Never switch mobile panes from a recompute: only explicit navigation or
  // selecting a result may move the user out of the pane they are editing.
  list.innerHTML=store.results.map((r,i)=>resultRowMarkup(r,i,active)).join('');
  list.querySelectorAll('.result-row').forEach(row=>{row.onclick=()=>selectResult(Number(row.dataset.index),active,true);});
  markSelectedResult();
  applyUnboundedUi();
  requestAnimationFrame(syncScrollShadows);
  // Results are now on screen. Notify only here - not in setWorking or the
  // empty branch - so consumers act on real results, never a skeleton.
  notifySearchSettled();
}
export function markSelectedResult(){
  document.querySelectorAll('.result-row').forEach(row=>row.classList.toggle('selected',Number(row.dataset.index)===store.selected));
}
export function renderEmpty(){
  clearError();
  clearMapOutput();
  renderResults();
}
export function renderSkeleton(){
  clearError();
  clearMapOutput();
  const state=$('resultState'),count=$('nres');
  if(state){state.textContent=t('options.searching');state.hidden=false;}
  if(count)count.textContent='';
  syncMobileResults('loading');
  applyUnboundedUi();
}
export function setWorking(working){
  const label=working?t('options.searching'):t('options.search');
  const go=$('go');go.disabled=working;go.title=label;go.dataset.tooltip=label;go.setAttribute('aria-label',label);
  $('goLabel').textContent=label;
  if(working)renderSkeleton();
}
export function setOrigin(person,place,input,sug){
  const state=originState(input,{sug:sug||null});
  state.cancel?.();state.query='';state.choosing=false;clearTypedError(input);
  if(place.kind==='local')person.origin={kind:'node',node:place.node,label:place.label,lat:place.lat,lon:place.lon,district:place.district||districtFor(place.lat,place.lon)};
  else person.origin={kind:'coords',source:place.source||'photon',label:place.label,lat:place.lat,lon:place.lon,osm:place.osm||null,district:place.district||districtFor(place.lat,place.lon)};
  if(input)input.value=place.label;
  if(sug){sug.hidden=true;input?.setAttribute('aria-expanded','false');input?.removeAttribute('aria-activedescendant');}
  clearError();save();scheduleRecompute();
}
export function renderSuggestions(sug,entries,person,input,failed=false,settled=false,onChoose){
  const items=dedupePlaces(entries,8);
  const state=originState(input,{person,sug,options:items});
  sug.innerHTML='';
  let active=-1;
  const rows=()=>[...sug.querySelectorAll('.suggestion')];
  const highlight=next=>{
    const all=rows();if(!all.length)return;
    active=(next+all.length)%all.length;
    all.forEach((row,i)=>{
      row.classList.toggle('active',i===active);
      row.setAttribute('aria-selected',String(i===active));
    });
    all[active].scrollIntoView({block:'nearest'});
    input.setAttribute('aria-activedescendant',all[active].id);
  };
  const appendError=message=>{
    const d=document.createElement('div');
    d.className='suggestion-error';d.textContent=message;
    d.setAttribute('role','option');d.setAttribute('aria-disabled','true');
    sug.appendChild(d);
  };
  if(failed||(settled&&!items.length))appendError(t(failed?'search.unavailable':'search.none'));
  items.forEach((place,i)=>{
    const d=document.createElement('div');d.className='suggestion';d.id=`${sug.id}-option-${i}`;
    d.setAttribute('role','option');d.setAttribute('aria-selected','false');d.tabIndex=-1;
    d.innerHTML=`<span class="avatar ${avatarClass(i)}">${esc(initialsFor(place.label))}</span><span class="place-main">${esc(place.label)}</span><span class="tag">${esc(t('tag.'+place.tagKey))}</span>${place.count>1?`<span class="tag">${esc(tp('place.stops',place.count))}</span>`:''}<span class="district">${esc(place.district||districtFor(place.lat,place.lon))}</span>`;
    const choose=()=>{
      const current=originState(input,{person,sug});
      current.choosing=true;
      try{onChoose?.();}
      finally{current.cancel?.();current.choosing=false;setOrigin(person,place,input,sug);}
    };
    // A pointer press blurs the input before the click lands. Mark the panel so
    // the blur handler does not treat a suggestion pick as unresolved text;
    // pointer and mouse press share one handler rather than two copies.
    const markChoosing=()=>{state.choosing=true;};
    d.onpointerdown=markChoosing;
    d.onmousedown=markChoosing;
    d.onclick=choose;
    sug.appendChild(d);
  });
  sug.hidden=!items.length&&!failed&&!(settled&&!items.length);
  input.setAttribute('aria-expanded',String(!sug.hidden));
  input.onkeydown=e=>{
    if(e.key==='ArrowDown'){e.preventDefault();if(sug.hidden){sug.hidden=false;input.setAttribute('aria-expanded','true');}highlight(active+1);}
    else if(e.key==='ArrowUp'){e.preventDefault();highlight(active-1);}
    else if(e.key==='Home'){e.preventDefault();highlight(0);}
    else if(e.key==='End'){e.preventDefault();highlight(rows().length-1);}
    else if(e.key==='Enter'){
      e.preventDefault();
      if(active>=0&&rows()[active]){rows()[active].click();return;}
      // Enter commits an unambiguous typed place, closes the list and runs the
      // same Search action as the button. Ambiguous text stays open so the
      // required suggestion can still be chosen.
      if(resolveTypedOrigin(input)){
        state.cancel?.();
        sug.hidden=true;active=-1;
        input.setAttribute('aria-expanded','false');
        input.removeAttribute('aria-activedescendant');
        $('go')?.click();
      }
    }
    else if(e.key==='Escape'){
      e.preventDefault();state.cancel?.();
      sug.hidden=true;active=-1;input.setAttribute('aria-expanded','false');input.removeAttribute('aria-activedescendant');
    }
  };
}
export function makeCard(person){
  const idx=store.people.indexOf(person),letter=LETTERS[idx%8];
  const id=person.id;
  const saveLabel=esc(t('people.save')),removeLabel=esc(t('people.remove',{letter})),pinLabel=esc(t('people.pin'));
  const card=document.createElement('div');card.className='card';card.dataset.id=id;
  card.innerHTML=`<div class="card-head">
    <span class="avatar ${avatarClass(idx)}">${esc(initialsFor(displayName(person,idx)))}</span>
    <div class="field">
      <label class="label" for="name-${id}">${esc(t('people.name',{letter}))}</label>
      <input class="name-input" id="name-${id}" type="text" placeholder="${esc(t('people.name',{letter}))}" value="${esc(displayName(person,idx))}">
    </div>
    <div class="icon-actions">
      <button class="icon-button save-person" type="button" aria-label="${saveLabel}" title="${saveLabel}" data-tooltip="${saveLabel}">${icon('save')}</button>
      <button class="icon-button remove" type="button" aria-label="${removeLabel}" title="${removeLabel}" data-tooltip="${removeLabel}">${icon('remove')}</button>
    </div>
  </div>
  <div class="start-field field">
    <label class="label" for="start-${id}">${esc(t('people.start'))}</label>
    <div class="start-row">
      <input class="start-input" id="start-${id}" type="text" role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="suggest-${id}" placeholder="${esc(t('people.startPlaceholder'))}" value="${esc(person.origin?.label||'')}">
      <button class="icon-button pin" type="button" aria-label="${pinLabel}" title="${pinLabel}" data-tooltip="${pinLabel}">${icon('pin')}</button>
    </div>
  </div>
  <div class="walk-row slider-row">
    <label for="walk-${id}">${esc(t('people.walkTolerance'))}</label>
    <span class="value" id="walk-${id}-val">${esc(minuteText(person.walkMinutes))}</span>
  </div>
  <input type="range" id="walk-${id}" data-walk min="0" max="60" step="5" value="${person.walkMinutes}">
  <div class="suggestions" id="suggest-${id}" role="listbox" hidden></div>`;
  $('cards').appendChild(card);
  // CSS.escape() output is an identifier escape, not a string escape, so it
  // must not be interpolated into a quoted attribute value. The card already
  // has unique class hooks for these two inputs; the ids stay on the markup
  // for their labels and are left untouched.
  const nameInput=card.querySelector('.name-input');
  const input=card.querySelector('.start-input');
  const sug=card.querySelector('.suggestions');
  let timer=null,controller=null,requestSeq=0;
  const state=originState(input,{person,sug,options:[],cancel:null});
  const cancelSearch=()=>{clearTimeout(timer);if(controller)controller.abort();requestSeq++;};
  state.cancel=cancelSearch;
  nameInput.addEventListener('input',()=>{person.name=nameInput.value;save();refreshMeta();refreshPersonLabels();});
  input.addEventListener('focus',()=>{
    // The mobile deck can place a start field below the on-screen keyboard
    // zone. Expanding the sheet and scrolling the focused field into view
    // keeps it reachable on short phones without changing desktop layout.
    if(!isMobileLayout())return;
    setMobileView('plan');
    input.scrollIntoView({block:'center'});
  });
  input.addEventListener('input',()=>{
    cancelSearch();
    const q=input.value.trim();
    state.query=q;state.options=[];clearTypedError(input);
    if(q.length<2){
      sug.hidden=true;sug.innerHTML='';state.options=[];
      input.setAttribute('aria-expanded','false');input.removeAttribute('aria-activedescendant');
      return;
    }
    const local=dedupePlaces(searchPlaces(q,8),8);
    renderSuggestions(sug,local,person,input,false,false,cancelSearch);
    if(q.length<3&&![...q].some(ch=>ch.charCodeAt(0)>127))return;
    const mine=++requestSeq;
    timer=setTimeout(async()=>{
      controller=new AbortController();
      try{
        const remote=await photonSearch(q,controller.signal);
        if(mine===requestSeq)renderSuggestions(sug,local.concat(remote),person,input,false,true,cancelSearch);
      }catch(e){if(mine===requestSeq&&e.name!=='AbortError')renderSuggestions(sug,local,person,input,true,true,cancelSearch);}
    },350);
  });
  input.addEventListener('blur',()=>{
    if(state.choosing)return;
    resolveTypedOrigin(input);
  });
  card.querySelector('.save-person').onclick=()=>savePersonToDirectory(person);
  card.querySelector('.remove').onclick=()=>{
    if(store.pinTarget===id)clearPinMode();
    const index=store.people.indexOf(person);
    if(index<0)return;
    const name=displayName(person,index);
    store.people.splice(index,1);
    commitPeople();
    showActionStatus(t('people.removed',{name}),{actionLabel:t('people.undo'),onAction:()=>{
      store.people.splice(Math.min(index,store.people.length),0,person);
      commitPeople();
      showActionStatus(t('people.restored',{name}));
    }});
  };
  card.querySelector('.pin').onclick=()=>startPinMode(id,input,sug);
  const walk=card.querySelector('[data-walk]'),walkValue=card.querySelector('.walk-row .value');
  walk.oninput=()=>{
    person.walkMinutes=snapWalkMinutes(walk.value);
    walkValue.textContent=minuteText(person.walkMinutes);
    save();scheduleRecompute();
  };
  refreshMeta();
}
export function renderCards(){
  const saved=store.people.slice();store.people=[];
  $('cards').innerHTML='';
  saved.forEach(p=>{store.people.push(p);makeCard(p);});
  refreshMeta();
}
export function refreshMeta(){
  $('count').textContent=store.people.length;
  const countLabel=$('countLabel');if(countLabel)countLabel.textContent=tp('people.count',store.people.length);
  const add=$('add');
  if(add){
    const atMax=store.people.length>=8,key=atMax?'people.max':'people.add';
    add.disabled=atMax;
    add.dataset.i18nTooltip=key;add.dataset.i18nAriaLabel=key;
    setLabel(add,t(key));
  }
  document.querySelectorAll('.card').forEach(card=>{
    const person=store.people.find(p=>p.id===card.dataset.id);if(!person)return;
    const idx=store.people.indexOf(person),letter=LETTERS[idx%8];
    const avatar=card.querySelector('.avatar');if(avatar){avatar.textContent=initialsFor(displayName(person,idx));avatar.className=`avatar ${avatarClass(idx)}`;}
    const nameLabel=card.querySelector('label[for^="name-"]');if(nameLabel)nameLabel.textContent=t('people.name',{letter});
    const nameInput=card.querySelector('.name-input');if(nameInput)nameInput.placeholder=t('people.name',{letter});
    const startLabel=card.querySelector('label[for^="start-"]');if(startLabel)startLabel.textContent=t('people.start');
    const startInput=card.querySelector('.start-input');if(startInput)startInput.placeholder=t('people.startPlaceholder');
    const walkLabel=card.querySelector('.walk-row label');if(walkLabel)walkLabel.textContent=t('people.walkTolerance');
    const walkValue=card.querySelector('.walk-row .value');if(walkValue)walkValue.textContent=minuteText(person.walkMinutes);
    const remove=card.querySelector('.remove');remove.hidden=store.people.length<=1;setLabel(remove,t('people.remove',{letter}));
    setLabel(card.querySelector('.pin'),t('people.pin'));
    setLabel(card.querySelector('.save-person'),t('people.save'));
  });
}
// Result rows and route steps are built from activePeople. Refresh just their
// labels on rename so the name input keeps focus and its caret.
export function refreshPersonLabels(){
  const active=store.activePeople;
  if(!active.length)return;
  document.querySelectorAll('.result-row').forEach(row=>{
    row.querySelectorAll('.result-person').forEach((entry,j)=>{
      const person=active[j];if(!person)return;
      const name=displayName(person,j);
      const label=entry.querySelector('.person-name');if(label){label.textContent=name;label.title=name;label.setAttribute('aria-label',name);}
      const avatar=entry.querySelector('.avatar');if(avatar)avatar.textContent=initialsFor(name);
    });
  });
  document.querySelectorAll('#steps .step:not(.route-empty)').forEach((step,j)=>{
    const person=active[j];if(!person)return;
    const name=displayName(person,j);
    const dot=step.querySelector('.dot');if(dot)dot.textContent=initialsFor(name);
    const bold=step.querySelector('.txt > b');if(bold)bold.textContent=name;
  });
}
function isDefaultPersonName(person,idx){
  const name=String(person?.name||'').trim();
  if(!name)return true;
  const letter=LETTERS[idx%8];
  return [store.EN,...Object.values(store.I18N)].some(catalog=>{
    const template=catalog?.['people.defaultName'];
    return typeof template==='string'&&template.replaceAll('{letter}',letter)===name;
  });
}
// Locale changes re-translate unset default names but never overwrite a name
// the user typed. Cards are left in place so an in-progress query, its
// suggestions and focus all survive the locale switch.
export function refreshTranslatedNames(){
  store.people.forEach(person=>{
    const origin=person.origin;
    if(origin?.source!=='pin'||!origin.district)return;
    const previous=origin.label;
    origin.label=`${t('map.pinnedPoint')} · ${origin.district}`;
    const input=document.querySelector(`.card[data-id="${person.id}"] .start-input`);
    if(input&&document.activeElement!==input&&input.value===previous)input.value=origin.label;
  });
  document.querySelectorAll('.card').forEach(card=>{
    const person=store.people.find(p=>p.id===card.dataset.id);if(!person)return;
    const idx=store.people.indexOf(person);
    if(!isDefaultPersonName(person,idx))return;
    const input=card.querySelector('.name-input');if(!input)return;
    const start=input.selectionStart,end=input.selectionEnd,direction=input.selectionDirection;
    input.value=displayName({name:''},idx);
    if(document.activeElement===input){try{input.setSelectionRange(start,end,direction);}catch{/* Some inputs reject a selection range; the value is already restored. */}}
  });
  refreshMeta();
}
export function commitPeople(){renderCards();save();scheduleRecompute();}
export function clearPinMode(){
  store.pinTarget=null;
  document.body.classList.remove('mobile-picking');
  $('map')?.classList.remove('pinning');
  const banner=$('pinBanner');if(banner)banner.hidden=true;
  applyUnboundedUi();
  hideTooltip();
}
export function startPinMode(id,input,sug){
  const idx=store.people.findIndex(p=>p.id===id);if(idx<0)return;
  store.pinTarget=id;
  document.body.classList.add('mobile-picking');
  $('map').classList.add('pinning');
  const banner=$('pinBanner'),avatar=$('pinAvatar'),label=$('pinLabel');
  avatar.textContent=initialsFor(displayName(store.people[idx],idx));
  avatar.className=`avatar ${avatarClass(idx)}`;
  label.textContent=t('map.pinActive',{name:displayName(store.people[idx],idx)});
  banner.hidden=false;
  if(isMobileLayout())setMobileView('map');
  // A queued Photon response must not reopen the panel we just dismissed.
  originState(input)?.cancel?.();
  if(sug){sug.hidden=true;input?.setAttribute('aria-expanded','false');}
  applyUnboundedUi();
  hideTooltip();
}
export function setPinOrigin(id,lat,lon){
  const idx=store.people.findIndex(p=>p.id===id);if(idx<0)return;
  const district=districtFor(lat,lon);
  store.people[idx].origin={kind:'coords',source:'pin',label:`${t('map.pinnedPoint')} · ${district}`,lat,lon,district};
  clearPinMode();
  clearError();commitPeople();
  if(isMobileLayout())setMobileView('plan');
}
export function savePersonToDirectory(person){
  if(!person.origin){showError(t('people.hintEmpty'));return;}
  const name=displayName(person,store.people.indexOf(person));
  const existing=store.directory.find(d=>d.id===person.directoryId)||store.directory.find(d=>d.name===name&&d.origin?.label===person.origin.label);
  if(existing){existing.name=name;existing.origin=clone(person.origin);existing.walkMinutes=snapWalkMinutes(person.walkMinutes);existing.updated=Date.now();person.directoryId=existing.id;}
  else{const profile=profileFromPerson({...person,name});store.directory.push(profile);person.directoryId=profile.id;}
  saveDirectory();save();renderDirectoryList();flashSaved(person.id);
}
export function flashSaved(id){
  // Compare the attribute value as data: CSS.escape() would be a selector
  // identifier escape inside this quoted attribute string, not a string escape.
  const card=[...document.querySelectorAll('.card')].find(card=>card.dataset.id===id);if(!card)return;
  const message=t('people.saved');
  flashTooltip(card.querySelector('.save-person'),message);
  showActionStatus(message);
}
export function deleteDirectoryPerson(id){
  const name=store.directory.find(d=>d.id===id)?.name||'';
  store.directory=store.directory.filter(d=>d.id!==id);
  store.people.forEach(p=>{if(p.directoryId===id)p.directoryId=null;});
  saveDirectory();save();renderDirectoryList();scheduleRecompute();
  showActionStatus(name?t('people.removed',{name}):t('people.saved'));
}
export function addDirectoryPerson(profile){
  if(!profile)return false;
  if(store.people.length>=8){
    const message=t('people.max');showDirectoryError(message);showError(message);return false;
  }
  clearDirectoryError();
  store.people.push({id:`p${store.seq++}`,name:profile.name,origin:clone(profile.origin),directoryId:profile.id,walkMinutes:snapWalkMinutes(profile.walkMinutes)});
  commitPeople();
  showActionStatus(t('people.saved'));
  return true;
}
export function editDirectoryPerson(profile){
  if(!profile)return false;
  let person=store.people.find(p=>p.directoryId===profile.id);
  if(!person){
    // Editing a profile that is not on the board would add a ninth person.
    if(store.people.length>=8){
      const message=t('people.max');showDirectoryError(message);showError(message);return false;
    }
    if(!addDirectoryPerson(profile))return false;
    person=store.people[store.people.length-1];
  }
  clearDirectoryError();
  person.name=profile.name;person.origin=clone(profile.origin);person.walkMinutes=snapWalkMinutes(profile.walkMinutes);
  commitPeople();
  showActionStatus(t('people.saved'));
  return true;
}
export function renderDirectoryList(){
  const list=$('directoryList');if(!list)return;
  const query=($('directorySearch')?.value||'').trim().toLowerCase();
  const items=store.directory.filter(p=>[p.name,profileLabel(p),profileDistrict(p)].join(' ').toLowerCase().includes(query));
  list.innerHTML=items.length?items.map(p=>{
    const addLabel=esc(t('people.libraryAdd')),editLabel=esc(t('people.libraryEdit')),deleteLabel=esc(store.pendingDelete===p.id?`${t('people.libraryDelete')}?`:t('people.libraryDelete'));
    return `<div class="directory-row" data-id="${esc(p.id)}" role="listitem" tabindex="0">
    <div class="directory-copy"><b>${esc(p.name)}</b><span>${esc(profileLabel(p))}</span><span class="district">${esc(profileDistrict(p))}</span></div>
    <div class="directory-actions">
      <button class="icon-button" type="button" data-action="add" aria-label="${addLabel}" title="${addLabel}" data-tooltip="${addLabel}">${icon('add')}</button>
      <button class="icon-button" type="button" data-action="edit" aria-label="${editLabel}" title="${editLabel}" data-tooltip="${editLabel}">${icon('edit')}</button>
      <button class="icon-button" type="button" data-action="delete" aria-label="${deleteLabel}" title="${deleteLabel}" data-tooltip="${deleteLabel}">${icon('remove')}</button>
    </div></div>`;}).join(''):`<div class="directory-empty">${esc(t('people.libraryEmpty'))}</div>`;
  list.querySelectorAll('button').forEach(button=>button.onclick=()=>{
    const row=button.closest('.directory-row'),profile=store.directory.find(d=>d.id===row?.dataset.id),action=button.dataset.action;
    if(action==='add'&&profile){if(addDirectoryPerson(profile))closeDialog($('peopleDialog'));}
    else if(action==='edit'&&profile){if(editDirectoryPerson(profile))closeDialog($('peopleDialog'));}
    else if(action==='delete'&&profile){
      if(store.pendingDelete===profile.id){deleteDirectoryPerson(profile.id);store.pendingDelete=null;}else{store.pendingDelete=profile.id;renderDirectoryList();}
    }
  });
  list.onkeydown=e=>{
    const rows=[...list.querySelectorAll('.directory-row')];if(!rows.length)return;
    const i=rows.indexOf(document.activeElement);
    if(e.key==='ArrowDown'){e.preventDefault();rows[Math.min(rows.length-1,i+1)].focus();}
    if(e.key==='ArrowUp'){e.preventDefault();rows[Math.max(0,i-1)].focus();}
  };
}
export function openDialog(dialog,focusTarget){
  if(!dialog)return;
  store.lastDialogFocus=document.activeElement;
  if(typeof dialog.showModal==='function')dialog.showModal();else dialog.setAttribute('open','');
  if(focusTarget)focusTarget.focus();
}
export function closeDialog(dialog){
  if(!dialog)return;
  if(typeof dialog.close==='function')dialog.close();else{dialog.removeAttribute('open');store.lastDialogFocus?.focus?.();}
}
export function openDirectory(){
  store.pendingDelete=null;
  hideActionStatus();
  clearDirectoryError();
  renderDirectoryList();
  openDialog($('peopleDialog'),$('directorySearch'));
}
function legalKindFromHref(href){
  try{
    const url=new URL(href,location.href);
    if(url.origin!==location.origin)return null;
    const kind=(url.pathname.split('/').pop()||'').replace(/\.html?$/i,'').toLowerCase();
    return LEGAL_KINDS.includes(kind)?kind:null;
  }catch{return null;}
}
function legalNote(kind){
  const fragment=document.createDocumentFragment();
  const summary=document.createElement('p');
  summary.className='legal-summary';summary.lang=store.locale;
  summary.textContent=t(`legal.summary${kind[0].toUpperCase()}${kind.slice(1)}`);
  fragment.appendChild(summary);
  const note=document.createElement('p');
  note.className='legal-note';note.textContent=t('legal.englishOnly');
  fragment.appendChild(note);
  return fragment;
}
function setLegalBody(kind,main){
  const body=$('legalBody');if(!body)return;
  body.lang='en';
  const fragment=document.createDocumentFragment();
  fragment.appendChild(legalNote(kind));
  if(main)[...main.childNodes].forEach(node=>fragment.appendChild(document.importNode(node,true)));
  body.replaceChildren(fragment);
}
export async function openLegal(kind){
  if(!LEGAL_KINDS.includes(kind))return;
  const dialog=$('legalDialog'),title=$('legalTitle'),body=$('legalBody');
  if(!dialog)return;
  if(title)title.textContent=t(`legal.${kind}`);
  if(body){body.lang='en';body.textContent=t('legal.loading');}
  openDialog(dialog);
  try{
    const response=await fetch(`${kind}.html`);
    if(!response.ok)throw new Error(`${kind} ${response.status}`);
    const doc=new DOMParser().parseFromString(await response.text(),'text/html');
    const main=doc.querySelector('main');
    if(!main)throw new Error('missing main');
    main.querySelectorAll('nav').forEach(nav=>nav.remove());
    // Body links to other legal pages must open in this dialog, not navigate away.
    main.querySelectorAll('a[href]').forEach(link=>{
      const target=legalKindFromHref(link.getAttribute('href'));
      if(!target)return;
      const button=document.createElement('button');
      button.type='button';button.className='legal-button';button.dataset.legal=target;
      button.textContent=link.textContent;
      link.replaceWith(button);
    });
    setLegalBody(kind,main);
  }catch(err){
    console.error(err);
    if(body){setLegalBody(kind,null);const message=document.createElement('p');message.textContent=t('legal.failed');body.appendChild(message);}
  }
}
document.addEventListener('click',event=>{
  const button=event.target?.closest?.('#legalBody .legal-button[data-legal]');
  if(!button)return;
  event.preventDefault();event.stopPropagation();
  openLegal(button.dataset.legal);
});
function installUiListeners(){
  // Single authoritative veto on Search: resolve typed origins first, and if
  // any text is still unresolved, swallow this click before the app's own
  // handler runs. The engine's hasPendingOrigins() guard protects other search
  // entry points; this listener does not rely on it as a fallback.
  $('go')?.addEventListener('click',event=>{
    if(!resolveAllPendingOrigins()){
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  },true);
  document.addEventListener('pointerdown',event=>{
    document.querySelectorAll('.suggestions').forEach(sug=>{
      if(sug.hidden||sug.contains(event.target))return;
      const input=sug.parentElement?.querySelector('.start-input');
      originState(input)?.cancel?.();
    });
  },true);
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',installUiListeners,{once:true});
else installUiListeners();