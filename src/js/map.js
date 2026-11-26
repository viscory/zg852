import * as L from 'leaflet';
import { maplibreGL } from '@maplibre/maplibre-gl-leaflet';
import 'leaflet/dist/leaflet.css';
import 'maplibre-gl/dist/maplibre-gl.css';
import { ACCENT,PERSON_COLORS,HEAT_COLORS,CELL_SIZE,TRAVEL_BUDGET_MINUTES,WALK_SPEED_KMH,WALK_DETOUR } from './config.js';
import { store } from './store.js';
import { heatValue } from './model.js';
import { $,esc,clamp,isNum,icon,initialsFor,avatarClass,haversine } from './util.js';
import { t,intNum,minuteText } from './i18n.js';
import { cellTopNames,cellRatings,cellVector,cellCount,cellPreference,overallRating } from './vectors.js';
import { prepareRoutes,legLabel,shownMinutes,fareMarkup,money,cellToResult,interchangeWaitText,walkBudget } from './routing.js';
import { routeLink,mtrLineCode,districtFor } from './data.js';
import { fareHeatMax } from './fares.js';
import { displayName,saveSelection } from './state.js';
import { isMobileLayout,showMobileRoute } from './mobile.js';
import { markSelectedResult,setPinOrigin,setLabel,setSidebarFace,showError,showPointNotice,clearPointNotice,applyUnboundedUi } from './ui.js';

// Leaflet accepts infinite LatLngBounds, but Web Mercator only covers these
// finite corners. They keep the old one-world pan restriction (viscosity 1)
// without relying on ±Infinity coordinates.
const WEB_MERCATOR_BOUNDS=[[85.05,-180],[-85.05,180]];
// A tap only snaps to a heat cell within this many layer pixels of its centre.
const TAP_SNAP_RADIUS=56;

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

// The plugin's public getMaplibreMap() accessor tells us whether its Maplibre
// instance was created. addTo() can throw before that happens, yet the layer is
// already registered with Leaflet, whose removeLayer() calls onRemove() and
// dereferences the missing instance. This is the only case where we seed the
// private field with a no-op so the supported teardown can complete; the
// original error is still thrown by the caller.
function safeRemoveGlLayer(mapToClean,glLayer){
  try{
    if(!glLayer.getMaplibreMap?.())glLayer._glMap={remove(){}};
    mapToClean.removeLayer(glLayer);
  }catch(removeErr){console.error(removeErr);}
}

