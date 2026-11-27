import { TRAVEL_TOLERANCE_DEFAULT,FARE_TOLERANCE_DEFAULT } from './config.js';

// Single home for every mutable cross-module value. Modules own behaviour;
// this object owns state so imports never need to reassign bindings.
let selectionState={kind:'result',index:0};
let sharedSelectionState=null;
export const store={
  NODES:{names:[],kind:[],lat:[],lon:[],st:[]},lowerNames:[],NET:null,HKBUS_URLS:null,MTR_FARES:null,ROUTE_FARES:null,walkAdj:null,rideAdj:null,nodeLines:null,surface:[],
  people:[],directory:[],settings:{modes:['rail','bus'],fairness:'time',tolerance:TRAVEL_TOLERANCE_DEFAULT,fareTolerance:FARE_TOLERANCE_DEFAULT,includeHeadway:true,vectors:null,beta:{vectors:false}},seq:1,directorySeq:1,pendingDelete:null,lastDialogFocus:null,
  results:[],cloudCells:[],sols:[],effectiveGrids:null,unbounded:false,pointSelection:null,selectedDetail:null,activePeople:[],selected:0,
  get selection(){return selectionState;},
  // A map clear must not discard a point/cell selection still waiting to be
  // applied, but an explicit restore must be able to set result index 0.
  setSelection(value,{force=false}={}){
    if(!force&&value?.kind==='result'&&value.index===0&&sharedSelectionState&&sharedSelectionState.kind!=='result')return;
    selectionState=value;
  },
  set selection(value){this.setSelection(value);},
  get sharedSelection(){return sharedSelectionState;},
  set sharedSelection(value){sharedSelectionState=value;},
  geoCache:{},pinTarget:null,recomputeSelection:null,
  POI:null,poiLoaded:false,poiLoading:null,recomputeTimer:null,workSeq:0,hoverCell:null,tooltipTimer:null,solveKey:null,
  locale:'en',EN:{},I18N:{},DISTRICTS:[],sidebarFace:'people',mobile:{view:'plan',mapShown:false},
};
