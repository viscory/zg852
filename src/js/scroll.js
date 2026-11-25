// Bottom scroll shadows only appear while a scroll container has more content
// below. The class is shared by the desktop results list and the mobile Plan /
// Results panes, whose scroll containers change with the viewport.
function syncOne(element){
  const overflow=getComputedStyle(element).overflowY;
  const scrollable=overflow==='auto'||overflow==='scroll';
  const canScroll=scrollable&&element.scrollHeight>element.clientHeight+2;
  const atBottom=element.scrollTop+element.clientHeight>=element.scrollHeight-2;
  element.classList.toggle('scroll-bottom',canScroll&&!atBottom);
}

export function syncScrollShadows(){
  document.querySelectorAll('[data-scroll-shadow]').forEach(syncOne);
}

export function initScrollShadows(){
  document.querySelectorAll('[data-scroll-shadow]').forEach(element=>{
    element.addEventListener('scroll',()=>syncOne(element),{passive:true});
    if(typeof ResizeObserver!=='undefined')new ResizeObserver(()=>syncOne(element)).observe(element);
  });
  window.addEventListener('resize',syncScrollShadows);
  requestAnimationFrame(syncScrollShadows);
}
