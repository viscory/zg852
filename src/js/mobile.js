import { store } from './store.js';
import { $ } from './util.js';
import { t } from './i18n.js';

const SNAPS=['peek','half','full'];
const PANE_KEYS={people:'people.title',results:'results.title',route:'sidebar.routeTitle'};

// styles.css owns the coarse-pointer deck query and exposes the result as --mobile-deck.
export function isMobileLayout(){
  return getComputedStyle(document.documentElement).getPropertyValue('--mobile-deck').trim()==='1';
}

export function snapMobileSheet(snap){
  if(!isMobileLayout()||!SNAPS.includes(snap))return;
  store.mobile.snap=snap;
  document.body.dataset.mobileSnap=snap;
  const handle=$('sheetHandle');
  if(handle)handle.setAttribute('aria-expanded',String(snap!=='peek'));
}
export function cycleMobileSheet(){
  if(!isMobileLayout())return;
  const index=SNAPS.indexOf(store.mobile.snap);
  snapMobileSheet(SNAPS[(index+1)%SNAPS.length]);
}
export function setMobilePane(pane,snap){
  if(!isMobileLayout())return;
  const next=PANE_KEYS[pane]?pane:'results';
  store.mobile.pane=next;
  document.body.dataset.mobilePane=next;
  document.querySelectorAll('#mobileNav [data-mobile-pane]').forEach(button=>{
    button.setAttribute('aria-pressed',String(button.dataset.mobilePane===next));
  });
  const key=PANE_KEYS[next];
  const label=$('sheetHandleLabel');
  if(label){label.dataset.i18n=key;label.textContent=t(key);}
  const handle=$('sheetHandle');
  if(handle){handle.dataset.i18nAriaLabel=key;handle.setAttribute('aria-label',t(key));}
  if(snap)snapMobileSheet(snap);
}
export function showMobileRoute(snap='half'){setMobilePane('route',snap);}

export function initMobile(){
  const handle=$('sheetHandle');
  if(!handle)return;
  let startY=0,dragging=false,moved=false;
  handle.addEventListener('pointerdown',event=>{
    if(!isMobileLayout())return;
    startY=event.clientY;dragging=true;moved=false;
    handle.setPointerCapture?.(event.pointerId);
  });
  handle.addEventListener('pointermove',event=>{
    if(!dragging)return;
    const delta=event.clientY-startY;
    if(Math.abs(delta)>4)moved=true;
    document.body.style.setProperty('--sheet-drag',`${Math.max(-240,Math.min(240,delta))}px`);
  });
  handle.addEventListener('pointerup',event=>{
    if(!dragging)return;
    dragging=false;
    const delta=event.clientY-startY;
    document.body.style.removeProperty('--sheet-drag');
    if(Math.abs(delta)>36){
      const index=SNAPS.indexOf(store.mobile.snap);
      const next=Math.max(0,Math.min(SNAPS.length-1,index+(delta<0?1:-1)));
      snapMobileSheet(SNAPS[next]);
    }else if(!moved)cycleMobileSheet();
  });
  handle.addEventListener('pointercancel',()=>{
    dragging=false;
    document.body.style.removeProperty('--sheet-drag');
  });
  handle.addEventListener('keydown',event=>{
    if(event.key!=='Enter'&&event.key!==' ')return;
    event.preventDefault();
    cycleMobileSheet();
  });
}
