import { LOCALES,RTL_LOCALES,KEY,TRAVEL_BUDGET_MINUTES } from './config.js';
import { store } from './store.js';
import { $ } from './util.js';
import { save } from './state.js';
import { rerender } from './engine.js';

// Built-in English strings so a stale cached catalogue never leaks raw keys.
export const FALLBACK={
  'app.title':'就腳 zau6 goek3','app.tagline':'Find a fair place to meet','app.subtitle':'Find a fair meeting point in Hong Kong','locale.label':'Language',
  'people.title':'People and start places','people.tab':'People','people.count':'people','people.count_one':'person','people.count_other':'people','sidebar.showRoute':'Show selected route','sidebar.showPeople':'Show people and start places','sidebar.routeTitle':'Selected route','people.add':'Add another person','people.max':'You can add up to 8 people.','people.library':'Saved people','people.name':'Person {letter} name','people.start':'Start place','people.startPlaceholder':'Address, place, station or stop','people.pin':'Pin','people.save':'Save person','people.remove':'Remove person {letter}','people.hintEmpty':'Choose a place','people.walkTolerance':'Walk instead of transit up to','people.saved':'Saved to your people','people.removed':'Removed {name}.','people.undo':'Undo','people.restored':'Restored {name}.','people.libraryTitle':'Saved people','people.librarySearch':'Search saved people','people.libraryEmpty':'No saved people yet. Save someone from a card.','people.libraryNoMatches':'No saved people match this search. Clear the search to see everyone.','people.libraryAdd':'Add','people.libraryEdit':'Edit','people.libraryDelete':'Delete','people.libraryClose':'Close','people.defaultName':'Person {letter}',
  'options.title':'Parameters','options.fairness':'Fairness','options.time':'Time','options.fare':'Fare','options.fareTolerance':'Target fare difference','options.rail':'MTR','options.bus':'Bus / minibus','options.tolerance':'Target time difference','options.toleranceNear':'Near equal','options.unbounded':'Unlimited','options.includeHeadway':'Include average headway','options.search':'Find fair areas','options.searching':'Working','options.modes':'Transport modes','options.interests':'Nearby interests','options.interestsHelp':'Areas are chosen by travel time in Time mode, or by fares in Fare mode. Interest ratings are informational and do not change ranking; they count feed rows, not deduplicated places. Off adds no preference.',
  'results.title':'Fair areas','results.empty':'Name your people, choose start places, then run the search to see fair areas on the map.','results.noFitTolerance':'No areas fit this tolerance. Increase it.','results.noFitFare':'No areas fit this fare tolerance. Increase it.','results.noFitMtr':'No MTR-only areas fit this tolerance. Enable bus or increase tolerance.', 'results.noFitBus':'No bus-only areas fit this tolerance. Enable MTR or increase tolerance.','results.noFitLightRail':'No light-rail-only areas fit this tolerance. Enable another mode or increase tolerance.','results.noFitFerry':'No ferry-only areas fit this tolerance. Enable another mode or increase tolerance.','results.header':'Top {count} areas · ordered by fit','results.header_one':'Top {count} area · ordered by fit','results.spread':'Spread {value} min.','results.fareSpread':'Fare spread {value}','results.longest':'Longest {value} min.','results.totalTime':'Total {value}','results.walkOnly':'Walk only','results.selectTitle':'Select a map area','results.routes':'Routes','results.noRoutes':'No route legs are available for this place.','results.fareNote':'MTR fares use published adult Octopus values where a station-pair entry exists; bus and ferry figures are the Transport Department full-route adult fare for that line, not a segment fare. ≈ marks a distance-band estimate when a lookup is missing. Check the operator before travelling.','results.walkPreference':'A direct walk within the walk tolerance is shown instead of transit; a faster transit route may exist.','results.fareEstimated':'Estimated fare','results.fareTotal':'Fare {value}',
  'map.aria':'Map of fair areas and routes','map.fairArea':'Fair area, darker means shorter travel time','map.fairFare':'Fair area, darker means cheaper fares','map.routeKey':'Route key','map.routeKeyHelp':'Colour = person · dotted walk, dashed bus, solid rail, ferry and light rail','map.walkKey':'Walk','map.railKey':'MTR','map.busKey':'Bus','map.recenter':'Recenter map','map.cancelPin':'Cancel pin','map.pinActive':'Pinning {name}','map.legend':'Map key','map.pinKey':'Pin: tap pin, then tap map','map.recenterKey':'Recenter fits the listed area routes (including ones not currently drawn) and the selected point','map.vectorKey':'Interests: ratings only; preferences do not change ranking','map.areaTitle':'Meeting area','map.areaHint':'Tap a shaded area to see routes.','map.cellTitle':'Area interest fit','map.zoomIn':'Zoom in','map.zoomOut':'Zoom out','map.reportIssue':'Report a map issue','map.pickAnywhere':'Unlimited mode is on: tap the map to choose a reachable nearby stop as a meeting point, weighted by distance and travel time. Journeys have no time limit in this mode. A pick is rejected only if the final walk for any person exceeds their walk tolerance.','map.pinnedPoint':'Pinned point','map.pinHint':'Tap the map to set this start.','map.clearPoint':'Clear pinned point',
  'route.rideLeg':'{mode} {line}: {from} → {to}, {stops}, {time}','route.stops':'{from} → {to}','route.busLink':'Open the closest matching bus route on HK Bus ETA','route.walkLeg':'Walk {time}','route.walkTo':'Walk {time} to {to}','route.interchangeWait':'Interchange wait {value}','route.stopCount':'stop','route.stopCount_one':'{count} stop','route.stopCount_other':'{count} stops','route.already':'Already there','route.unreachable':'Unreachable',
  'mode.walk':'Walk','mode.rail':'MTR','mode.bus':'Bus','mode.ferry':'Ferry','mode.lightRail':'Light rail','unit.min':'min','unit.min_one':'min','unit.min_other':'min',
  'cat.station':'MTR station','cat.exit':'MTR exit','cat.bus':'bus stop',
  'error.loading':'The timetable is still loading.','error.missingOrigins':'Choose a start place for every person.','error.needTwo':'Add at least two people with a start place.','error.noMode':'Enable at least one transport mode.','error.noNearby':'A start place has no nearby transit stop.','error.noNearbyMode':'No nearby stop is available for the selected travel modes.','error.noReach':'No start place reaches the network.','error.someNoReach':'One or more start places cannot reach the transit network.','error.noCommonArea':'Your starts reach the network, but no area is reachable by everyone within {budget} minutes.','error.pointOutOfReach':'That point cannot be reached by everyone.','error.pointWalkLimit':'That point needs a final walk longer than someone\'s walk tolerance.','error.searchFailed':'The search failed: {message}','error.timetableFailed':'Could not load the timetable: {message}','error.mapFailed':'The map failed to start. Search still works. {message}',
  'search.unavailable':'Place search is unavailable. Pick a transit stop or use a map pin.','search.none':'No places match. Pick a transit stop or use a map pin.','search.selectSuggestion':'Choose a suggestion or use a map pin for this start place.',
  'tag.station':'station','tag.exit':'exit','tag.bus':'bus','tag.address':'address','tag.place':'place','tag.city':'city',
  'place.unnamed':'Unnamed place','place.stops':'stops','place.stops_one':'{count} stop','place.stops_other':'{count} stops','district.unknown':'Hong Kong',
  
  'share.title':'Share scenario','share.copied':'Share link copied','share.failed':'Could not copy share link','share.invalid':'This share link is invalid.','share.replaced':'Shared scenario opened. Your previous people and settings were saved.','share.undo':'Undo',
  'diag.button':'Diagnostics','diag.help':'Exports your current scenario and routes so a problem can be diagnosed.','diag.copied':'Diagnostics downloaded and copied','diag.downloaded':'Diagnostics downloaded','diag.failed':'Could not export diagnostics',
  'nav.plan':'Plan','nav.map':'Map','nav.main':'Main navigation','options.settings':'Trip settings','results.emptyShort':'No fair areas yet.','results.emptyHint':'Set up who is meeting, then find fair areas.','results.goPlan':'Plan a meet','results.edit':'Edit','map.close':'Close','beta.on':'On','beta.off':'Off','beta.title':'Beta features','beta.badge':'Beta','beta.badgeTip':'Turns on experiments and a data export.','beta.diagnosticsHelp':'Beta also shows a Diagnostics button in the footer. It downloads and copies your names, start places, routes, fares, settings, the current URL and the areas shown on the map.','options.toleranceHelp':'A target has a floor: 8 min at stations, 5 min at other stops, HK$1 for fares.',
  'vector.off':'Off','vector.avoid':'Avoid {value}','vector.prefer':'Prefer {value}','vector.avoidStrong':'Strong avoid','vector.preferStrong':'Strong prefer','vector.food':'Food','vector.drinks':'Drinks','vector.activities':'Activities','vector.culture':'Culture','vector.outdoors':'Outdoors','vector.shopping':'Shopping','vector.ratings':'Interest ratings',
  'legal.title':'Legal and project information','legal.privacy':'Privacy','legal.terms':'Terms','legal.credits':'Credits','legal.process':'Process','legal.close':'Close','legal.loading':'Loading','legal.failed':'Could not load this document.','legal.englishOnly':'This document is available in English only.','legal.summaryPrivacy':'Summary: Your people and settings stay on this device. Place search and map tiles contact third-party providers; share links reveal the scenario in the URL. There is no account, analytics, or app backend.','legal.summaryTerms':'Summary: Results are estimates, not navigation or professional advice. Check official operator information before travelling. The app is provided as is; you control what you enter and share.','legal.summaryCredits':'Summary: Map data comes from OpenStreetMap, tiles from OpenFreeMap, search from Photon, and fares from MTR open data. Application code is MIT licensed.','legal.summaryProcess':'Summary: Starts are matched to nearby stops, local routing computes travel times, and areas are sorted by a stored fit score built from the displayed longest and spread, with those displayed values as tie-breaks (fare mode sorts by the displayed fare gap). MTR fares use published adult Octopus values where available, bus and ferry fares are the published full-route adult fares, and ≈ marks a distance-band estimate when a lookup is missing.',
};
// Copy that quotes the travel budget uses {budget}; the value is derived here
// so a catalogue can never freeze a stale number. An explicit var still wins.
export function t(key,vars={}){
  const source=store.I18N[store.locale]||store.EN;
  let value=source[key]??store.EN[key]??FALLBACK[key]??key;
  const allVars={budget:intNum(TRAVEL_BUDGET_MINUTES),...vars};
  for(const [k,v] of Object.entries(allVars))value=value.replaceAll(`{${k}}`,String(v));
  return value;
}
const numberFormats=new Map(),intFormats=new Map(),pluralRules=new Map();
export function tp(key,count,vars={}){
  let rules=pluralRules.get(store.locale);
  if(!rules){rules=new Intl.PluralRules(store.locale);pluralRules.set(store.locale,rules);}
  const category=rules.select(count);
  const pluralKey=`${key}_${category}`;
  return t((store.I18N[store.locale]||store.EN)[pluralKey]?pluralKey:key,{count,...vars});
}
export function num(value){
  let format=numberFormats.get(store.locale);
  if(!format){format=new Intl.NumberFormat(store.locale,{maximumFractionDigits:1});numberFormats.set(store.locale,format);}
  return format.format(value);
}
export function intNum(value){
  let format=intFormats.get(store.locale);
  if(!format){format=new Intl.NumberFormat(store.locale,{maximumFractionDigits:0});intFormats.set(store.locale,format);}
  return format.format(value);
}
export function minuteText(value){return `${intNum(value)} ${tp('unit.min',value)}`;}
export function setDocumentLocale(){
  document.documentElement.lang=store.locale;
  document.documentElement.dir=RTL_LOCALES.has(store.locale)?'rtl':'ltr';
  document.body.classList.toggle('rtl',RTL_LOCALES.has(store.locale));
  const select=$('locale');if(select)select.value=store.locale;
}
export function applyStaticText(){
  document.title=t('app.title');
  document.querySelectorAll('[data-i18n]').forEach(el=>{el.textContent=t(el.dataset.i18n);});
  document.querySelectorAll('[data-i18n-placeholder]').forEach(el=>{el.placeholder=t(el.dataset.i18nPlaceholder);});
  document.querySelectorAll('[data-i18n-aria-label]').forEach(el=>{el.setAttribute('aria-label',t(el.dataset.i18nAriaLabel));});
  document.querySelectorAll('[data-i18n-title]').forEach(el=>{el.title=t(el.dataset.i18nTitle);});
  document.querySelectorAll('[data-i18n-tooltip]').forEach(el=>{const value=t(el.dataset.i18nTooltip);el.dataset.tooltip=value;el.title=value;});
  const zoomIn=document.querySelector('.leaflet-control-zoom-in');
  const zoomOut=document.querySelector('.leaflet-control-zoom-out');
  if(zoomIn)zoomIn.setAttribute('aria-label',t('map.zoomIn'));
  if(zoomOut)zoomOut.setAttribute('aria-label',t('map.zoomOut'));
  const issue=$('mapIssue');if(issue)issue.textContent=t('map.reportIssue');
  setDocumentLocale();
}
export function detectLocale(){
  const candidates=navigator.languages&&navigator.languages.length?navigator.languages:[navigator.language||'en'];
  for(const candidate of candidates){
    const exact=LOCALES.find(l=>l.toLowerCase()===candidate.toLowerCase());
    if(exact)return exact;
    const low=candidate.toLowerCase();
    if(low.startsWith('zh'))return /hant|hk|tw|mo/.test(low)?'zh-Hant':'zh-Hans';
    const short=low.split('-')[0];
    const match=LOCALES.find(l=>l.toLowerCase()===short||l.toLowerCase().startsWith(`${short}-`));
    if(match)return match;
  }
  return 'en';
}
export async function ensureCatalog(code){
  if(store.I18N[code])return store.I18N[code];
  const res=await fetch(`i18n/${code}.json`);
  if(!res.ok)throw new Error(`Missing catalogue: ${code}`);
  store.I18N[code]=await res.json();
  return store.I18N[code];
}
// Re-translating should not disturb a place query that is being typed. Keep a
// snapshot of the active text field and its suggestion panel around rerender()
// so the caret/selection and the open suggestion panel survive the rerender.
function snapshotActiveText(){
  const el=document.activeElement;
  if(!el||el.tagName!=='INPUT'||el.type!=='text')return null;
  const sug=el.closest('.card')?.querySelector('.suggestions');
  return{
    id:el.id,
    selection:[el.selectionStart,el.selectionEnd,el.selectionDirection],
    expanded:el.getAttribute('aria-expanded'),
    activeDescendant:el.getAttribute('aria-activedescendant'),
    suggestion:sug?{id:sug.id,html:sug.innerHTML,hidden:sug.hidden}:null,
  };
}
function restoreActiveText(snapshot){
  if(!snapshot)return;
  const el=document.getElementById(snapshot.id);
  if(!el||el.tagName!=='INPUT'||document.activeElement!==el)return;
  try{el.setSelectionRange(...snapshot.selection);}catch{}
  if(snapshot.expanded===null)el.removeAttribute('aria-expanded');else el.setAttribute('aria-expanded',snapshot.expanded);
  if(snapshot.activeDescendant===null)el.removeAttribute('aria-activedescendant');else el.setAttribute('aria-activedescendant',snapshot.activeDescendant);
  if(snapshot.suggestion){
    const sug=document.getElementById(snapshot.suggestion.id);
    if(sug){
      if(sug.innerHTML!==snapshot.suggestion.html)sug.innerHTML=snapshot.suggestion.html;
      sug.hidden=snapshot.suggestion.hidden;
    }
  }
}
export async function changeLocale(code){
  if(!LOCALES.includes(code)||code===store.locale)return;
  try{await ensureCatalog(code);}catch(e){code='en';await ensureCatalog('en');}
  store.locale=code;
  localStorage.setItem(KEY.locale,code);
  save();
  setDocumentLocale();
  const snapshot=snapshotActiveText();
  rerender();
  restoreActiveText(snapshot);
}