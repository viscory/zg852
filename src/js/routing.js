import { RAIL_FARE_BANDS,BUS_FARE_BANDS,AEL_FARES,FARE_INTERCHANGE_WALK_MINUTES,ACCESS_RADIUS_M,MAX_ACCESS_NODES,CELL_SIZE,WALK_TOLERANCE_DEFAULT,WALK_TOLERANCE_MAX } from './config.js';
import { store } from './store.js';
import { isNum,haversine,walkMinutes,clamp,round1,esc } from './util.js';
import { t,tp,num,minuteText } from './i18n.js';
import { nodePriority,catKey,districtFor } from './data.js';
import { cellVector,cellCount,cellPreference } from './vectors.js';

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
export function aelFare(from,to){
  const ends=new Set([stopName(from),stopName(to)]);
  if(ends.size<2)return 0;
  for(const [a,b,fare] of AEL_FARES)if(ends.has(a)&&ends.has(b))return fare;
  return 64.5;
}
export function routeFares(route){
  let rail=0,bus=0,railKm=0,railLeg=null;
  const flushRail=()=>{
    if(railKm>0){
      const fare=round1(bandFare(railKm,RAIL_FARE_BANDS));
      rail+=fare;
      if(railLeg)railLeg.fare=fare;
      railKm=0;railLeg=null;
    }
  };
  for(const leg of route.legs){
    if(leg.mode==='walk'){
      leg.fare=0;
      if(leg.minutes>FARE_INTERCHANGE_WALK_MINUTES)flushRail();
      continue;
    }
    if(leg.mode==='rail'&&String(leg.line).startsWith('MTR AEL')){
      flushRail();
      const fare=round1(aelFare(leg.from,leg.to));
      rail+=fare;leg.fare=fare;
      continue;
    }
    const km=legDistanceKm(leg);
    if(leg.mode==='rail'||leg.mode==='lightRail'){
      railKm+=km;leg.fare=0;railLeg=leg;
    }else{
      flushRail();
      const fare=round1(bandFare(km,BUS_FARE_BANDS));
      bus+=fare;leg.fare=fare;
    }
  }
  flushRail();
  return{rail:round1(rail),bus:round1(bus),total:round1(rail+bus)};
}
export const walkBudget=person=>clamp(person?.walkMinutes,0,WALK_TOLERANCE_MAX,WALK_TOLERANCE_DEFAULT);
export function prepareRoutes(result,active=store.activePeople,metric='time'){
  result.routes=store.sols.map((solution,j)=>describe(solution,active[j].origin,result.node,metric,walkBudget(active[j])));
  result.paths=result.routes.map(route=>route.path);
  return result;
}
export function money(value){return `HK$${num(value)}`;}
export function fareMarkup(route){
  const fares=route?.fares||{total:0};
  return `<span class="person-fares"><span class="fare total">${esc(t('results.fareTotal',{value:money(fares.total)}))}</span></span>`;
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

export function solve(sources,mask,maxTime=180,mode='time'){
  // In fare mode `dist` holds accumulated boarding fares instead of minutes;
  // a parallel arrival map keeps the same time budget on the same state graph.
  const fareMode=mode==='fare';
  const stride=store.NET.lines.length+1,key=(node,line)=>node*stride+(line+1),start=-1;
  const dist=new Map(),prev=new Map(),heap=new MinHeap(),arrival=new Map();
  sources.forEach(({node,minutes})=>{
    const k=key(node,-1);
    if(minutes<=maxTime&&minutes<(dist.get(k)??Infinity)){dist.set(k,minutes);arrival.set(k,minutes);prev.set(k,start);heap.push(minutes,k);}
  });
  const relax=(k,cost,from,time)=>{
    if(fareMode){
      if(time>maxTime+1e-9)return;
      const known=dist.get(k)??Infinity,knownTime=arrival.get(k)??Infinity;
      if(cost>known||(cost===known&&time>=knownTime))return;
      dist.set(k,cost);arrival.set(k,time);prev.set(k,from);heap.push(cost,k);
    }else if(cost<(dist.get(k)??Infinity)&&cost<=maxTime){
      dist.set(k,cost);prev.set(k,from);heap.push(cost,k);
    }
  };
  while(heap.size){
    const[d,k]=heap.pop();
    if(d>(dist.get(k)??Infinity)||(!fareMode&&d>maxTime))continue;
    const time=fareMode?arrival.get(k):d;
    if(fareMode&&(time===undefined||time>maxTime+1e-9))continue;
    const node=Math.floor(k/stride),line=(k%stride)-1;
    if(line<0){
      for(const[to,step]of store.walkAdj[node])relax(key(to,-1),fareMode?d:d+step,k,fareMode?time:undefined);
      for(const li of store.nodeLines[node])if(mask&(1<<store.NET.lines[li].c)){
        const info=store.NET.lines[li],wait=isNum(info.w)?info.w:0,fare=isNum(info.f)?info.f:0;
        relax(key(node,li),fareMode?d+fare:d+wait,k,fareMode?time+wait:undefined);
      }
    }else{
      relax(key(node,-1),d,k,fareMode?time:undefined);
      for(const[li,to,step]of store.rideAdj[node])if(li===line)relax(key(to,li),fareMode?d:d+step,k,fareMode?time+step:undefined);
    }
  }
  return{dist,prev,stride,key,start};
}
export function bestTimes(sol){
  const best=new Float64Array(store.NODES.names.length).fill(Infinity);
  for(const[k,d]of sol.dist){const node=Math.floor(k/sol.stride);if(d<best[node])best[node]=d;}
  return best;
}
export function fareTimes(sol){
  const best=new Float64Array(store.NODES.names.length).fill(Infinity);
  for(const[k,d]of sol.dist){const node=Math.floor(k/sol.stride);if(d<best[node])best[node]=d;}
  return best;
}
export function walkTimes(sol){
  const best=new Float64Array(store.NODES.names.length).fill(Infinity);
  for(const[k,d]of sol.dist)if(k%sol.stride===0){const node=Math.floor(k/sol.stride);if(d<best[node])best[node]=d;}
  return best;
}
export function sourceNodeIndices(){
  const modes=store.settings.modes||[],rail=modes.includes('rail'),bus=modes.includes('bus');
  if(rail&&!bus){const out=[];for(let i=0;i<store.NODES.names.length;i++)if(store.NODES.kind[i]===1||store.NODES.kind[i]===2||store.NODES.kind[i]===3)out.push(i);return out;}
  if(bus&&!rail){const out=[];for(let i=0;i<store.NODES.names.length;i++)if(store.NODES.kind[i]===4)out.push(i);return out;}
  return store.surface;
}
export function nodeCompatible(kind){
  const modes=store.settings.modes||[];
  if(modes.length!==1)return true;
  return modes[0]==='rail'?(kind===1||kind===2||kind===3):kind===4;
}
export function nearestSources(lat,lon,budget,indices,allowFallback=true){
  const near=[];
  for(const idx of indices)near.push([haversine(lat,lon,store.NODES.lat[idx],store.NODES.lon[idx]),idx]);
  near.sort((a,b)=>a[0]-b[0]);
  const within=near.filter(([d])=>d<=ACCESS_RADIUS_M).slice(0,MAX_ACCESS_NODES);
  const use=within.length?within:(allowFallback?near.slice(0,3):[]);
  return use.map(([d,idx])=>({node:idx,minutes:walkMinutes(d)})).filter(s=>s.minutes<=budget);
}
export function sourcesFor(origin,budget){
  if(!origin||!store.NODES)return[];
  const indices=sourceNodeIndices();
  if(origin.kind==='node'&&Number.isInteger(origin.node)&&origin.node>=0&&origin.node<store.NODES.names.length){
    if(nodeCompatible(store.NODES.kind[origin.node]))return[{node:origin.node,minutes:0}];
    if((store.settings.modes||[]).length!==1)return[{node:origin.node,minutes:0}];
    return nearestSources(store.NODES.lat[origin.node],store.NODES.lon[origin.node],budget,indices,false).slice(0,1);
  }
  if(!isNum(origin.lat)||!isNum(origin.lon))return[];
  return nearestSources(origin.lat,origin.lon,budget,indices,true);
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
export function walkLegText(leg){return t('route.walkLeg',{time:minuteText(leg.minutes)}).replace(/\s+/g,' ').trim();}
export function rideLegText(leg){
  const stops=tp('route.stopCount',leg.stopCount||0);
  const line=leg.mode==='rail'?(leg.lineName||String(leg.line).replace(/^MTR\s+/i,'')):leg.line;
  return t('route.rideLeg',{mode:t('mode.'+leg.mode),line,from:leg.from,to:leg.to,stops,time:minuteText(leg.minutes)}).replace(/\s+/g,' ').trim();
}
export function legLabel(leg){return leg.mode==='walk'?walkLegText(leg):rideLegText(leg);}
export function reconstructChain(sol,k){
  const chain=[];let cur=k;
  while(cur!==undefined&&cur!==sol.start&&chain.length<4000){chain.push(cur);cur=sol.prev.get(cur);}
  return chain.reverse();
}
export function describe(sol,origin,target,metric='time',walkMinutes=WALK_TOLERANCE_DEFAULT){
  const walkLimit=clamp(walkMinutes,0,WALK_TOLERANCE_MAX,WALK_TOLERANCE_DEFAULT),candidates=[];
  for(let l=-1;l<store.NET.lines.length;l++){
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
      const node=Math.floor(st/sol.stride),line=(st%sol.stride)-1;
      const pst=i===0?sol.start:chain[i-1];
      const priorDistance=pst===sol.start?0:(sol.dist.get(pst)??0);
      const stepT=(sol.dist.get(st)??0)-priorDistance;
      const coord=[store.NODES.lat[node],store.NODES.lon[node]],rawName=store.NODES.names[node];
      if(line<0){
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
          // The first ride-state stepT already contains the boarding wait from
          // solve() (dist(line state) - dist(walk state) = line.w), so do not add it again.
          current={mode,line:label,lineName:info.n||info.l,minutes:stepT,coords:[coord,coord],from:name,to:name,fromNode:node,toNode:node,stopCount:0};
        }else{
          current.minutes+=stepT;
          const fromNode=pst===sol.start?null:Math.floor(pst/sol.stride);
          const edgeIndex=fromNode===null?undefined:store.rideAdj[fromNode].find(([id,to])=>id===line&&to===node)?.[3];
          const seg=edgeIndex===undefined?null:store.NET.lines[line].g?.[edgeIndex];
          const start=fromNode===null?null:[store.NODES.lat[fromNode],store.NODES.lon[fromNode]];
          const same=(point,target)=>Array.isArray(point)&&point.length>=2&&target&&
            Math.abs(point[0]-target[0])<1e-4&&Math.abs(point[1]-target[1])<1e-4;
          if(Array.isArray(seg)&&seg.length>1&&start){
            let points=seg;
            if(!same(points[0],start)&&same(points[points.length-1],start))points=[...points].reverse();
            if(same(points[0],start)&&same(points[points.length-1],coord))current.coords.push(...points.slice(1));
            else current.coords.push(coord);
          }else current.coords.push(coord);
          current.to=name;current.toNode=node;current.stopCount++;
        }
      }
      lastCoord=coord;
    });
    close();
    const fares=routeFares({legs});
    candidates.push({d,line:l,legs,fares,total:fares.total});
  }
  if(!candidates.length)return{text:t('route.unreachable'),legs:[],path:[[origin.lat,origin.lon]],fares:{rail:0,bus:0,total:0}};
  const walk=candidates.find(c=>c.line===-1&&c.d<=walkLimit);
  if(!walk)candidates.sort((a,b)=>metric==='fare'?a.total-b.total||a.d-b.d:a.d-b.d||a.total-b.total);
  const best=walk||candidates[0],legs=best.legs;
  const text=legs.map(leg=>leg.text).join(' -> ')||t('route.already');
  const path=dedupePath(legs.flatMap(leg=>leg.coords));
  return{text,legs,path,fares:best.fares};
}
export function buildCells(grids,tolerance,budget,metric='time',fareGrids=null){
  const cells=new Map(),useFare=metric==='fare'&&!!fareGrids;
  for(const idx of store.surface){
    const times=grids.map(g=>g[idx]);
    if(times.some(v=>!isFinite(v)))continue;
    // Time grids always decide whether a node is reachable within the budget.
    if(Math.max(...times)>budget)continue;
    const fares=fareGrids?fareGrids.map(g=>g[idx]):null;
    if(useFare&&fares.some(v=>!isFinite(v)))continue;
    const values=useFare?fares:times;
    const fastest=Math.min(...values),slowest=Math.max(...values),gap=slowest-fastest,station=store.NODES.kind[idx]===1;
    const overBand=station?gap>Math.max(fastest*tolerance,8):slowest>Math.max(fastest,5)*(1+tolerance);
    if(overBand)continue;
    const cy=Math.floor(store.NODES.lat[idx]/CELL_SIZE),cx=Math.floor(store.NODES.lon[idx]/CELL_SIZE),cellKey=`${cy},${cx}`;
    const score=slowest+gap,priority=nodePriority(store.NODES.kind[idx]);
    let cell=cells.get(cellKey);
    if(!cell){cells.set(cellKey,{key:cellKey,cy,cx,node:idx,label:store.NODES.names[idx],priority,keyCat:catKey(priority),times,fares,fastest,slowest,gap,score});continue;}
    if(priority<cell.priority){cell.label=store.NODES.names[idx];cell.priority=priority;cell.keyCat=catKey(priority);}
    if(score<cell.score||score===cell.score&&gap<cell.gap){cell.node=idx;cell.times=times;cell.fares=fares;cell.fastest=fastest;cell.slowest=slowest;cell.gap=gap;cell.score=score;}
  }
  return[...cells.values()].sort((a,b)=>a.score-b.score||a.gap-b.gap||a.key.localeCompare(b.key));
}
export function cellToResult(cell){
  const lat=store.NODES.lat[cell.node],lon=store.NODES.lon[cell.node],round=v=>Math.round(v*10)/10;
  const fares=cell.fares||cell.times.map(()=>0);
  return{
    key:cell.key,node:cell.node,label:cell.label,catKey:cell.keyCat,district:districtFor(lat,lon),lat,lon,
    cellLat:cell.cy*CELL_SIZE+CELL_SIZE/2,cellLon:cell.cx*CELL_SIZE+CELL_SIZE/2,
    times:cell.times.map(round),fares:fares.map(v=>isFinite(v)?round(v):0),
    fastest:round(cell.fastest),slowest:round(cell.slowest),gap:round(cell.gap),score:round(cell.score),
    fit:cellPreference(cell),vector:cellVector(cell),count:cellCount(cell),
  };
}
