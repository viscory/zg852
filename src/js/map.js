import * as L from 'leaflet';
import { maplibreGL } from '@maplibre/maplibre-gl-leaflet';
import 'leaflet/dist/leaflet.css';
import 'maplibre-gl/dist/maplibre-gl.css';
import { ACCENT,PERSON_COLORS,HEAT_COLORS,CELL_SIZE,VECTOR_KEYS } from './config.js';
import { store } from './store.js';
import { $,esc,clamp,isNum,icon,initialsFor,avatarClass } from './util.js';
import { t,num,intNum,minuteText } from './i18n.js';
import { betaVectorsEnabled,preferenceText,cellVector,cellCount,cellTopNames,cellPreference } from './vectors.js';
import { prepareRoutes,legLabel,fareMarkup,money,cellToResult,interchangeWaitText } from './routing.js';
import { displayName } from './state.js';
import { markSelectedResult,setPinOrigin,setLabel,setSidebarFace } from './ui.js';

export const CLEAN_STYLE={
  version:8,
  name:'zg852 clean',
  sources:{openmaptiles:{type:'vector',url:'https://tiles.openfreemap.org/planet',attribution:'© OpenStreetMap contributors, OpenFreeMap, © OpenMapTiles'}},
  glyphs:'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf',
  layers:[
    {id:'background',type:'background',paint:{'background-color':'#fffaf8'}},
    {id:'park',type:'fill',source:'openmaptiles','source-layer':'park',filter:['match',['geometry-type'],['MultiPolygon','Polygon'],true,false],paint:{'fill-color':'#f6e8e5'}},
    {id:'water',type:'fill',source:'openmaptiles','source-layer':'water',filter:['all',['match',['geometry-type'],['MultiPolygon','Polygon'],true,false],['!=',['get','brunnel'],'tunnel']],paint:{'fill-antialias':true,'fill-color':'#e4ecee'}},
    {id:'waterway',type:'line',source:'openmaptiles','source-layer':'waterway',filter:['match',['geometry-type'],['LineString','MultiLineString'],true,false],paint:{'line-color':'#e4ecee'}},
    {id:'landuse_residential',type:'fill',source:'openmaptiles','source-layer':'landuse',maxzoom:16,filter:['all',['match',['geometry-type'],['MultiPolygon','Polygon'],true,false],['==',['get','class'],'residential']],paint:{'fill-color':'#f5f0ee','fill-opacity':0.8}},
    {id:'landcover_wood',type:'fill',source:'openmaptiles','source-layer':'landcover',minzoom:10,filter:['all',['match',['geometry-type'],['MultiPolygon','Polygon'],true,false],['==',['get','class'],'wood']],paint:{'fill-color':'#edf1ea','fill-opacity':0.9}},
    {id:'building',type:'fill',source:'openmaptiles','source-layer':'building',minzoom:12,paint:{'fill-antialias':true,'fill-color':'#f0e9e7','fill-outline-color':'#e2d2cf'}},
    {id:'road_area_pier',type:'fill',source:'openmaptiles','source-layer':'transportation',filter:['all',['match',['geometry-type'],['MultiPolygon','Polygon'],true,false],['==',['get','class'],'pier']],paint:{'fill-antialias':true,'fill-color':'#fffaf8'}},
    {id:'highway_path',type:'line',source:'openmaptiles','source-layer':'transportation',filter:['all',['match',['geometry-type'],['LineString','MultiLineString'],true,false],['==',['get','class'],'path']],layout:{'line-cap':'round','line-join':'round'},paint:{'line-color':'#e7d9d6','line-opacity':0.9,'line-width':1}},
    {id:'highway_minor',type:'line',source:'openmaptiles','source-layer':'transportation',minzoom:8,filter:['all',['match',['geometry-type'],['LineString','MultiLineString'],true,false],['match',['get','class'],['minor','service','track'],true,false]],layout:{'line-cap':'round','line-join':'round'},paint:{'line-color':'#ffffff','line-opacity':0.95,'line-width':['interpolate',['exponential',1.55],['zoom'],13,1.8,20,20]}},
    {id:'highway_major_casing',type:'line',source:'openmaptiles','source-layer':'transportation',minzoom:11,filter:['all',['match',['geometry-type'],['LineString','MultiLineString'],true,false],['match',['get','class'],['primary','secondary','tertiary','trunk'],true,false]],layout:{'line-cap':'butt','line-join':'miter'},paint:{'line-color':'#e7d9d6','line-width':['interpolate',['exponential',1.3],['zoom'],10,3,20,23]}},
    {id:'highway_major_inner',type:'line',source:'openmaptiles','source-layer':'transportation',minzoom:11,filter:['all',['match',['geometry-type'],['LineString','MultiLineString'],true,false],['match',['get','class'],['primary','secondary','tertiary','trunk'],true,false]],layout:{'line-cap':'round','line-join':'round'},paint:{'line-color':'#ffffff','line-width':['interpolate',['exponential',1.3],['zoom'],10,2,20,20]}},
    {id:'highway_motorway_casing',type:'line',source:'openmaptiles','source-layer':'transportation',minzoom:6,filter:['all',['match',['geometry-type'],['LineString','MultiLineString'],true,false],['all',['match',['get','brunnel'],['bridge','tunnel'],false,true],['==',['get','class'],'motorway']]],layout:{'line-cap':'butt','line-join':'miter'},paint:{'line-color':'#e7d9d6','line-width':['interpolate',['exponential',1.4],['zoom'],5.8,0,6,3,20,40]}},
    {id:'highway_motorway_inner',type:'line',source:'openmaptiles','source-layer':'transportation',minzoom:6,filter:['all',['match',['geometry-type'],['LineString','MultiLineString'],true,false],['all',['match',['get','brunnel'],['bridge','tunnel'],false,true],['==',['get','class'],'motorway']]],layout:{'line-cap':'round','line-join':'round'},paint:{'line-color':'#ffffff','line-width':['interpolate',['exponential',1.4],['zoom'],4,2,6,1.3,20,30]}},
    {id:'railway',type:'line',source:'openmaptiles','source-layer':'transportation',minzoom:13,filter:['all',['match',['geometry-type'],['LineString','MultiLineString'],true,false],['all',['!',['has','service']],['==',['get','class'],'rail']]],layout:{'line-join':'round'},paint:{'line-color':'#c8b5b1','line-width':['interpolate',['exponential',1.3],['zoom'],16,3,20,7]}},
    {id:'railway_dashline',type:'line',source:'openmaptiles','source-layer':'transportation',minzoom:13,filter:['all',['match',['geometry-type'],['LineString','MultiLineString'],true,false],['all',['!',['has','service']],['==',['get','class'],'rail']]],layout:{'line-join':'round'},paint:{'line-color':'#ffffff','line-dasharray':[3,3],'line-width':['interpolate',['exponential',1.3],['zoom'],16,2,20,6]}},
    {id:'boundary',type:'line',source:'openmaptiles','source-layer':'boundary',minzoom:8,filter:['all',['==',['typeof',['get','admin_level']],'number'],['>=',['get','admin_level'],3],['<=',['get','admin_level'],6],['!=',['get','maritime'],1]],paint:{'line-color':'#d8c2be','line-dasharray':[1,1],'line-width':1}},
    {id:'place-label',type:'symbol',source:'openmaptiles','source-layer':'place',minzoom:7,filter:['match',['get','class'],['city','town','village','suburb','neighbourhood'],true,false],layout:{'text-field':['coalesce',['get','name:en'],['get','name']],'text-font':['Noto Sans Regular'],'text-size':['interpolate',['linear'],['zoom'],7,11,12,13,16,14],'text-max-width':9,'text-anchor':'center'},paint:{'text-color':'#241716','text-halo-color':'#fffaf8','text-halo-width':1.2}},
    {id:'poi-label',type:'symbol',source:'openmaptiles','source-layer':'poi',minzoom:13,filter:['match',['get','class'],['station','bus_stop','school','hospital','park','museum'],true,false],layout:{'text-field':['coalesce',['get','name:en'],['get','name']],'text-font':['Noto Sans Regular'],'text-size':11,'text-max-width':8,'text-anchor':'top','text-offset':[0,0.8]},paint:{'text-color':'#705b57','text-halo-color':'#fffaf8','text-halo-width':1}},
    {id:'road-label',type:'symbol',source:'openmaptiles','source-layer':'transportation_name',minzoom:13,filter:['all',['has','name'],['match',['get','class'],['motorway','trunk','primary','secondary','tertiary'],true,false]],layout:{'symbol-placement':'line','text-field':['coalesce',['get','name:en'],['get','name']],'text-font':['Noto Sans Regular'],'text-size':11,'text-max-width':10},paint:{'text-color':'#705b57','text-halo-color':'#fffaf8','text-halo-width':1}}
  ]
};

