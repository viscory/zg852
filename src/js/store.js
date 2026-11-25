// Single home for every mutable cross-module value. Modules own behaviour;
// this object owns state so imports never need to reassign bindings.
let selectionState={kind:'result',index:0};
let sharedSelectionState=null;
export const store={
  NODES:{names:[],kind:[],lat:[],lon:[],st:[]},lowerNames:[],NET:null,HKBUS_URLS:null,MTR_FARES:null,walkAdj:null,rideAdj:null,nodeLines:null,surface:[],
  people:[],directory:[],settings:{modes:['rail','bus'],fairness:'time',tolerance:0.1,fareTolerance:0.25,includeHeadway:true,vectors:null,beta:{vectors:false}},seq:1,directorySeq:1,pendingDelete:null,lastDialogFocus:null,
  results:[],cloudCells:[],sols:[],effectiveGrids:null,unbounded:false,pointSelection:null,activePeople:[],selected:0,
  get selection(){return selectionState;},
  // Clearing map output must not discard a point/cell selection that is still
  // waiting to be applied after a shared link or a reload.
  set selection(value){
    if(value?.kind==='result'&&value.index===0&&sharedSelectionState&&sharedSelectionState.kind!=='result')return;
    selectionState=value;
  },
  get sharedSelection(){return sharedSelectionState;},
  set sharedSelection(value){sharedSelectionState=value;},
  geoCache:{},pinTarget:null,
  POI:null,poiLoaded:false,poiLoading:null,recomputeTimer:null,workSeq:0,hoverCell:null,tooltipTimer:null,solveKey:null,
  locale:'en',EN:{},I18N:{},DISTRICTS:[],sidebarFace:'people',mobile:{view:'plan'},
};
