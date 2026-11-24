import { store } from './store.js';
import { $ } from './util.js';
import { t } from './i18n.js';

const VIEWS=['plan','results','map'];

// styles.css owns the mobile deck query and exposes the result as --mobile-deck.
export function isMobileLayout(){
  return getComputedStyle(document.documentElement).getPropertyValue('--mobile-deck').trim()==='1';
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

function syncLegend(){
  const legend=$('mapLegend');
  if(legend)legend.open=!isMobileLayout();
}

export function setMobileView(view,{focus=false}={}){
  if(!isMobileLayout())return;
  const next=VIEWS.includes(view)?view:'plan';
  store.mobile.view=next;
  document.body.dataset.mobileView=next;
  syncTabs();
  syncCopy();
  syncFace(next);
  if(next==='map'){
    // Leaflet measured a zero-size container while the map screen was hidden.
    requestAnimationFrame(()=>{
      window.dispatchEvent(new Event('resize'));
      window.dispatchEvent(new CustomEvent('mobile:map-shown'));
    });
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
  document.body.classList.add('mobile-route-open');
  setMobileView('map');
  const people=document.querySelector('#flipStage [data-face="people"]');
  const detail=document.querySelector('#flipStage [data-face="detail"]');
  if(people)people.hidden=true;
  if(detail)detail.hidden=false;
  store.sidebarFace='detail';
}
export function closeMobileRoute(){
  document.body.classList.remove('mobile-route-open');
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
  window.matchMedia?.('(max-width:1024px)').addEventListener?.('change',syncViewState);
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
}
