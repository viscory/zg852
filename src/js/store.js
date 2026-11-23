// Single home for every mutable cross-module value. Modules own behaviour;
// this object owns state so imports never need to reassign bindings.
export const store={
  NODES:null,NET:null,walkAdj:null,rideAdj:null,nodeLines:null,surface:[],
  people:[],directory:[],settings:{modes:['rail','bus'],tolerance:0.1,budget:60,vectors:null,beta:{vectors:false}},seq:1,directorySeq:1,pendingDelete:null,lastDialogFocus:null,
  results:[],cloudCells:[],sols:[],activePeople:[],selected:0,
  selection:{kind:'result',index:0},sharedSelection:null,
  geoCache:{},pinTarget:null,
  POI:null,poiLoaded:false,poiLoading:null,recomputeTimer:null,workSeq:0,hoverCell:null,tooltipTimer:null,
  locale:'en',EN:{},I18N:{},DISTRICTS:[],
};
