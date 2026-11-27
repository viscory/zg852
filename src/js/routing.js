import { RAIL_FARE_BANDS,BUS_FARE_BANDS,FARE_INTERCHANGE_WALK_MINUTES,ACCESS_RADIUS_M,MAX_ACCESS_NODES,CELL_SIZE,WALK_SPEED_KMH,WALK_DETOUR,lineCategoryBit } from './config.js';
import { railFare,aelFareForNodes,lightRailFare,isEstimatedFare,warnOnce } from './fares.js';
import { store } from './store.js';
import { isNum,haversine,walkMinutes,round1,esc } from './util.js';
import { t,tp,num,minuteText } from './i18n.js';
import { nodePriority,catKey,districtFor } from './data.js';
import { cellVector,cellCount,cellPreference,cellFitScore,cellRatings,overallRating } from './vectors.js';
import { compareAreaRank,overFairnessBand,snapWalkMinutes,sourceRankMinutes,WALK_STEP_DEFAULT } from './model.js';

// The routing engine: multi-source Dijkstra over the walk+ride graph, fare
// estimation, leg narration, and fair-cell construction. Pure with respect to
// the DOM; it reads the network and settings from the shared store.

export function bandFare(km,bands){return bands.find(([limit])=>km<=limit)[1];}
export function legDistanceKm(leg){
  let metres=0;
  for(let i=1;i<leg.coords.length;i++){
    const a=leg.coords[i-1],b=leg.coords[i];
    if(isNum(a[0])&&isNum(a[1])&&isNum(b[0])&&isNum(b[1]))metres+=haversine(a[0],a[1],b[0],b[1]);
  }
  return metres/1000;
}
const RIDE_MODES=['rail','bus','ferry','lightRail'];
export function rideMode(code){return RIDE_MODES[code]||'bus';}
// The AEL label is the metadata marker for Airport Express. When a leg carries
// a resolvable line index the bundled metadata is authoritative; the legacy
// label prefix stays as the fallback for legs built without that index, so the
// special-case set is unchanged.
const AIRPORT_EXPRESS_LINE_LABEL='MTR AEL';
export function isAirportExpressLeg(leg){
  if(!leg)return false;
  const info=Number.isInteger(leg.lineIndex)?store.NET?.lines?.[leg.lineIndex]:null;
  return info?.l===AIRPORT_EXPRESS_LINE_LABEL||String(leg.line??'').startsWith(AIRPORT_EXPRESS_LINE_LABEL);
}
export function scheduledRouteFare(leg){
  const fares=store.ROUTE_FARES?.fares,fare=fares?.[leg.lineIndex];
  return isNum(fare)&&fare>0?fare:null;
}
export function routeFares(route){
  let rail=0,bus=0,lightRail=0,railKm=0,railStart=null,railEnd=null,railLegs=[],lrStops=0,lrLegs=[],estimated=false;
  const mark=(legs,value,source)=>{
    for(const leg of legs){leg.fareEstimated=value;leg.fareSource=source;}
    if(value)estimated=true;
  };
  const flushRail=()=>{
    if(railKm>0){
      const looked=railFare(railStart,railEnd);
      if(looked===null)warnOnce('MTR fare not in lookup table',railStart,railEnd);
      const fare=round1(looked??bandFare(railKm,RAIL_FARE_BANDS));
      rail+=fare;
      for(const leg of railLegs)leg.fare=fare;
      mark(railLegs,looked===null,looked===null?'band':'mtr-matrix');
      railKm=0;railStart=null;railEnd=null;railLegs=[];
    }
  };
  const flushLightRail=()=>{
    if(lrLegs.length){
      // describe() increments stopCount on every ride edge after the first
      // ride state of a leg, so N ride edges give stopCount = N. The chart
      // counts the boarding and alighting stops too: sum(stopCount) + legs.
      const stops=lrStops+lrLegs.length;
      const fare=round1(lightRailFare(stops));
      lightRail+=fare;
      for(const leg of lrLegs)leg.fare=fare;
      mark(lrLegs,false,'lr-chart');
      lrStops=0;lrLegs=[];
    }
  };
  for(const leg of route.legs){
    if(leg.mode==='walk'){
      leg.fare=0;leg.fareEstimated=false;leg.fareSource=null;
      if(leg.minutes>FARE_INTERCHANGE_WALK_MINUTES){flushRail();flushLightRail();}
      continue;
    }
    if(leg.mode==='rail'&&isAirportExpressLeg(leg)){
      flushRail();flushLightRail();
      const official=aelFareForNodes(leg.fromNode,leg.toNode);
      // City-to-city AEL pairs are not published in the bundled matrix. Keep
      // the ride usable, but never present the band estimate as an official fare.
      const fare=round1(official??bandFare(legDistanceKm(leg),RAIL_FARE_BANDS));
      rail+=fare;leg.fare=fare;mark([leg],official===null,official===null?'band':'ael-matrix');
      continue;
    }
    const km=legDistanceKm(leg);
    if(leg.mode==='rail'){
      flushLightRail();
      if(railKm===0)railStart=leg.fromNode;
      railKm+=km;railEnd=leg.toNode;railLegs.push(leg);leg.fare=0;
    }else if(leg.mode==='lightRail'){
      flushRail();
      lrStops+=leg.stopCount||0;lrLegs.push(leg);leg.fare=0;
    }else{
      flushRail();flushLightRail();
      const official=scheduledRouteFare(leg);
      const fare=round1(official??bandFare(km,BUS_FARE_BANDS));
      // Certainty follows the snapshot: a published Transport Department full
      // fare is exact for buses and ferries alike; only the band fallback is an
      // estimate.
      const estimated=isEstimatedFare(leg,official);
      bus+=fare;leg.fare=fare;mark([leg],estimated,official===null?'band':'td-snapshot');
    }
  }
  flushRail();flushLightRail();
  return{rail:round1(rail),lightRail:round1(lightRail),bus:round1(bus),total:round1(rail+lightRail+bus),estimated};
}
export const walkBudget=person=>snapWalkMinutes(person?.walkMinutes);
export function prepareRoutes(result,active=store.activePeople){
  result.routes=store.sols.map((solution,j)=>reconcileDisplayMinutes(
    describe(solution,active[j].origin,result.node,walkBudget(active[j]),result.point||null),result.times[j]));
  // The card's per-person times are the totals the route steps actually show.
  result.times=result.routes.map(route=>route.shownTotal);
  result.fastest=Math.min(...result.times);result.slowest=Math.max(...result.times);
  result.gap=result.slowest-result.fastest;
  result.shownSlowest=result.slowest;result.shownGap=result.gap;
  result.paths=result.routes.map(route=>route.path);
  return result;
}
export function money(value){return `HK$${num(value)}`;}
export function fareMarkup(route){
  const fares=route?.fares||{total:0};
  if(!fares.total)return `<span class="person-fares"><span class="fare total walk-only">${esc(t('results.walkOnly'))}</span></span>`;
  const estimate=fares.estimated?`<span class="fare-estimate" title="${esc(t('results.fareEstimated'))}" aria-label="${esc(t('results.fareEstimated'))}">≈</span>`:'';
  return `<span class="person-fares"><span class="fare total">${estimate}${esc(t('results.fareTotal',{value:money(fares.total)}))}</span></span>`;
}

