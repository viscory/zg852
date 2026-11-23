import { LETTERS,VECTOR_KEYS } from './config.js';
import { store } from './store.js';
import { $,esc,clamp,icon,initialsFor,avatarClass,clone } from './util.js';
import { t,tp,num,minuteText } from './i18n.js';
import { normalizeVectors,vectorLabel,betaVectorsEnabled } from './vectors.js';
import { searchPlaces,districtFor } from './data.js';
import { dedupePlaces,photonSearch } from './search.js';
import { fareMarkup } from './routing.js';
import { displayName,save,saveDirectory,profileFromPerson,profileLabel,profileDistrict,normFocus } from './state.js';
import { scheduleRecompute } from './engine.js';
import { hideTooltip,clearMapOutput,selectResult } from './map.js';

export function showError(message){const el=$('error');el.textContent=message;el.hidden=false;}
export function clearError(){const el=$('error');el.textContent='';el.hidden=true;}
export function setLabel(el,value){if(!el)return;el.setAttribute('aria-label',value);el.title=value;el.dataset.tooltip=value;}
let flipToken=0;
export function setSidebarFace(face){
  if(face!=='people'&&face!=='results'||store.sidebarFace===face)return;
  const stage=$('flipStage');
  const apply=()=>{
    store.sidebarFace=face;
    document.querySelectorAll('.side-left [data-face]').forEach(el=>{el.hidden=el.dataset.face!==face;});
  };
  if(!stage||matchMedia('(prefers-reduced-motion: reduce)').matches){apply();return;}
  const token=++flipToken;
  stage.classList.remove('flip-in');
  stage.classList.add('flip-out');
  stage.addEventListener('animationend',event=>{
    if(event.target!==stage||token!==flipToken)return;
    stage.classList.remove('flip-out');
    apply();
    stage.classList.add('flip-in');
  },{once:true});
}
export function flashTooltip(element,message){
  if(!element)return;
  const original=element.dataset.tooltip||element.getAttribute('aria-label')||'';
  setLabel(element,message);
  clearTimeout(element.tooltipTimer);
  element.tooltipTimer=setTimeout(()=>setLabel(element,original),1600);
}
export function updateSaveSummary(){
  const el=$('saveSummary');if(!el)return;
  el.textContent=t('people.summary',{count:store.people.length,names:store.people.map((p,i)=>displayName(p,i)).join(', ')});
}
export function updateSettingsLabels(){
  $('tolval').textContent=`${Math.round(store.settings.tolerance*100)}%`;
  $('budgetval').textContent=minuteText(store.settings.budget);
  store.settings.vectors=normalizeVectors(store.settings.vectors);
  VECTOR_KEYS.forEach(key=>{const label=$(`vec-${key}-val`);if(label)label.textContent=vectorLabel(store.settings.vectors[key]);});
}
export function applyBetaFeatures(){
  const enabled=betaVectorsEnabled();
  const input=$('betaVectors');if(input)input.checked=enabled;
  const badge=$('betaBadge');if(badge)badge.setAttribute('aria-pressed',String(enabled));
  const section=$('vectorSection');if(section)section.hidden=!enabled;
  const legendKey=$('legendVectorKey');if(legendKey)legendKey.hidden=!enabled;
  if(!enabled){store.POI={cells:{}};store.poiLoaded=false;}
}
export function applySettingsToDom(){
  document.querySelectorAll('.chip').forEach(c=>c.setAttribute('aria-pressed',String(store.settings.modes.includes(c.dataset.mode))));
  $('tolerance').value=store.settings.tolerance;
  $('budget').value=store.settings.budget;
  store.settings.vectors=normalizeVectors(store.settings.vectors);
  document.querySelectorAll('[data-vector]').forEach(input=>{input.value=store.settings.vectors[input.dataset.vector];});
  applyBetaFeatures();
  updateSettingsLabels();
}
export function readSettingsFromDom(){
  store.settings.modes=[...document.querySelectorAll('.chip[aria-pressed="true"]')].map(c=>c.dataset.mode);
  store.settings.tolerance=clamp(Number($('tolerance').value),0.05,0.5,0.1);
  store.settings.budget=Number($('budget').value);
  store.settings.beta={vectors:$('betaVectors').checked};
  const vectors=normalizeVectors(store.settings.vectors);
  document.querySelectorAll('[data-vector]').forEach(input=>{vectors[input.dataset.vector]=Number(input.value);});
  store.settings.vectors=vectors;
  applyBetaFeatures();
  updateSettingsLabels();
  save();
  scheduleRecompute();
}
export function renderResults(active=store.activePeople){
  const list=$('resultsList'),state=$('resultState'),count=$('nres'),emptyRun=$('emptyRun');
  if(!list||!state||!count)return;
  if(!store.results.length){
    list.innerHTML='';
    state.textContent=t('results.empty');
    state.hidden=false;
    count.textContent='';
    if(emptyRun)emptyRun.hidden=false;
    return;
  }
  state.hidden=true;
  if(emptyRun)emptyRun.hidden=true;
  count.textContent=t('results.areas',{count:store.results.length});
  list.innerHTML=store.results.map((r,i)=>`<button class="result-row" type="button" data-index="${i}" aria-label="${esc(`${t('results.selectTitle')}: ${r.label}`)}">
    <span class="result-head"><b>${esc(r.label)}</b><span class="tag">${esc(t('cat.'+r.catKey))}</span><span class="district">${esc(r.district)}</span></span>
    <span class="result-times"><span>${esc(t('results.spread',{value:num(r.gap)}))}</span><span>${esc(t('results.longest',{value:num(r.slowest)}))}</span></span>
    <span class="result-people">${r.routes.map((route,j)=>`<span class="result-person"><span class="avatar ${avatarClass(j)}">${esc(initialsFor(displayName(active[j],j)))}</span><span class="person-name">${esc(displayName(active[j],j))}</span>${fareMarkup(route)}</span>`).join('')}</span>
  </button>`).join('');
  list.querySelectorAll('.result-row').forEach(row=>{row.onclick=()=>selectResult(Number(row.dataset.index),active);});
  markSelectedResult();
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
  const state=$('resultState'),count=$('nres'),emptyRun=$('emptyRun');
  if(state){state.textContent=t('options.searching');state.hidden=false;}
  if(count)count.textContent='';
  if(emptyRun)emptyRun.hidden=true;
}
export function setWorking(working){
  const label=working?t('options.searching'):t('options.search');
  const go=$('go');go.disabled=working;go.title=label;go.dataset.tooltip=label;go.setAttribute('aria-label',label);
  $('goLabel').textContent=label;
  if(working)renderSkeleton();
}
export function originHint(origin){
  if(!origin)return t('people.hintEmpty');
  if(origin.kind==='node')return t('people.hintTransit');
  if(origin.source==='photon')return t('people.hintAddress');
  return t('people.hintPin');
}
export function setOrigin(person,place,hint,input,sug){
  if(place.kind==='local')person.origin={kind:'node',node:place.node,label:place.label,lat:place.lat,lon:place.lon,district:place.district||districtFor(place.lat,place.lon)};
  else person.origin={kind:'coords',source:place.source||'photon',label:place.label,lat:place.lat,lon:place.lon,osm:place.osm||null,district:place.district||districtFor(place.lat,place.lon)};
  if(input)input.value=place.label;
  if(hint)hint.textContent=originHint(person.origin);
  if(sug){sug.hidden=true;input?.setAttribute('aria-expanded','false');input?.removeAttribute('aria-activedescendant');}
  clearError();save();scheduleRecompute();
}
export function renderSuggestions(sug,entries,person,input,failed=false,settled=false,onChoose){
  const items=dedupePlaces(entries,8);
  sug.innerHTML='';
  let active=-1;
  const rows=()=>[...sug.querySelectorAll('.suggestion')];
  const highlight=next=>{
    const all=rows();if(!all.length)return;
    active=(next+all.length)%all.length;
    all.forEach((row,i)=>row.classList.toggle('active',i===active));
    all[active].scrollIntoView({block:'nearest'});
    input.setAttribute('aria-activedescendant',all[active].id);
  };
  if(failed||(settled&&!items.length)){
    const d=document.createElement('div');d.className='suggestion-error';d.textContent=t(failed?'search.unavailable':'search.none');sug.appendChild(d);
  }
  items.forEach((place,i)=>{
    const d=document.createElement('div');d.className='suggestion';d.id=`${sug.id}-option-${i}`;
    d.setAttribute('role','option');d.setAttribute('aria-selected','false');d.tabIndex=-1;
    d.innerHTML=`<span class="avatar ${avatarClass(i)}">${esc(initialsFor(place.label))}</span><span class="place-main">${esc(place.label)}</span><span class="tag">${esc(t('tag.'+place.tagKey))}</span>${place.count>1?`<span class="tag">${esc(tp('place.stops',place.count))}</span>`:''}<span class="district">${esc(place.district||districtFor(place.lat,place.lon))}</span>`;
    const choose=()=>{onChoose?.();setOrigin(person,place,sug.parentElement.querySelector('.hint'),input,sug);};
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
    else if(e.key==='Enter'&&active>=0&&rows()[active]){e.preventDefault();rows()[active].click();}
    else if(e.key==='Escape'){sug.hidden=true;active=-1;input.setAttribute('aria-expanded','false');input.removeAttribute('aria-activedescendant');}
  };
}
export function makeCard(person){
  const idx=store.people.indexOf(person),letter=LETTERS[idx%8];
  const id=person.id;
  const saveLabel=esc(t('people.save')),removeLabel=esc(t('people.remove',{letter})),pinLabel=esc(t('people.pin'));
  const upLabel=esc(t('people.moveUp',{name:displayName(person,idx)})),downLabel=esc(t('people.moveDown',{name:displayName(person,idx)}));
  const card=document.createElement('div');card.className='card';card.dataset.id=id;
  card.innerHTML=`<div class="card-head">
    <span class="avatar ${avatarClass(idx)}">${esc(initialsFor(person.name))}</span>
    <div class="field">
      <label class="label" for="name-${id}">${esc(t('people.name',{letter}))}</label>
      <input class="name-input" id="name-${id}" type="text" placeholder="${esc(t('people.name',{letter}))}" value="${esc(person.name)}">
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
    <span class="hint">${esc(originHint(person.origin))}</span>
  </div>
  <div class="card-tools">
    <button class="icon-button move up" type="button" aria-label="${upLabel}" title="${upLabel}" data-tooltip="${upLabel}" ${idx===0?'disabled':''}>${icon('up')}</button>
    <button class="icon-button move down" type="button" aria-label="${downLabel}" title="${downLabel}" data-tooltip="${downLabel}" ${idx===store.people.length-1?'disabled':''}>${icon('down')}</button>
  </div>
  <div class="focus-toggle" role="group" aria-label="${esc(t('people.focusLabel'))}">
    <span class="focus-label">${esc(t('people.focusLabel'))}</span>
    <button class="focus-option" type="button" data-focus="time" aria-pressed="${person.focus!=='cost'}">${esc(t('people.focusTime'))}</button>
    <button class="focus-option" type="button" data-focus="cost" aria-pressed="${person.focus==='cost'}">${esc(t('people.focusCost'))}</button>
  </div>
  <div class="suggestions" id="suggest-${id}" role="listbox" hidden></div>`;
  $('cards').appendChild(card);
  const nameInput=card.querySelector('#name-'+CSS.escape(id));
  const input=card.querySelector('#start-'+CSS.escape(id));
  const sug=card.querySelector('.suggestions'),hint=card.querySelector('.hint');
  let timer=null,controller=null,requestSeq=0;
  const cancelSearch=()=>{clearTimeout(timer);if(controller)controller.abort();requestSeq++;};
  nameInput.addEventListener('input',()=>{person.name=nameInput.value;save();refreshMeta();});
  input.addEventListener('input',()=>{
    clearTimeout(timer);if(controller)controller.abort();
    const q=input.value.trim();
    if(q.length<2){sug.hidden=true;input.setAttribute('aria-expanded','false');return;}
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
  card.querySelector('.save-person').onclick=()=>savePersonToDirectory(person);
  card.querySelector('.remove').onclick=()=>{store.people=store.people.filter(p=>p.id!==id);commitPeople();};
  card.querySelector('.move.up').onclick=()=>movePerson(id,-1);
  card.querySelector('.move.down').onclick=()=>movePerson(id,1);
  card.querySelector('.pin').onclick=()=>startPinMode(id,hint,input,sug);
  const focusToggle=card.querySelector('.focus-toggle');
  focusToggle.querySelectorAll('.focus-option').forEach(option=>{
    option.onclick=()=>{
      person.focus=option.dataset.focus;
      focusToggle.querySelectorAll('.focus-option').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.focus===person.focus)));
      save();scheduleRecompute();
    };
  });
  refreshMeta();
}
export function movePerson(id,delta){
  const i=store.people.findIndex(p=>p.id===id),j=i+delta;
  if(i<0||j<0||j>=store.people.length)return;
  [store.people[i],store.people[j]]=[store.people[j],store.people[i]];
  commitPeople();
  document.querySelector(`.card[data-id="${CSS.escape(id)}"] .name-input`)?.focus();
}
export function renderCards(){
  const saved=store.people.slice();store.people=[];
  $('cards').innerHTML='';
  saved.forEach(p=>{store.people.push(p);makeCard(p);});
  refreshMeta();
}
export function refreshMeta(){
  $('count').textContent=store.people.length;
  $('add').disabled=store.people.length>=8;
  document.querySelectorAll('.card').forEach(card=>{
    const person=store.people.find(p=>p.id===card.dataset.id);if(!person)return;
    const idx=store.people.indexOf(person),letter=LETTERS[idx%8];
    const avatar=card.querySelector('.avatar');if(avatar){avatar.textContent=initialsFor(person.name);avatar.className=`avatar ${avatarClass(idx)}`;}
    const nameLabel=card.querySelector('label[for^="name-"]');if(nameLabel)nameLabel.textContent=t('people.name',{letter});
    const nameInput=card.querySelector('.name-input');if(nameInput)nameInput.placeholder=t('people.name',{letter});
    const startInput=card.querySelector('.start-input');if(startInput)startInput.placeholder=t('people.startPlaceholder');
    const remove=card.querySelector('.remove');remove.hidden=store.people.length<=1;setLabel(remove,t('people.remove',{letter}));
    setLabel(card.querySelector('.pin'),t('people.pin'));
    const up=card.querySelector('.move.up'),down=card.querySelector('.move.down');
    if(up){up.disabled=idx===0;setLabel(up,t('people.moveUp',{name:displayName(person,idx)}));}
    if(down){down.disabled=idx===store.people.length-1;setLabel(down,t('people.moveDown',{name:displayName(person,idx)}));}
    setLabel(card.querySelector('.save-person'),t('people.save'));
  });
  updateSaveSummary();
}
export function commitPeople(){renderCards();save();scheduleRecompute();}
export function clearPinMode(){
  store.pinTarget=null;
  $('map')?.classList.remove('pinning');
  $('pinBanner').hidden=true;
  hideTooltip();
}
export function startPinMode(id,hint,input,sug){
  const idx=store.people.findIndex(p=>p.id===id);if(idx<0)return;
  store.pinTarget=id;
  $('map').classList.add('pinning');
  const banner=$('pinBanner'),avatar=$('pinAvatar'),label=$('pinLabel');
  avatar.textContent=initialsFor(displayName(store.people[idx],idx));
  avatar.className=`avatar ${avatarClass(idx)}`;
  label.textContent=t('map.pinActive',{name:displayName(store.people[idx],idx)});
  banner.hidden=false;
  if(sug){sug.hidden=true;input?.setAttribute('aria-expanded','false');}
  hideTooltip();
}
export function setPinOrigin(id,lat,lon){
  const idx=store.people.findIndex(p=>p.id===id);if(idx<0)return;
  store.people[idx].origin={kind:'coords',source:'pin',label:`${t('people.pin')} ${num(lat)}, ${num(lon)}`,lat,lon,district:districtFor(lat,lon)};
  clearPinMode();
  clearError();commitPeople();
}
export function savePersonToDirectory(person){
  if(!person.origin){showError(t('people.hintEmpty'));return;}
  const existing=store.directory.find(d=>d.id===person.directoryId)||store.directory.find(d=>d.name===person.name&&d.origin?.label===person.origin.label);
  if(existing){existing.name=person.name;existing.origin=clone(person.origin);existing.focus=normFocus(person.focus);existing.updated=Date.now();person.directoryId=existing.id;}
  else{const profile=profileFromPerson(person);store.directory.push(profile);person.directoryId=profile.id;}
  saveDirectory();save();renderDirectoryList();flashSaved(person.id);
}
export function flashSaved(id){
  const card=document.querySelector(`.card[data-id="${CSS.escape(id)}"]`);if(!card)return;
  const hint=card.querySelector('.hint'),previous=hint.textContent;
  hint.textContent=t('people.saved');
  setTimeout(()=>{if(hint.isConnected)hint.textContent=previous;},1200);
}
export function deleteDirectoryPerson(id){
  store.directory=store.directory.filter(d=>d.id!==id);
  store.people.forEach(p=>{if(p.directoryId===id)p.directoryId=null;});
  saveDirectory();save();renderDirectoryList();scheduleRecompute();
}
export function addDirectoryPerson(profile){
  if(store.people.length>=8||!profile)return;
  store.people.push({id:`p${store.seq++}`,name:profile.name,origin:clone(profile.origin),directoryId:profile.id,focus:normFocus(profile.focus)});
  commitPeople();
}
export function editDirectoryPerson(profile){
  let person=store.people.find(p=>p.directoryId===profile.id);
  if(!person&&store.people.length<8){addDirectoryPerson(profile);person=store.people[store.people.length-1];}
  if(person){person.name=profile.name;person.origin=clone(profile.origin);person.focus=normFocus(profile.focus);}
  commitPeople();
}
export function renderDirectoryList(){
  const list=$('directoryList');if(!list)return;
  const query=($('directorySearch')?.value||'').trim().toLowerCase();
  const items=store.directory.filter(p=>[p.name,profileLabel(p),profileDistrict(p)].join(' ').toLowerCase().includes(query));
  list.innerHTML=items.length?items.map(p=>{
    const addLabel=esc(t('people.libraryAdd')),editLabel=esc(t('people.libraryEdit')),deleteLabel=esc(store.pendingDelete===p.id?`${t('people.libraryDelete')}?`:t('people.libraryDelete'));
    return `<div class="directory-row" data-id="${esc(p.id)}" tabindex="0">
    <div class="directory-copy"><b>${esc(p.name)}</b><span>${esc(profileLabel(p))}</span><span class="district">${esc(profileDistrict(p))}</span></div>
    <div class="directory-actions">
      <button class="icon-button" type="button" data-action="add" aria-label="${addLabel}" title="${addLabel}" data-tooltip="${addLabel}">${icon('add')}</button>
      <button class="icon-button" type="button" data-action="edit" aria-label="${editLabel}" title="${editLabel}" data-tooltip="${editLabel}">${icon('edit')}</button>
      <button class="icon-button" type="button" data-action="delete" aria-label="${deleteLabel}" title="${deleteLabel}" data-tooltip="${deleteLabel}">${icon('remove')}</button>
    </div></div>`;}).join(''):`<div class="directory-empty">${esc(t('people.libraryEmpty'))}</div>`;
  list.querySelectorAll('button').forEach(button=>button.onclick=()=>{
    const row=button.closest('.directory-row'),profile=store.directory.find(d=>d.id===row?.dataset.id),action=button.dataset.action;
    if(action==='add'&&profile){addDirectoryPerson(profile);$('peopleDialog').close();}
    else if(action==='edit'&&profile){editDirectoryPerson(profile);$('peopleDialog').close();}
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
  renderDirectoryList();
  openDialog($('peopleDialog'),$('directorySearch'));
}
export async function openLegal(kind){
  if(!['privacy','terms','credits'].includes(kind))return;
  const dialog=$('legalDialog'),title=$('legalTitle'),body=$('legalBody');
  if(!dialog)return;
  if(title)title.textContent=t(`legal.${kind}`);
  if(body)body.textContent=t('legal.loading');
  openDialog(dialog);
  try{
    const response=await fetch(`${kind}.html`);
    if(!response.ok)throw new Error(`${kind} ${response.status}`);
    const doc=new DOMParser().parseFromString(await response.text(),'text/html');
    const main=doc.querySelector('main');
    if(!main)throw new Error('missing main');
    main.querySelectorAll('nav').forEach(nav=>nav.remove());
    if(body)body.innerHTML=main.innerHTML;
  }catch(err){
    console.error(err);
    if(body)body.textContent=t('legal.failed');
  }
}