let map,cloudLayer,routeLayer,pointLayer,originLayer,vectorLayer;
const LABEL_LAYERS=['place-label','poi-label','road-label'];
export function placeNameField(){
  const local=store.locale&&store.locale!=='en'?['get',`name:${store.locale}`]:null;
  return ['coalesce',...(local?[local]:[]),['get','name:en'],['get','name']];
}
export function applyMapLabels(){
  const gl=vectorLayer?.getMaplibreMap?.();
  if(!gl?.getLayer)return;
  for(const id of LABEL_LAYERS)if(gl.getLayer(id))gl.setLayoutProperty(id,'text-field',placeNameField());
}

export function createMap(){
  map=L.map('map',{zoomControl:false,keyboard:true,minZoom:1,maxBounds:[[180,-Infinity],[-180,Infinity]],maxBoundsViscosity:1,attributionControl:true}).setView([22.31,114.17],12);
  map.attributionControl.setPrefix('');
  map.attributionControl.addAttribution('© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap contributors</a>, <a href="https://openfreemap.org/" target="_blank" rel="noopener noreferrer">OpenFreeMap</a>, © OpenMapTiles · <a id="mapIssue" href="https://github.com/viscory/zg852/issues" target="_blank" rel="noopener noreferrer">Report a map issue</a>');
  const RecenterControl=L.Control.extend({
    options:{position:'bottomright'},
    onAdd(){
      const container=L.DomUtil.create('div','leaflet-control leaflet-bar map-recenter-control');
      const button=L.DomUtil.create('button','map-recenter',container);
      button.type='button';
      button.innerHTML=icon('centre');
      setLabel(button,'Recenter map');
      button.setAttribute('data-i18n-aria-label','map.recenter');
      button.setAttribute('data-i18n-tooltip','map.recenter');
      L.DomEvent.disableClickPropagation(button);
      L.DomEvent.on(button,'click',event=>{L.DomEvent.preventDefault(event);recenterMap();});
      return container;
    },
  });
  new RecenterControl().addTo(map);
  L.control.zoom({position:'bottomright'}).addTo(map);
  map.createPane('routePane').style.zIndex=450;
  map.createPane('pointPane').style.zIndex=460;
  cloudLayer=L.layerGroup().addTo(map);routeLayer=L.layerGroup({pane:'routePane'}).addTo(map);
  pointLayer=L.layerGroup({pane:'pointPane'}).addTo(map);originLayer=L.layerGroup({pane:'pointPane'}).addTo(map);
  map.on('click',e=>{if(store.pinTarget)setPinOrigin(store.pinTarget,e.latlng.lat,e.latlng.lng);});
  const glLayer=maplibreGL({style:CLEAN_STYLE,interactive:false,attributionControl:false});
  try{
    glLayer.addTo(map);
    vectorLayer=glLayer;
    vectorLayer.on?.('load',applyMapLabels);
  }catch(err){
    glLayer._glMap||={remove(){}};
    try{map.removeLayer(glLayer);}catch(removeErr){console.error(removeErr);}
    vectorLayer=null;
    throw err;
  }
}
export function clearMapOutput(){
  store.results=[];
  store.cloudCells=[];
  store.selection={kind:'result',index:0};
  store.selected=0;
  const detail=$('detail');if(detail)detail.hidden=true;
  const list=$('resultsList');if(list)list.innerHTML='';
  cloudLayer?.clearLayers();
  routeLayer?.clearLayers();
  pointLayer?.clearLayers();
}
export function drawOrigins(active=store.activePeople){
  originLayer.clearLayers();
  active.forEach((p,j)=>{
    if(!isNum(p.origin?.lat)||!isNum(p.origin?.lon))return;
    L.circleMarker([p.origin.lat,p.origin.lon],{pane:'pointPane',radius:10,color:PERSON_COLORS[j%PERSON_COLORS.length],weight:2,fillColor:PERSON_COLORS[j%PERSON_COLORS.length],fillOpacity:.2})
      .bindTooltip(esc(displayName(p,store.people.indexOf(p))),{direction:'top'}).addTo(originLayer);
  });
}
export function recenterMap(){
  const points=store.results.flatMap(result=>result.paths.flat()).concat(store.activePeople.filter(person=>person.origin).map(person=>[person.origin.lat,person.origin.lon]));
  if(points.length){map.fitBounds(points,{padding:[60,60],maxZoom:14});return;}
  map.setView([22.31,114.17],12);
}
export function heatColor(cell,budget){
  const ratio=clamp(cell.slowest/Math.max(budget,1),0,1.5);
  return HEAT_COLORS[Math.max(0,Math.min(HEAT_COLORS.length-1,Math.round((1-ratio)*(HEAT_COLORS.length-1))))];
}
export function drawCloud(budget){
  hideTooltip();
  cloudLayer.clearLayers();
  store.cloudCells.forEach(c=>{
    const lat0=c.cy*CELL_SIZE,lon0=c.cx*CELL_SIZE,color=heatColor(c,budget);
    const rect=L.rectangle([[lat0,lon0],[lat0+CELL_SIZE,lon0+CELL_SIZE]],{color,weight:0,fillColor:color,fillOpacity:.34,interactive:true,className:'heat-cell'});
    rect.on('mouseover',e=>scheduleCellTooltip(c,e.originalEvent));
    rect.on('mousemove',e=>positionTooltip(e.originalEvent));
    rect.on('mouseout',hideTooltip);
    rect.on('click',e=>{if(e.originalEvent)L.DomEvent.stopPropagation(e.originalEvent);selectCell(c);});
    rect.addTo(cloudLayer);
  });
}
export function positionTooltip(event){
  if(!event)return;
  const tooltip=$('mapTooltip');
  tooltip.style.left=`${event.clientX+12}px`;
  tooltip.style.top=`${event.clientY+12}px`;
}
export function scheduleCellTooltip(cell,event){
  clearTimeout(store.tooltipTimer);
  store.hoverCell=cell;
  positionTooltip(event);
  store.tooltipTimer=setTimeout(()=>{
    if(store.hoverCell!==cell)return;
    const enabled=betaVectorsEnabled();
    const tooltip=$('mapTooltip');
    if(enabled){
      const values=cellVector(cell),counts=cellCount(cell),max=Math.max(...VECTOR_KEYS.map(key=>values[key]),1);
      const places=cellTopNames(cell);
      tooltip.innerHTML=`<b>${esc(t('map.cellTitle'))} · ${esc(preferenceText(cellPreference(cell)))}</b>${VECTOR_KEYS.map(key=>`<span class="tooltip-vector"><span>${esc(t('vector.'+key))}</span><span class="tooltip-track"><i class="tooltip-fill" data-width="${Math.max(2,Math.round(values[key]/max*100))}"></i></span><span>${esc(num(counts[key]))}</span></span>`).join('')}${places.length?`<span class="tooltip-places">${esc(places.join(' · '))}</span>`:''}`;
      tooltip.querySelectorAll('.tooltip-fill').forEach(fill=>{fill.style.width=`${fill.dataset.width}%`;delete fill.dataset.width;});
    }else{
      tooltip.innerHTML=`<b>${esc(t('map.areaTitle'))} · ${esc(t('results.longest',{value:intNum(cell.slowest)}))}</b>`;
    }
    tooltip.hidden=false;
  },700);
}
export function hideTooltip(){
  clearTimeout(store.tooltipTimer);
  store.tooltipTimer=null;store.hoverCell=null;
  const tooltip=$('mapTooltip');if(tooltip)tooltip.hidden=true;
}
export function resultMatches(result,sel){
  if(!result||!sel)return false;
  return result.key===sel.key||(Number.isFinite(sel.node)&&result.node===sel.node)||
    (Number.isFinite(sel.lat)&&Number.isFinite(sel.lon)&&Math.abs(result.lat-sel.lat)<1e-5&&Math.abs(result.lon-sel.lon)<1e-5);
}
export function buildResultFromCell(cell,active=store.activePeople){
  return prepareRoutes(cellToResult(cell),active,store.settings.fairnessMetric);
}
export function selectCell(cell){
  hideTooltip();
  const active=store.activePeople,match=store.results.findIndex(result=>resultMatches(result,{key:cell.key,node:cell.node}));
  if(match>=0){store.selection={kind:'result',index:match};store.sharedSelection=null;selectResult(match,active,true);return;}
  const result=buildResultFromCell(cell,active);
  store.selection={kind:'cell',key:cell.key,node:cell.node,lat:result.lat,lon:result.lon};
  store.sharedSelection=null;
  setSidebarFace('detail');
  renderSelection(result,active);
}
export function applySelection(active=store.activePeople){
  if(store.sharedSelection){
    const shared=store.sharedSelection;
    let index=-1;
    if(shared.kind==='result'&&Number.isFinite(Number(shared.index)))index=clamp(Math.round(Number(shared.index)),0,Math.max(0,store.results.length-1));
    else index=store.results.findIndex(result=>resultMatches(result,shared));
    if(index>=0&&store.results[index]){store.selection={kind:'result',index};store.sharedSelection=null;selectResult(index,active);return;}
    const cell=store.cloudCells.find(candidate=>resultMatches({key:candidate.key,node:candidate.node,lat:store.NODES.lat[candidate.node],lon:store.NODES.lon[candidate.node]},shared));
    if(cell){store.selection={kind:'cell',key:cell.key,node:cell.node};store.sharedSelection=null;renderSelection(buildResultFromCell(cell,active),active);return;}
    store.sharedSelection=null;
  }
  if(store.selection?.kind==='cell'){
    const cell=store.cloudCells.find(candidate=>candidate.key===store.selection.key);
    if(cell){renderSelection(buildResultFromCell(cell,active),active);return;}
  }
  selectResult(clamp(Number(store.selection?.index)||0,0,Math.max(0,store.results.length-1)),active);
}
function legChip(leg){
  if(leg.mode==='walk')return `<span class="walk-leg route-walk"><span class="ride-text">${esc(leg.text||legLabel(leg))}</span></span>`;
  const rail=leg.mode==='rail';
  const label=leg.lineName||String(leg.line).replace(/^MTR\s+/i,'');
  const modeLabel=rail?label:`Bus ${leg.line}`;
  const fare=leg.fare?`<span class="fare">${esc(t('results.fareTotal',{value:money(leg.fare)}))}</span>`:'';
  const wait=interchangeWaitText(leg);
  const waitNote=wait?`<span class="interchange-wait">${esc(wait)}</span>`:'';
  return `<span class="ride-leg route-${leg.mode}"><span class="leg-mode"><span class="icon icon-${rail?'rail':'bus'}" aria-hidden="true"></span>${esc(modeLabel)}</span><span class="leg-stops"><span class="leg-board">${esc(t('route.getOn',{place:leg.from}))}</span><span class="leg-alight">${esc(t('route.getOff',{place:leg.to}))}</span></span><span class="leg-meta"><span class="leg-time">${esc(minuteText(leg.minutes))}</span>${fare}${waitNote}</span></span>`;
}
export function renderSelection(r,active=store.activePeople){
  if(!r)return;
  const index=store.results.findIndex(result=>resultMatches(result,r));
  store.selected=index;
  markSelectedResult();
  $('detail').hidden=false;
  routeLayer.clearLayers();pointLayer.clearLayers();
  let legCount=0;
  r.routes.forEach((route,j)=>{
    route.legs.forEach(leg=>{
      if(leg.coords.length<2)return;
      legCount++;
      const dash=leg.mode==='walk'?'1 6':leg.mode==='bus'?'8 5':null;
      L.polyline(leg.coords,{pane:'routePane',color:PERSON_COLORS[j%PERSON_COLORS.length],weight:leg.mode==='walk'?2:4,opacity:leg.mode==='walk'?.7:1,dashArray:dash,className:`route-line route-${leg.mode} route-person-${j}`})
        .bindTooltip(esc(`${displayName(active[j],j)}: ${legLabel(leg)}`)).addTo(routeLayer);
    });
  });
  L.circleMarker([r.lat,r.lon],{pane:'pointPane',radius:12,color:ACCENT,weight:2,fillColor:ACCENT,fillOpacity:.16}).addTo(pointLayer);
  L.circleMarker([r.lat,r.lon],{pane:'pointPane',radius:5,color:ACCENT,weight:2,fillColor:ACCENT,fillOpacity:1}).bindPopup(`<b>${esc(r.label)}</b>`).addTo(pointLayer);
  $('detailTitle').textContent=r.label;
  $('detailDistrict').textContent=r.district;
  const preference=betaVectorsEnabled()?` ${preferenceText(r.fit)}`:'';
  const fareMetric=store.settings.fairnessMetric==='fare';
  const spread=fareMetric?t('results.fareSpread',{value:money(r.gap)}):t('results.spread',{value:intNum(r.gap)});
  const longest=fareMetric?t('results.fareLongest',{value:money(r.slowest)}):t('results.longest',{value:intNum(r.slowest)});
  $('detailSub').textContent=`${spread} ${longest}${preference}`;
  const already=r.times.every(value=>value<=0.5);
  $('steps').innerHTML=legCount?r.routes.map((route,j)=>`<div class="step">
    <span class="dot ${avatarClass(j)}">${esc(initialsFor(displayName(active[j],j)))}</span>
    <span class="txt"><b>${esc(displayName(active[j],j))}</b><span class="legs">${route.legs.map(legChip).join('')}</span><span class="muted">${esc(minuteText(r.times[j]))}</span>${fareMarkup(route)}</span></div>`).join(''):`<div class="step route-empty"><span class="txt"><b>${esc(r.label)}</b><span class="muted">${esc(t(already?'route.already':'results.noRoutes'))}</span></span></div>`;
  const pts=r.paths.flat().concat(active.map(p=>[p.origin.lat,p.origin.lon]));
  if(pts.length)map.fitBounds(pts,{padding:[60,60],maxZoom:14});
}
export function selectResult(i,active=store.activePeople,reveal=false){
  const r=store.results[i];if(!r)return;
  store.selection={kind:'result',index:i};store.sharedSelection=null;
  if(reveal)setSidebarFace('detail');
  renderSelection(r,active);
}