export class MinHeap{
  constructor(){this.d=[];this.k=[];}
  get size(){return this.d.length;}
  push(d,k){let i=this.d.length;this.d.push(d);this.k.push(k);
    while(i>0){const p=(i-1)>>1;if(this.d[p]<=this.d[i])break;
      [this.d[p],this.d[i]]=[this.d[i],this.d[p]];[this.k[p],this.k[i]]=[this.k[i],this.k[p]];i=p;}}
  pop(){const d=this.d[0],k=this.k[0],n=this.d.length-1;
    this.d[0]=this.d[n];this.k[0]=this.k[n];this.d.pop();this.k.pop();let i=0;
    while(true){let l=i*2+1,r=l+1,s=i;
      if(l<n&&this.d[l]<this.d[s])s=l;if(r<n&&this.d[r]<this.d[s])s=r;if(s===i)break;
      [this.d[s],this.d[i]]=[this.d[i],this.d[s]];[this.k[s],this.k[i]]=[this.k[i],this.k[s]];i=s;}
    return[d,k];}
}

// Solver state identity is an explicit (node, line) pair, not a packed integer.
// FRESH (-2) and BOARDED (-1) are walk states; line codes are >= 0. Keeping the
// pair as a typed string avoids stride arithmetic and hidden bit allocations.
export const FRESH=-2,BOARDED=-1;
export function encodeState(node,line){return `${node}:${line}`;}
export function decodeNode(state){const i=state.indexOf(':');return Number(i<0?state:state.slice(0,i));}
export function decodeLine(state){const i=state.indexOf(':');return Number(i<0?0:state.slice(i+1));}
export function isWalkState(line){return line<0;}
export function isFreshState(line){return line===FRESH;}
export function isBoardedState(line){return line===BOARDED;}

