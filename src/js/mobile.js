import { store } from './store.js';
import { $ } from './util.js';
import { t } from './i18n.js';
import { syncScrollShadows } from './scroll.js';
import { invalidateMapSize,revealMap } from './map.js';
import { playMotion,SCREEN_IN_FRAMES } from './ui.js';

const VIEWS=['plan','results','map'];
// The JS breakpoint lives here; CSS has its own matching media query.
const MOBILE_QUERY='(max-width:1024px)';
const mobileQuery=typeof matchMedia==='function'?matchMedia(MOBILE_QUERY):null;
let closeRouteTimer=null;
let routeCardHeightFrame=0;

export function isMobileLayout(){
  return Boolean(mobileQuery?.matches);
}

export function mobileView(){
  return VIEWS.includes(store.mobile?.view)?store.mobile.view:'plan';
}

function syncTabs(){
  document.querySelectorAll('#mobileTabbar [data-mobile-view]').forEach(button=>{
    const active=button.dataset.mobileView===mobileView();
    if(active)button.setAttribute('aria-current','page');
    else button.removeAttribute('aria-current');
  });
}

function syncCopy(){
  const mobile=isMobileLayout();
  const people=$('peopleHeading');
  if(people){
    const key=mobile?'people.tab':'people.title';
    if(people.dataset.i18n!==key){people.dataset.i18n=key;people.textContent=t(key);}
  }
  const options=$('optionsHeading');
  if(options){
    const key=mobile?'options.settings':'options.title';
    if(options.dataset.i18n!==key){options.dataset.i18n=key;options.textContent=t(key);}
  }
}

function syncFace(view){
  if(!isMobileLayout())return;
  const people=document.querySelector('#flipStage [data-face="people"]');
  const detail=document.querySelector('#flipStage [data-face="detail"]');
  if(view==='plan'){
    if(people)people.hidden=false;
    if(detail)detail.hidden=true;
    store.sidebarFace='people';
  }else if(view==='map'){
    if(people)people.hidden=true;
    if(detail)detail.hidden=!document.body.classList.contains('mobile-route-open');
    if(document.body.classList.contains('mobile-route-open'))store.sidebarFace='detail';
  }
}

function playViewAnimation(){
  if(!isMobileLayout())return;
  document.body.classList.remove('mobile-view-anim');
  document.body.classList.add('mobile-view-anim');
  const panels=['.side-left','.side-right','.main'].map(selector=>document.querySelector(selector)).filter(Boolean);
  if(!panels.length){document.body.classList.remove('mobile-view-anim');return;}
  let settled=0;
  const settle=()=>{if(++settled===panels.length)document.body.classList.remove('mobile-view-anim');};
  panels.forEach(panel=>playMotion(panel,SCREEN_IN_FRAMES,{duration:180,easing:'ease-out',fill:'both'},settle));
}

function syncResultsFallback(){
  if(!isMobileLayout())return;
  const empty=$('mobileResultsEmpty'),row=$('mobileScenarioRow');
  if(!empty)return;
  if(store.results.length){empty.hidden=true;if(row)row.hidden=false;}
  else{empty.hidden=false;if(row)row.hidden=true;}
}

// One-way JS -> CSS measurement, not a configuration channel: the measured
// route-card height is published as --route-card-h only so CSS can offset the
// Leaflet controls above the card, and nothing reads it back into JS. The
// ResizeObserver and every explicit state change funnel through here; batching
// keeps one measurement per frame and therefore one control position per frame.
function syncRouteCardHeight(){
  if(routeCardHeightFrame)return;
  routeCardHeightFrame=requestAnimationFrame(()=>{
    routeCardHeightFrame=0;
    const card=document.querySelector('.side-left');
    const shown=card&&getComputedStyle(card).display!=='none';
    const height=shown?Math.round(card.getBoundingClientRect().height):0;
    document.documentElement.style.setProperty('--route-card-h',`${height}px`);
  });
}

function setRouteExpanded(expanded){
  document.body.classList.toggle('mobile-route-expanded',!!expanded);
  const button=$('toggleRoute');
  if(button)button.setAttribute('aria-expanded',String(!!expanded));
  syncRouteCardHeight();
  requestAnimationFrame(invalidateMapSize);
}

function syncLegend(){
  const legend=$('mapLegend');
  if(!legend)return;
  const open=!isMobileLayout();
  legend.classList.toggle('open',open);
  legend.querySelector('.disclosure-head')?.setAttribute('aria-expanded',String(open));
}