export function createMap(){
  map=L.map('map',{zoomControl:false,keyboard:true,minZoom:1,maxBounds:WEB_MERCATOR_BOUNDS,maxBoundsViscosity:1,attributionControl:true}).setView([22.31,114.17],12);
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
  map.on('click',e=>{
    hideTooltip();
    if(store.pinTarget){setPinOrigin(store.pinTarget,e.latlng.lat,e.latlng.lng);return;}
    if(store.unbounded){selectPoint(e.latlng.lat,e.latlng.lng);return;}
    if(isMobileLayout()){
      const cell=magneticCell(e.latlng);
      if(cell)selectCell(cell);
    }
  });
  window.addEventListener('resize',()=>map.invalidateSize());
  const glLayer=maplibreGL({style:CLEAN_STYLE,interactive:false,attributionControl:false});
  try{
    glLayer.addTo(map);
    vectorLayer=glLayer;
    vectorLayer.on?.('load',applyMapLabels);
  }catch(err){
    safeRemoveGlLayer(map,glLayer);
    vectorLayer=null;
    throw err;
  }
}
// Mobile state changes re-show a previously zero-size map; callers ask this
// module (the owner of the Leaflet instance) to remeasure it instead of
// faking a window resize event.
export function invalidateMapSize(){
  map?.invalidateSize();
}
// The mobile map screen was sized while hidden. Remeasure it and, once per
// session, fit the view — called directly by mobile.js, with no synthetic event.
export function revealMap(){
  requestAnimationFrame(()=>{
    map?.invalidateSize();
    if(!store.mobile.mapShown){
      store.mobile.mapShown=true;
      if(store.results.length)recenterMap();
      else fitMapTo([]);
    }
  });
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
// Leaflet adds paddingTopLeft and paddingBottomRight together, so each edge
// must carry its own value: reserving the mobile sheet at both ends leaves no
// room for the fit and pushes the selected marker under the sheet.
const MAP_INSET=24;
const MOBILE_TOP_INSET=24;
const MIN_FIT_HEIGHT=80;
function mapPadding(){
  if(!isMobileLayout())return {paddingTopLeft:[MAP_INSET,MAP_INSET],paddingBottomRight:[MAP_INSET,MAP_INSET]};
  const size=map.getSize().y;
  // The route card floats over the lower part of the map. Reserve exactly the
  // space it occupies when fitting a route, so a collapsed summary leaves much
  // more map visible than an expanded route sheet.
  let wanted=MAP_INSET;
  if(document.body.classList.contains('mobile-route-open')){
    const card=document.querySelector('.side-left');
    if(card&&getComputedStyle(card).display!=='none'){
      const mapTop=document.getElementById('map').getBoundingClientRect().top;
      const cardTop=card.getBoundingClientRect().top;
      wanted=Math.max(0,size-(cardTop-mapTop)+8);
    }
  }
  const bottom=Math.min(wanted,Math.max(0,size-MOBILE_TOP_INSET-MIN_FIT_HEIGHT));
  return {paddingTopLeft:[MAP_INSET,MOBILE_TOP_INSET],paddingBottomRight:[MAP_INSET,bottom]};
}
export function fitMapTo(points){
  if(points.length){map.fitBounds(points,{...mapPadding(),maxZoom:isMobileLayout()?15:14,animate:false});return;}
  map.setView([22.31,114.17],12,{animate:false});
}
export function recenterMap(){
  // Only fair areas and the selected point are fitted. Start markers stay put,
  // as the map key says, even when an origin sits far outside the result area.
  const points=store.results.flatMap(result=>result.paths.flat());
  if(store.selection?.kind==='point'&&isNum(store.selection.lat)&&isNum(store.selection.lon))points.push([store.selection.lat,store.selection.lon]);
  // A heat cell picked directly is drawn by renderSelection() even when it is
  // outside the top results, so it has to join the fit too.
  if(store.selection?.kind==='cell'){
    const selected=store.selection;
    let {lat,lon}=selected;
    if(!isNum(lat)||!isNum(lon)){
      const cell=store.cloudCells.find(candidate=>candidate.key===selected.key)||
        store.cloudCells.find(candidate=>candidate.node===selected.node);
      if(cell&&store.NODES?.lat?.[cell.node]!=null&&store.NODES?.lon?.[cell.node]!=null){
        lat=store.NODES.lat[cell.node];lon=store.NODES.lon[cell.node];
      }
    }
    if(isNum(lat)&&isNum(lon))points.push([lat,lon]);
  }
  fitMapTo(points);
}
function magneticCell(latlng){
  const point=map.latLngToLayerPoint(latlng);
  let best=null,bestDistance=TAP_SNAP_RADIUS;
  store.cloudCells.forEach(cell=>{
    const centre=map.latLngToLayerPoint([(cell.cy+.5)*CELL_SIZE,(cell.cx+.5)*CELL_SIZE]);
    const distance=Math.hypot(centre.x-point.x,centre.y-point.y);
    if(distance<bestDistance){bestDistance=distance;best=cell;}
  });
  return best;
}
export function heatColor(cell,budget,metric='time'){
  const value=heatValue(cell,metric);
  // Labels show whole minutes, so colour the number the user actually sees.
  const shown=metric==='fare'?value:Math.round(value);
  const ratio=metric==='fare'
    ? clamp(shown/fareHeatMax(),0,1)
    : clamp(shown/Math.max(budget,1),0,1);
  return HEAT_COLORS[Math.max(0,Math.min(HEAT_COLORS.length-1,Math.round(ratio*(HEAT_COLORS.length-1))))];
}
export function drawCloud(budget){
  hideTooltip();
  cloudLayer.clearLayers();
  const metric=store.settings.fairness==='fare'?'fare':'time';
  // Unlimited still shows the ranked areas as a visual reference, but the
  // rectangles must not swallow map clicks: every point is pickable there.
  const referenceOnly=store.unbounded;

  // One roving tab stop instead of hundreds: Tab enters the map once, arrow
  // keys move between cells, and Enter/Space selects. A row of 600 focusable
  // rectangles would otherwise sit between the sidebar and the results list.
  const entries=[];
  store.cloudCells.forEach(c=>{
    const lat0=c.cy*CELL_SIZE,lon0=c.cx*CELL_SIZE,color=heatColor(c,budget,metric);
    const rect=L.rectangle([[lat0,lon0],[lat0+CELL_SIZE,lon0+CELL_SIZE]],{color,weight:0,fillColor:color,fillOpacity:.34,interactive:!referenceOnly,className:referenceOnly?'heat-cell heat-cell-reference':'heat-cell'});
    if(!referenceOnly){
      rect.on('mouseover',e=>scheduleCellTooltip(c,e.originalEvent));
      rect.on('mousemove',e=>positionTooltip(e.originalEvent));
      rect.on('mouseout',hideTooltip);
      rect.on('click',e=>{if(e.originalEvent)L.DomEvent.stopPropagation(e.originalEvent);selectCell(c);});
    }
    rect.addTo(cloudLayer);
    const cellNode=rect.getElement();
    if(!cellNode)return;
    if(referenceOnly){cellNode.setAttribute('aria-hidden','true');return;}
    cellNode.setAttribute('tabindex','-1');
    cellNode.setAttribute('role','button');
    const fareLabel=metric==='fare'&&isNum(c.maxFare)?`, ${money(c.maxFare)}`:'';
    cellNode.setAttribute('aria-label',`${t('map.areaTitle')}: ${minuteText(c.slowest)}${fareLabel}`);
    cellNode.setAttribute('data-heat-cell','');
    if(metric==='fare'&&isNum(c.maxFare))cellNode.setAttribute('data-max-fare',String(c.maxFare));
    entries.push({c,node:cellNode});
  });
  if(!entries.length)return;
  const rove=active=>{
    entries.forEach(entry=>entry.node.setAttribute('tabindex',entry===active?'0':'-1'));
  };
  const move=(entry,dx,dy)=>{
    const {cx,cy}=entry.c;
    let best=null,bestScore=Infinity;
    for(const candidate of entries){
      if(candidate===entry)continue;
      const ox=candidate.c.cx-cx,oy=candidate.c.cy-cy;
      if(ox*dx+oy*dy<=0)continue; // only move in the requested direction
      const score=(ox-dx)**2+(oy-dy)**2;
      if(score<bestScore){bestScore=score;best=candidate;}
    }
    if(best){rove(best);best.node.focus();}
  };
  entries[0].node.setAttribute('tabindex','0');
  entries.forEach(entry=>{
    const {c,node}=entry;
    node.addEventListener('focus',()=>{
      rove(entry);
      node.setAttribute('data-focused','');
      const box=node.getBoundingClientRect();
      scheduleCellTooltip(c,{clientX:box.left+box.width/2,clientY:box.top+box.height/2},250);
    });
    node.addEventListener('blur',()=>{node.removeAttribute('data-focused');hideTooltip();});
    node.addEventListener('keydown',event=>{
      const delta={ArrowRight:[1,0],ArrowLeft:[-1,0],ArrowUp:[0,1],ArrowDown:[0,-1]}[event.key];
      if(delta){event.preventDefault();event.stopPropagation();move(entry,...delta);return;}
      if(event.key!=='Enter'&&event.key!==' ')return;
      event.preventDefault();
      event.stopPropagation();
      selectCell(c);
    });
  });
}
export function positionTooltip(event){
  if(!event)return;
  const tooltip=$('mapTooltip');
  const rect=tooltip.getBoundingClientRect();
  const width=rect.width||0,height=rect.height||0;
  tooltip.style.left=`${Math.max(8,Math.min(event.clientX+12,window.innerWidth-width-8))}px`;
  tooltip.style.top=`${Math.max(8,Math.min(event.clientY+12,window.innerHeight-height-8))}px`;
}
// Widths travel as a data attribute and are applied with the style property
// after insertion. This keeps one transfer mechanism and no inline-style
// strings in the bundle (the production-bundle CSP test requires that).
function barMarkup(className,rating){
  return `<i class="${className}" data-width="${esc(rating)}"></i>`;
}
function applyBarWidths(root){
  root.querySelectorAll('[data-width]').forEach(fill=>{
    fill.style.width=`${fill.dataset.width}%`;
    fill.removeAttribute('data-width');
  });
}
function ratingTooltipMarkup(title,subtitle,ratings){
  return `<b>${esc(title)}</b>${subtitle?`<span class="tooltip-sub">${esc(subtitle)}</span>`:''}${ratings.map(({key,rating})=>{
    const value=Math.round(Number(rating)||0),label=t('vector.'+key);
    return `<span class="tooltip-vector" aria-label="${esc(label)}: ${value}%"><span>${esc(label)}</span><span class="tooltip-track">${barMarkup('tooltip-fill',rating)}</span></span>`;
  }).join('')}`;
}
function showRatingTooltip(target,event,delay,title,subtitle,ratings){
  clearTimeout(store.tooltipTimer);
  store.hoverCell=target;
  store.tooltipTimer=setTimeout(()=>{
    if(store.hoverCell!==target)return;
    const tooltip=$('mapTooltip');
    tooltip.innerHTML=ratingTooltipMarkup(title,subtitle,ratings);
    applyBarWidths(tooltip);
    tooltip.hidden=false;
    // Measure only while the tooltip is actually visible.
    positionTooltip(event);
  },delay);
}
function cleanPlaceNames(places){
  return places.map(name=>String(name).replace(/\s*\([^)]*\)$/,'').trim()).filter(Boolean);
}
export function scheduleCellTooltip(cell,event,delay=700){
  const places=cleanPlaceNames(cellTopNames(cell));
  const district=districtFor(cell.cy*CELL_SIZE+CELL_SIZE/2,cell.cx*CELL_SIZE+CELL_SIZE/2);
  const title=cell.label||places[0]||district||t('map.areaTitle');
  const fare=store.settings.fairness==='fare'&&isNum(cell.maxFare)?` · ${money(cell.maxFare)}`:'';
  showRatingTooltip(cell,event,delay,`${title}${fare}`,t('map.cellTitle'),cellRatings(cell));
}
function scheduleResultTooltip(result,event,delay=350){
  const ratings=result.ratings||cellRatings(result);
  showRatingTooltip(result,event,delay,result.label||t('map.areaTitle'),t('map.cellTitle'),ratings);
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
  return prepareRoutes(cellToResult(cell),active);
}
function clearStalePointSelection(){
  // A pinned point only belongs to the unbounded view. Selecting a bounded
  // area or cell must retire its banner before the detail panel is shown.
  if(!store.unbounded&&store.pointSelection){store.pointSelection=null;applyUnboundedUi();}
}
function persistSelection(){
  // A shared selection is still pending during startup; leave the stored
  // record alone until applySelection() has consumed it.
  if(!store.sharedSelection)saveSelection();
}
export function selectCell(cell){
  hideTooltip();
  clearPointNotice();
  clearStalePointSelection();
  const active=store.activePeople,match=store.results.findIndex(result=>resultMatches(result,{key:cell.key,node:cell.node}));
  if(match>=0){store.selection={kind:'result',index:match};store.sharedSelection=null;selectResult(match,active,true);return;}
  const result=buildResultFromCell(cell,active);
  store.selection={kind:'cell',key:cell.key,node:cell.node,lat:result.lat,lon:result.lon};
  store.sharedSelection=null;
  persistSelection();
  setSidebarFace('detail');
  showMobileRoute();
  renderSelection(result,active,true);
}
export function applySelection(active=store.activePeople){
  if(store.sharedSelection){
    const shared=store.sharedSelection;
    let index=-1;
    if(shared.kind==='result'&&Number.isFinite(Number(shared.index)))index=clamp(Math.round(Number(shared.index)),0,Math.max(0,store.results.length-1));
    else index=store.results.findIndex(result=>resultMatches(result,shared));
    if(index>=0&&store.results[index]){store.selection={kind:'result',index};store.sharedSelection=null;selectResult(index,active);return;}
    const cell=store.cloudCells.find(candidate=>resultMatches({key:candidate.key,node:candidate.node,lat:store.NODES.lat[candidate.node],lon:store.NODES.lon[candidate.node]},shared));
    if(cell){clearStalePointSelection();store.selection={kind:'cell',key:cell.key,node:cell.node};store.sharedSelection=null;persistSelection();renderSelection(buildResultFromCell(cell,active),active);return;}
    store.sharedSelection=null;
  }
  if(store.selection?.kind==='point'){
    if(store.unbounded&&Number.isFinite(store.selection.lat)&&Number.isFinite(store.selection.lon)){
      selectPoint(store.selection.lat,store.selection.lon);
      return;
    }
    store.selection={kind:'result',index:0};
  }
  if(store.selection?.kind==='cell'){
    const cell=store.cloudCells.find(candidate=>candidate.key===store.selection.key);
    if(cell){renderSelection(buildResultFromCell(cell,active),active);return;}
  }
  selectResult(clamp(Number(store.selection?.index)||0,0,Math.max(0,store.results.length-1)),active);
}
function interestRatingMarkup(result){
  return (result.ratings||cellRatings(result)).map(({key,rating})=>{
    const value=Math.round(Number(rating)||0),label=t('vector.'+key);
    return `<div class="fit-row" role="meter" aria-label="${esc(label)}: ${value}%" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${value}">
      <span class="fit-label">${esc(label)}</span>
      <span class="fit-track">${barMarkup('fit-fill',rating)}</span>
    </div>`;
  }).join('');
}
function legChip(leg){
  if(leg.mode==='walk')return `<span class="walk-leg route-walk"><span class="ride-text">${esc(leg.text||legLabel(leg))}</span></span>`;
  const rail=leg.mode==='rail';
  const label=leg.lineName||String(leg.line).replace(/^MTR\s+/i,'');
  const dot=rail?`<span class="mtr-dot" data-line="${esc(mtrLineCode(leg.line))}" aria-hidden="true"></span>`:'';
  const number=String(leg.line||'');
  const link=rail?null:routeLink(leg);
  const numberMarkup=link?`<a class="bus-link" href="${esc(link.uri)}" target="_blank" rel="noopener noreferrer" title="${esc(t(link.titleKey))}">${esc(number)}</a>`:esc(number);
  const modeLabel=rail?`${dot}${esc(label)}`:`${esc(t('mode.'+leg.mode)||t('mode.bus'))} ${numberMarkup}`;
  const stops=`<span class="leg-stops" aria-label="${esc(t('route.stops',{from:leg.from,to:leg.to}))}"><span class="leg-from">${esc(leg.from)}</span> <span class="leg-arrow" aria-hidden="true">→</span> <span class="leg-to">${esc(leg.to)}</span></span>`;
  const estimate=leg.fareEstimated?`<span class="fare-estimate" title="${esc(t('results.fareEstimated'))}" aria-label="${esc(t('results.fareEstimated'))}">≈</span>`:'';
  const fare=leg.fare?`<span class="fare">${estimate}${esc(t('results.fareTotal',{value:money(leg.fare)}))}</span>`:'';
  const wait=interchangeWaitText(leg);
  const waitNote=wait?`<span class="interchange-wait">${esc(wait)}</span>`:'';
  return `<span class="ride-leg route-${leg.mode}"><span class="leg-mode"><span class="icon icon-${rail?'rail':'bus'}" aria-hidden="true"></span>${modeLabel}</span>${stops}<span class="leg-meta"><span class="leg-time">${esc(minuteText(shownMinutes(leg)))}</span>${fare}${waitNote}</span></span>`;
}
// Which points a selection should fit: unlimited taps keep the current view,
// a reveal fits the whole route plus every start, and a plain bounded
// selection just centres the chosen area.
function fitTargetsForSelection(r,active,fit,unbounded){
  if(unbounded)return null;
  return fit?r.paths.flat().concat(active.map(p=>[p.origin.lat,p.origin.lon])):[[r.lat,r.lon]];
}
export function renderSelection(r,active=store.activePeople,fit=false){
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
      // Each person keeps their own colour; the line style still carries the
      // mode (dotted walk, dashed bus, solid rail).
      const color=PERSON_COLORS[j%PERSON_COLORS.length];
      L.polyline(leg.coords,{pane:'routePane',color,weight:leg.mode==='walk'?2:4,opacity:leg.mode==='walk'?.7:1,dashArray:dash,className:`route-line route-${leg.mode} route-person-${j}`})
        .bindTooltip(esc(`${displayName(active[j],j)}: ${legLabel(leg)}`)).addTo(routeLayer);
    });
  });
  const pointMarker=L.circleMarker([r.lat,r.lon],{pane:'pointPane',radius:12,color:ACCENT,weight:2,fillColor:ACCENT,fillOpacity:.16,bubblingMouseEvents:true,className:'point-pin'}).addTo(pointLayer);
  if(r.ratings){
    pointMarker.on('mouseover',event=>scheduleResultTooltip(r,event.originalEvent));
    pointMarker.on('mousemove',event=>positionTooltip(event.originalEvent));
    pointMarker.on('mouseout',hideTooltip);
  }
  L.circleMarker([r.lat,r.lon],{pane:'pointPane',radius:5,color:ACCENT,weight:2,fillColor:ACCENT,fillOpacity:1,interactive:false,className:'point-dot'}).addTo(pointLayer);
  $('detailTitle').textContent=r.label;
  $('detailDistrict').textContent=r.district;
  $('fitGrid').innerHTML=interestRatingMarkup(r);
  applyBarWidths($('fitGrid'));
  const spread=store.settings.fairness==='fare'?t('results.fareSpread',{value:money(r.fareGap)}):t('results.spread',{value:intNum(r.gap)});
  $('detailSub').textContent=`${spread} ${t('results.longest',{value:intNum(r.slowest)})}`;
  const already=r.times.every(value=>value<=0.5);
  $('steps').innerHTML=legCount?r.routes.map((route,j)=>`<div class="step">
    <span class="dot ${avatarClass(j)}">${esc(initialsFor(displayName(active[j],j)))}</span>
    <span class="txt"><b>${esc(displayName(active[j],j))}</b><span class="legs">${route.legs.map(legChip).join('')}</span><span class="route-meta"><span class="muted">${esc(t('results.totalTime',{value:minuteText(r.times[j])}))}</span>${fareMarkup(route)}</span></span></div>`).join(''):`<div class="step route-empty"><span class="txt"><b>${esc(r.label)}</b><span class="muted">${esc(t(already?'route.already':'results.noRoutes'))}</span></span></div>`;
  // An automatic bounded selection (search/rerender) only centres the chosen
  // place so heat cells stay tappable; unbounded mode keeps the current view
  // free for the next pin tap. An explicit selection fits the full route
  // inside the map area left visible by the mobile sheet.
  // Unlimited taps keep the current view; fitting here would snap or recentre
  // the map under the point the user just chose.
  const pts=fitTargetsForSelection(r,active,fit,store.unbounded);
  if(pts)fitMapTo(pts);
}
export function selectResult(i,active=store.activePeople,reveal=false){
  const r=store.results[i];if(!r)return;
  hideTooltip();
  clearPointNotice();
  clearStalePointSelection();
  store.selection={kind:'result',index:i};store.sharedSelection=null;
  persistSelection();
  if(reveal){setSidebarFace('detail');showMobileRoute();}
  renderSelection(r,active,reveal);
}
// Free-point picking is only offered above 300% tolerance. The pin stays at
// the exact click; routes end at the nearest transit stop that everyone can
// reach within the travel budget and the walk tolerance. Both limits include
// the final walk, so a distant stop cannot masquerade as a short trip.
export function selectPoint(lat,lon){
  if(!store.unbounded||!isNum(lat)||!isNum(lon))return;
  if(!store.NET||!store.effectiveGrids||!store.activePeople.length){
    showError(t('error.loading'));
    return;
  }
  hideTooltip();
  clearPointNotice();
  const grids=store.effectiveGrids,round=value=>Math.round(value*10)/10;
  const walkLimits=store.activePeople.map(person=>walkBudget(person));
  const approachMinutes=distance=>distance/1000/WALK_SPEED_KMH*60*WALK_DETOUR;
  let nearest=-1,bestScore=Infinity,walkOnlyRejected=false;
  for(const index of store.surface){
    const times=grids.map(grid=>grid[index]);
    if(times.some(value=>!isFinite(value)||value>TRAVEL_BUDGET_MINUTES))continue;
    const distance=haversine(lat,lon,store.NODES.lat[index],store.NODES.lon[index]);
    const walk=approachMinutes(distance);
    if(walk>TRAVEL_BUDGET_MINUTES||times.some(value=>value+walk>TRAVEL_BUDGET_MINUTES))continue;
    if(times.some((_,person)=>walk>walkLimits[person]+1e-9)){walkOnlyRejected=true;continue;}
    const score=distance+Math.max(...times)*10;
    if(score<bestScore){bestScore=score;nearest=index;}
  }
  if(nearest<0){
    // A point that is within the travel budget but beyond someone's walk limit
    // is a walk-limit failure even if other nearby stops are transit-infeasible.
    showPointNotice(t(walkOnlyRejected?'error.pointWalkLimit':'error.pointOutOfReach'));
    return;
  }
  const walk=approachMinutes(haversine(lat,lon,store.NODES.lat[nearest],store.NODES.lon[nearest]));
  const times=grids.map(grid=>round(grid[nearest]+walk));
  const slowest=Math.max(...times),fastest=Math.min(...times);
  const label=t('map.pinnedPoint');
  const cy=Math.floor(store.NODES.lat[nearest]/CELL_SIZE),cx=Math.floor(store.NODES.lon[nearest]/CELL_SIZE),poiCell={key:`${cy},${cx}`};
  const result={
    key:`point:${round(lat)},${round(lon)}`,node:nearest,label,
    district:districtFor(lat,lon),lat,lon,cellLat:lat,cellLon:lon,
    times,fastest:round(fastest),slowest:round(slowest),gap:round(slowest-fastest),
    score:round(slowest*2),point:{lat,lon},
    fit:cellPreference(poiCell),vector:cellVector(poiCell),count:cellCount(poiCell),ratings:cellRatings(poiCell),rating:overallRating(poiCell),poiKey:poiCell.key,
  };
  prepareRoutes(result,store.activePeople);
  store.selection={kind:'point',lat,lon,node:nearest};
  store.pointSelection={lat,lon,node:nearest,label};
  store.sharedSelection=null;
  persistSelection();
  setSidebarFace('detail');
  showMobileRoute();
  applyUnboundedUi();
  renderSelection(result,store.activePeople,true);
}
export function clearPoint(){
  clearPointNotice();
  store.pointSelection=null;
  store.selection={kind:'result',index:0};
  applyUnboundedUi();
  persistSelection();
  selectResult(0,store.activePeople);
}