export function solve(sources,mask,maxTime=180){
  // FRESH is on foot before any boarding, BOARDED is on foot after alighting,
  // and a non-negative line code means riding that line.
  const include=store.settings.includeHeadway!==false;
  const key=(node,line)=>encodeState(node,line),start=-1;
  const dist=new Map(),prev=new Map(),heap=new MinHeap();
  sources.forEach(({node,minutes})=>{
    const k=key(node,FRESH);
    if(minutes<=maxTime&&minutes<(dist.get(k)??Infinity)){dist.set(k,minutes);prev.set(k,start);heap.push(minutes,k);}
  });
  const relax=(k,cost,from)=>{
    if(cost<(dist.get(k)??Infinity)&&cost<=maxTime){
      dist.set(k,cost);prev.set(k,from);heap.push(cost,k);
    }
  };
  while(heap.size){
    const[d,k]=heap.pop();
    if(d>(dist.get(k)??Infinity)||d>maxTime)continue;
    const node=decodeNode(k),line=decodeLine(k);
    if(isWalkState(line)){
      for(const[to,step]of store.walkAdj[node])relax(key(to,line),d+step,k);
      for(const li of store.nodeLines[node])if(mask&lineCategoryBit(store.NET.lines[li].c)){
        const info=store.NET.lines[li],wait=isNum(info.w)?info.w:0;
        // w is the fixed boarding penalty; the capped half-headway h applies
        // only when boarding after alighting a transit leg (BOARDED foot state).
        const extra=include&&isBoardedState(line)&&isNum(info.h)?info.h:0;
        relax(key(node,li),d+wait+extra,k);
      }
    }else{
      relax(key(node,BOARDED),d,k);
      for(const[li,to,step]of store.rideAdj[node])if(li===line)relax(key(to,li),d+step,k);
    }
  }
  return{dist,prev,key,start};
}
export function bestTimes(sol){
  const best=new Float64Array(store.NODES.names.length).fill(Infinity);
  for(const[k,d]of sol.dist){const node=decodeNode(k);if(d<best[node])best[node]=d;}
  return best;
}
export function walkTimes(sol){
  const best=new Float64Array(store.NODES.names.length).fill(Infinity);
  for(const[k,d]of sol.dist)if(isFreshState(decodeLine(k))){const node=decodeNode(k);if(d<best[node])best[node]=d;}
  return best;
}
// Origin kinds are entry points, not ride modes: solve() filters ride edges by
// modesMask separately. Light-rail stops share kind 4 with bus stops, so a
// light-rail-only start must include kind 4 or every real light-rail stop is
// discarded before routing. No companion ride mode is enabled by this list.
const MODE_NODE_KINDS={rail:[1,3],lightRail:[1,2,3,4],bus:[4],ferry:[1,3,4]};
function singleMode(){
  const modes=store.settings.modes||[];
  return modes.length===1?modes[0]:null;
}
export function sourceNodeIndices(){
  const mode=singleMode(),kinds=mode&&MODE_NODE_KINDS[mode];
  if(!kinds)return store.surface;
  const out=[];
  for(let i=0;i<store.NODES.names.length;i++)if(kinds.includes(store.NODES.kind[i]))out.push(i);
  return out;
}
export function nodeCompatible(kind){
  const mode=singleMode(),kinds=mode&&MODE_NODE_KINDS[mode];
  return !kinds||kinds.includes(kind);
}
export const SOURCE_READY='ready';
export const SOURCE_NO_STOP='no-stop';
export const SOURCE_WRONG_MODE='wrong-mode';
export const SOURCE_OUTSIDE_WALK='outside-walk';
function sourceGroup(node){
  const kind=store.NODES.kind[node],name=String(store.NODES.names[node]||'');
  if(kind===1||kind===2||kind===3){
    const marker=name.indexOf(' · ');
    return `rail:${marker<0?name:name.slice(0,marker)}`;
  }
  return `stop:${name}:${store.NODES.lat[node]}:${store.NODES.lon[node]}`;
}
// Starts are matched inside one fixed radius. Grouping by station only avoids
// listing every exit separately; the representative is the closest stop, with
// no kind-based bonus changing the walk time the user was told about.
export function nearestSources(lat,lon,budget,indices){
  const near=[];
  for(const idx of indices)near.push([haversine(lat,lon,store.NODES.lat[idx],store.NODES.lon[idx]),idx]);
  near.sort((a,b)=>a[0]-b[0]);
  const pool=near.filter(([d])=>d<=ACCESS_RADIUS_M);
  const groups=new Map();
  for(const [d,idx] of pool){
    const minutes=walkMinutes(d),rank=sourceRankMinutes(minutes),key=sourceGroup(idx),current=groups.get(key);
    if(!current||rank<current.rank)groups.set(key,{minutes,idx,rank});
  }
  const use=[...groups.values()].sort((a,b)=>a.rank-b.rank).slice(0,MAX_ACCESS_NODES);
  return use.map(({minutes,idx})=>({node:idx,minutes})).filter(s=>s.minutes<=budget);
}
export function sourcesFor(origin,budget){
  const empty=reason=>({sources:[],reason});
  const ready=sources=>({sources,reason:SOURCE_READY});
  if(!origin||!store.NODES)return empty(SOURCE_NO_STOP);
  const indices=sourceNodeIndices();
  if(!indices.length)return empty(SOURCE_WRONG_MODE);
  if(origin.kind==='node'&&Number.isInteger(origin.node)&&origin.node>=0&&origin.node<store.NODES.names.length){
    if(nodeCompatible(store.NODES.kind[origin.node]))return ready([{node:origin.node,minutes:0}]);
    if((store.settings.modes||[]).length!==1)return ready([{node:origin.node,minutes:0}]);
    const nearest=nearestSources(store.NODES.lat[origin.node],store.NODES.lon[origin.node],budget,indices);
    return nearest.length?ready(nearest):empty(SOURCE_WRONG_MODE);
  }
  if(!isNum(origin.lat)||!isNum(origin.lon))return empty(SOURCE_NO_STOP);
  const nearest=nearestSources(origin.lat,origin.lon,budget,indices);
  if(nearest.length)return ready(nearest);
  // A stop exists nearby but the chosen single mode excludes it: say so,
  // instead of reporting that the place has no transit at all.
  if((store.settings.modes||[]).length===1&&nearestSources(origin.lat,origin.lon,budget,store.surface).length)return empty(SOURCE_WRONG_MODE);
  return empty(SOURCE_OUTSIDE_WALK);
}
export function dedupePath(path){
  return path.filter((p,i)=>i===0||Math.abs(p[0]-path[i-1][0])>1e-7||Math.abs(p[1]-path[i-1][1])>1e-7);
}
export function stopName(name){
  const value=String(name||'');
  const platform=value.indexOf(' · Platform ');
  if(platform>=0)return value.slice(0,platform);
  const exit=value.indexOf(' · Exit (');
  if(exit>=0)return value.slice(0,exit);
  return value;
}
// Each leg is rounded on its own. The displayed total is then the sum of the
// displayed legs (plus separately noted interchange waits), so nothing is
// redistributed between legs to force an independently rounded total to agree.
export function shownMinutes(leg){return Number.isFinite(leg.shownMinutes)?leg.shownMinutes:leg.minutes;}
export function walkLegText(leg){return t('route.walkLeg',{time:minuteText(shownMinutes(leg))}).replace(/\s+/g,' ').trim();}
export function interchangeWaitText(leg){return leg.interchangeWait>0?t('route.interchangeWait',{value:minuteText(leg.interchangeWait)}):'';}
export function rideLegText(leg){
  const stops=tp('route.stopCount',leg.stopCount||0);
  const line=leg.mode==='rail'?(leg.lineName||String(leg.line).replace(/^MTR\s+/i,'')):leg.line;
  const text=t('route.rideLeg',{mode:t('mode.'+leg.mode),line,from:leg.from,to:leg.to,stops,time:minuteText(shownMinutes(leg))});
  return (text+' '+interchangeWaitText(leg)).replace(/\s+/g,' ').trim();
}
export function legLabel(leg){return leg.mode==='walk'?walkLegText(leg):rideLegText(leg);}
// Each leg is rounded independently. Interchange waits were already excluded
// from ride-leg minutes when the legs were built, so their rounded total is
// added back here as a separate figure: screen total = displayed legs + waits.
export function reconcileDisplayMinutes(route,total){
  const legs=route.legs;
  if(!legs.length||!isNum(total)){route.shownTotal=Math.max(0,Math.round(total||0));return route;}
  const waitTotal=legs.reduce((a,l)=>a+(l.interchangeWait>0?Math.round(l.interchangeWait):0),0);
  const shown=legs.map(l=>Math.max(0,Math.round(l.minutes)));
  legs.forEach((leg,i)=>{
    leg.shownMinutes=shown[i];
    leg.text=leg.mode==='walk'&&leg.to===t('map.pinnedPoint')
      ?t('route.walkTo',{time:minuteText(shown[i]),to:leg.to}).replace(/\s+/g,' ').trim()
      :legLabel(leg);
  });
  route.shownTotal=shown.reduce((a,b)=>a+b,0)+waitTotal;
  route.text=legs.map(leg=>leg.text).join(' -> ')||t('route.already');
  return route;
}
// reconstructChain can be re-entered and is called for many candidate routes,
// so the cycle guard is allocated per call instead of shared at module scope.
export function reconstructChain(sol,k){
  // Stop on the real predecessor cycle instead of an arbitrary hop limit; a
  // well-formed Dijkstra tree has no cycle, so ordinary chains are unchanged.
  const chainSeen=new Set();
  const chain=[];let cur=k;
  while(cur!==undefined&&cur!==sol.start&&!chainSeen.has(cur)){
    chainSeen.add(cur);chain.push(cur);cur=sol.prev.get(cur);
  }
  return chain.reverse();
}
// A walk-only route to a pinned point can end with two adjacent walk legs:
// the walk to the nearest stop, then the short walk from that stop to the pin.
// Show that as one continuous walk instead of "Walk 6 min" + "Walk 2 min".
function mergeWalks(legs){
  for(let i=legs.length-1;i>0;i--){
    const previous=legs[i-1],next=legs[i];
    if(previous.mode!=='walk'||next.mode!=='walk')continue;
    const minutes=previous.minutes+next.minutes,pinned=next.to===t('map.pinnedPoint');
    const text=pinned?t('route.walkTo',{time:minuteText(minutes),to:next.to}):t('route.walkLeg',{time:minuteText(minutes)});
    legs.splice(i-1,2,{...previous,minutes,coords:dedupePath([...previous.coords,...next.coords]),to:next.to,toNode:next.toNode,text});
  }
  return legs;
}
// GEOMETRY_EPSILON / samePoint(): historical polyline precision. The bundled
// paths were rounded to ~1e-5 degrees, so 1e-4 is a generous endpoint match
// for those legacy coordinates. Kept here instead of allocating the comparison
// closure for every leg of every candidate route.
const GEOMETRY_EPSILON=1e-4;
function samePoint(point,target){
  return Array.isArray(point)&&point.length>=2&&target&&
    Math.abs(point[0]-target[0])<GEOMETRY_EPSILON&&Math.abs(point[1]-target[1])<GEOMETRY_EPSILON;
}
export function describe(sol,origin,target,walkMinutes=WALK_STEP_DEFAULT,targetPoint=null){
  const walkLimit=snapWalkMinutes(walkMinutes),includeHeadway=store.settings.includeHeadway!==false,candidates=[];
  for(let l=FRESH;l<store.NET.lines.length;l++){
    const k=sol.key(target,l),d=sol.dist.get(k);
    if(d===undefined)continue;
    const legs=[],chain=reconstructChain(sol,k);
    let current=null,lastCoord=[origin.lat,origin.lon];
    const close=()=>{
      if(current){
        current.coords=dedupePath(current.coords);
        if(current.minutes>0.05||current.coords.length>1){current.text=legLabel(current);legs.push(current);}
      }
      current=null;
    };
    chain.forEach((st,i)=>{
      const node=decodeNode(st),line=decodeLine(st);
      const pst=i===0?sol.start:chain[i-1];
      const priorDistance=pst===sol.start?0:(sol.dist.get(pst)??0);
      const stepT=(sol.dist.get(st)??0)-priorDistance;
      const coord=[store.NODES.lat[node],store.NODES.lon[node]],rawName=store.NODES.names[node];
      if(isWalkState(line)){
        const name=stopName(rawName);
        if(!current||current.mode!=='walk'){
          close();
          current={mode:'walk',line:'',minutes:0,coords:[lastCoord],from:name,to:name,fromNode:node,toNode:node,stopCount:0};
        }
        current.minutes+=stepT;current.coords.push(coord);current.to=name;current.toNode=node;
      }else{
        const info=store.NET.lines[line],mode=rideMode(info.c),label=info.l,name=mode==='rail'||mode==='lightRail'?stopName(rawName):rawName;
        if(!current||current.mode!==mode||current.line!==label){
          close();
          // The first ride-state stepT contains the boarding penalty w from
          // solve(). When headway is on, an interchange boarding also includes
          // the capped half-headway h. The wait is rendered as its own leg note,
          // so subtract it from the ride text to avoid showing it twice while
          // keeping the charged total (and ranking) unchanged.
          const fromBoarded=pst!==sol.start&&isBoardedState(decodeLine(pst));
          const interchangeWait=includeHeadway&&fromBoarded&&isNum(info.h)?info.h:0;
          current={mode,line:label,lineName:info.n||info.l,lineIndex:line,minutes:Math.max(0,stepT-interchangeWait),coords:[coord,coord],from:name,to:name,fromNode:node,toNode:node,stopCount:0,interchangeWait};
        }else{
          current.minutes+=stepT;
          const fromNode=pst===sol.start?null:decodeNode(pst);
          const edgeIndex=fromNode===null?undefined:store.rideAdj[fromNode].find(([id,to])=>id===line&&to===node)?.[3];
          const seg=edgeIndex===undefined?null:store.NET.lines[line].g?.[edgeIndex];
          const start=fromNode===null?null:[store.NODES.lat[fromNode],store.NODES.lon[fromNode]];
          if(Array.isArray(seg)&&seg.length>1&&start){
            let points=seg;
            if(!samePoint(points[0],start)&&samePoint(points[points.length-1],start))points=[...points].reverse();
            if(samePoint(points[0],start)&&samePoint(points[points.length-1],coord))current.coords.push(...points.slice(1));
            else current.coords.push(coord);
          }else current.coords.push(coord);
          current.to=name;current.toNode=node;current.stopCount++;
        }
      }
      lastCoord=coord;
    });
    close();
    // In unbounded mode the selected point is not a transit node, so append a
    // short walk from the last stop to the exact pin.
    if(targetPoint&&isNum(targetPoint.lat)&&isNum(targetPoint.lon)){
      const nodeCoord=[store.NODES.lat[target],store.NODES.lon[target]];
      const pointCoord=[targetPoint.lat,targetPoint.lon];
      const distance=haversine(nodeCoord[0],nodeCoord[1],pointCoord[0],pointCoord[1]);
      if(distance>1){
        const minutes=distance/1000/WALK_SPEED_KMH*60*WALK_DETOUR;
        const finalWalk={mode:'walk',line:'',minutes,coords:[nodeCoord,pointCoord],from:stopName(store.NODES.names[target]),to:t('map.pinnedPoint'),fromNode:target,toNode:target,stopCount:0};
        finalWalk.text=t('route.walkTo',{time:minuteText(minutes),to:t('map.pinnedPoint')});
        legs.push(finalWalk);
      }
    }
    const merged=mergeWalks(legs);
    const fares=routeFares({legs:merged});
    candidates.push({d,line:l,legs:merged,fares,total:fares.total});
  }
  if(!candidates.length)return{text:t('route.unreachable'),legs:[],path:[[origin.lat,origin.lon]],fares:{rail:0,lightRail:0,bus:0,total:0,estimated:false}};
  // By design a direct walk wins whenever it fits options.walkTolerance: this
  // is a walk-first preference, not a fastest-path guarantee. Faster transit
  // routes are only considered when no walk candidate fits the tolerance.
  const walk=candidates.find(c=>c.line===FRESH&&c.d<=walkLimit);
  if(!walk)candidates.sort((a,b)=>a.d-b.d||a.total-b.total);
  const best=walk||candidates[0],legs=best.legs;
  const text=legs.map(leg=>leg.text).join(' -> ')||t('route.already');
  const path=dedupePath(legs.flatMap(leg=>leg.coords));
  return{text,legs,path,fares:best.fares};
}
export function buildCells(grids,tolerance,budget){
  const cells=new Map();
  for(const idx of store.surface){
    const times=grids.map(g=>g[idx]);
    if(times.some(v=>!isFinite(v)))continue;
    if(Math.max(...times)>budget)continue;
    const fastest=Math.min(...times),slowest=Math.max(...times),gap=slowest-fastest;
    const kind=store.NODES.kind[idx];
    if(overFairnessBand({fastest,slowest,gap,kind},tolerance))continue;
    const cy=Math.floor(store.NODES.lat[idx]/CELL_SIZE),cx=Math.floor(store.NODES.lon[idx]/CELL_SIZE),cellKey=`${cy},${cx}`;
    // Rank on the numbers the card actually shows, so the visible spread and
    // longest explain the order. Raw times still drive the tolerance filter.
    const whole=times.map(Math.round);
    const shownSlowest=Math.max(...whole),shownGap=shownSlowest-Math.min(...whole);
    const score=shownSlowest+shownGap,priority=nodePriority(kind);
    let cell=cells.get(cellKey);
    if(!cell){cells.set(cellKey,{key:cellKey,cy,cx,node:idx,label:store.NODES.names[idx],priority,keyCat:catKey(priority),kind,times,fastest,slowest,gap,shownSlowest,shownGap,score});continue;}
    if(score<cell.score||score===cell.score&&shownGap<cell.shownGap){
      cell.node=idx;cell.label=store.NODES.names[idx];cell.priority=priority;cell.keyCat=catKey(priority);cell.kind=kind;
      cell.times=times;cell.fastest=fastest;cell.slowest=slowest;cell.gap=gap;cell.shownSlowest=shownSlowest;cell.shownGap=shownGap;cell.score=score;
    }
  }
  return [...cells.values()].map(cell=>{
    const vectorAdjustment=cellPreference(cell);
    return {...cell,vectorAdjustment,fitScore:cellFitScore(cell)};
  }).sort((a,b)=>compareAreaRank(a,b,'time'));
}
export function cellToResult(cell){
  const lat=store.NODES.lat[cell.node],lon=store.NODES.lon[cell.node],round=v=>Math.round(v*10)/10;
  const preference=cellPreference(cell);
  // Every display site shows whole minutes. Derive the spread and longest from
  // those same numbers so the cards can never contradict their own totals.
  const whole=cell.times.map(Math.round);
  return{
    key:cell.key,node:cell.node,kind:cell.kind,label:cell.label,catKey:cell.keyCat,district:districtFor(lat,lon),lat,lon,
    cellLat:cell.cy*CELL_SIZE+CELL_SIZE/2,cellLon:cell.cx*CELL_SIZE+CELL_SIZE/2,
    times:whole,
    fastest:Math.min(...whole),slowest:Math.max(...whole),gap:Math.max(...whole)-Math.min(...whole),
    shownSlowest:Math.max(...whole),shownGap:Math.max(...whole)-Math.min(...whole),score:round(cell.score),
    fitScore:cell.fitScore??round(cell.score-preference),vectorAdjustment:preference,
    fares:cell.fares,maxFare:cell.maxFare,totalFare:cell.totalFare,fareGap:cell.fareGap,
    fareSpread:cell.fareSpread,fareScore:cell.fareScore,fareEstimated:cell.fareEstimated,
    fit:preference,vector:cellVector(cell),count:cellCount(cell),ratings:cellRatings(cell),rating:overallRating(cell),
  };
}