export function setMobileView(view,{focus=false}={}){
  if(!isMobileLayout())return;
  const next=VIEWS.includes(view)?view:'plan';
  store.mobile.view=next;
  document.body.dataset.mobileView=next;
  if(next!=='map')document.body.classList.remove('mobile-route-expanded');
  syncTabs();
  syncCopy();
  syncFace(next);
  syncRouteCardHeight();
  syncResultsFallback();
  playViewAnimation();
  requestAnimationFrame(syncScrollShadows);
  if(next==='map'){
    // Leaflet measured a zero-size container while the map screen was hidden.
    requestAnimationFrame(invalidateMapSize);
    revealMap();
  }
  if(focus){
    const tab=document.querySelector(`#mobileTabbar [data-mobile-view="${next}"]`);
    tab?.focus?.({preventScroll:true});
  }
}

// The route card is contextual: it only exists on the Map screen and only
// while an area is selected. It is not a fourth destination and has no snaps.
export function openMobileRoute(){
  if(!isMobileLayout())return;
  clearTimeout(closeRouteTimer);
  document.body.classList.remove('mobile-route-closing');
  document.body.classList.add('mobile-route-open');
  setMobileView('map');
  const button=$('toggleRoute');
  if(button)button.setAttribute('aria-expanded','false');
  document.body.classList.remove('mobile-route-expanded');
  syncRouteCardHeight();
  const people=document.querySelector('#flipStage [data-face="people"]');
  const detail=document.querySelector('#flipStage [data-face="detail"]');
  if(people)people.hidden=true;
  if(detail)detail.hidden=false;
  store.sidebarFace='detail';
}
export function closeMobileRoute(){
  if(!isMobileLayout()||!document.body.classList.contains('mobile-route-open'))return;
  clearTimeout(closeRouteTimer);
  document.body.classList.add('mobile-route-closing');
  closeRouteTimer=setTimeout(()=>{
    document.body.classList.remove('mobile-route-open','mobile-route-expanded','mobile-route-closing');
    const button=$('toggleRoute');
    if(button)button.setAttribute('aria-expanded','false');
    syncRouteCardHeight();
    requestAnimationFrame(invalidateMapSize);
  },170);
}
export function showMobileRoute(){openMobileRoute();}

function syncViewState(){
  if(isMobileLayout()){
    if(!VIEWS.includes(store.mobile.view))store.mobile.view='plan';
    document.body.dataset.mobileView=store.mobile.view;
    syncLegend();syncCopy();
    document.querySelectorAll('#mobileTabbar [data-mobile-view]').forEach(button=>{
      button.hidden=false;
      button.tabIndex=0;
    });
    syncTabs();
  }else{
    // Desktop keeps the original three-column tool; the mobile attributes are
    // left in place but every mobile rule is scoped to the media query.
    syncLegend();syncCopy();
    document.body.classList.remove('mobile-route-open');
    document.querySelectorAll('#mobileTabbar [data-mobile-view]').forEach(button=>{
      button.removeAttribute('tabindex');
    });
  }
  requestAnimationFrame(syncScrollShadows);
}

export function initMobile(){
  const tabs=$('mobileTabbar');
  if(!tabs)return;
  if(!store.mobile)store.mobile={};
  if(!VIEWS.includes(store.mobile.view))store.mobile.view=document.body.dataset.mobileView||'plan';
  document.querySelectorAll('#mobileTabbar [data-mobile-view]').forEach(button=>{
    button.addEventListener('click',()=>setMobileView(button.dataset.mobileView,{focus:true}));
  });
  $('editSetup')?.addEventListener('click',()=>setMobileView('plan'));
  $('goPlan')?.addEventListener('click',()=>setMobileView('plan'));
  $('toggleRoute')?.addEventListener('click',()=>setRouteExpanded(!document.body.classList.contains('mobile-route-expanded')));
  if(typeof ResizeObserver!=='undefined'){
    const card=document.querySelector('.side-left');
    if(card)new ResizeObserver(syncRouteCardHeight).observe(card);
  }
  mobileQuery?.addEventListener?.('change',()=>{
    syncViewState();
  });
  // The keyboard owns the lower half of the screen; get the persistent bars
  // out of its way while someone is editing a start place.
  document.addEventListener('focusin',event=>{
    if(event.target?.classList?.contains('start-input'))document.body.classList.add('keyboard-open');
  });
  document.addEventListener('focusout',event=>{
    if(event.target?.classList?.contains('start-input')){
      setTimeout(()=>{
        if(!document.activeElement?.classList?.contains('start-input'))document.body.classList.remove('keyboard-open');
      },80);
    }
  });
  syncViewState();
  syncResultsFallback();
  syncRouteCardHeight();
}
