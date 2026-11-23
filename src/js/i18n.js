import { LOCALES,RTL_LOCALES,KEY } from './config.js';
import { store } from './store.js';
import { $ } from './util.js';
import { save } from './state.js';
import { rerender } from './engine.js';

export function t(key,vars={}){
  const source=store.I18N[store.locale]||store.EN;
  let value=source[key]??store.EN[key]??key;
  for(const [k,v] of Object.entries(vars))value=value.replaceAll(`{${k}}`,String(v));
  return value;
}
const numberFormats=new Map(),pluralRules=new Map();
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
export function minuteText(value){return `${num(value)} ${tp('unit.min',value)}`;}
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
  const status=$('netstatus');if(status)status.textContent=store.NET?t('status.ready'):t('status.loading');
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
export async function changeLocale(code){
  if(!LOCALES.includes(code)||code===store.locale)return;
  try{await ensureCatalog(code);}catch(e){code='en';await ensureCatalog('en');}
  store.locale=code;
  localStorage.setItem(KEY.locale,code);
  save();
  setDocumentLocale();
  rerender();
}