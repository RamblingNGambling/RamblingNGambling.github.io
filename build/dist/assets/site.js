/* Shared runtime for every page: theme, entrance reveals, count-ups and the
   motion helpers the page scripts use. Exposed as window.PT. */
(function(){
'use strict';
const root=document.documentElement;
const $=s=>document.querySelector(s);

/* Motion is checked at the moment of use, so a reader who turns on reduced
   motion mid-visit gets it at once. WAAPI ignores the CSS override, hence this. */
const RM=matchMedia("(prefers-reduced-motion: reduce)");
const moving=()=>!RM.matches&&!!Element.prototype.animate;
const EASE="cubic-bezier(.22,1,.36,1)";
const rise=(el,o)=>el.animate([{opacity:0,transform:"translateY("+(o.dy||6)+"px)"},{opacity:1,transform:"none"}],
  {duration:o.dur||320,delay:o.delay||0,easing:EASE,fill:"backwards"});

/* ---------- theme ---------- */
const mq=matchMedia("(prefers-color-scheme: light)");
const ICONS={
  auto:'<circle cx="12" cy="12" r="8.5"/><path d="M12 3.5a8.5 8.5 0 0 1 0 17z" fill="currentColor" stroke="none"/>',
  dark:'<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/>',
  light:'<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M4.6 4.6l1.4 1.4M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4L6 18M18 6l1.4-1.4"/>'
};
function applyTheme(){
  const p=root.dataset.pref||"auto";
  const dark=p==="dark"||(p==="auto"&&!mq.matches);
  root.dataset.theme=dark?"dark":"light";root.style.colorScheme=dark?"dark":"light";
  const ic=$("#th-ic"),lab=$("#th-lab"),btn=$("#theme");
  if(ic)ic.innerHTML=ICONS[p];
  if(lab)lab.textContent=p[0].toUpperCase()+p.slice(1);
  if(btn)btn.setAttribute("aria-label",`Theme: ${p}${p==="auto"?" (following the device, now "+(dark?"dark":"light")+")":""}. Change theme`);
}
// Cross-fade the whole page between themes: a View Transition where the
// browser has one (two composited snapshots, no per-element repaint), a short
// colour transition where it does not, and an instant swap for reduced motion.
function fadeTheme(change){
  if(!moving())return change();
  if(document.startViewTransition)return document.startViewTransition(change);
  root.classList.add("theming");change();
  clearTimeout(fadeTheme.t);fadeTheme.t=setTimeout(()=>root.classList.remove("theming"),360);
}
const tbtn=$("#theme");
if(tbtn)tbtn.addEventListener("click",()=>{
  const order=["auto","dark","light"];
  const next=order[(order.indexOf(root.dataset.pref||"auto")+1)%3];
  try{localStorage.setItem("pt-theme",next)}catch(e){}
  fadeTheme(()=>{
    root.dataset.pref=next;applyTheme();
    // composite:add layers the spin on top of the hover tilt, so it lands there without a snap
    if(moving())$("#th-ic").animate([{transform:"rotate(-90deg) scale(.6)",opacity:0},{transform:"rotate(0deg) scale(1)",opacity:1}],{duration:420,easing:EASE,composite:"add"});
  });
});
const onScheme=()=>fadeTheme(applyTheme);
mq.addEventListener?mq.addEventListener("change",onScheme):mq.addListener(onScheme);
applyTheme();

/* ---------- count-up ---------- */
// Count from zero with a quartic ease-out. The final text is in the markup, so
// without JS or with reduced motion the real figures are simply there.
function countUp(dur,delay,draw,done){
  const t0=performance.now()+delay;
  draw(0);
  const f=now=>{const k=Math.max(0,Math.min(1,(now-t0)/dur));draw(1-Math.pow(1-k,4));if(k<1)requestAnimationFrame(f);else if(done)done()};
  requestAnimationFrame(f);
}

/* ---------- entrances ---------- */
// Page scripts register hooks; each runs when an element is revealed, with
// the stagger delay that element got.
const hooks=[];
function onReveal(el,d){
  if(!moving())return;
  el.querySelectorAll("[data-cu]").forEach(n=>{
    const to=+n.dataset.cu,dp=+n.dataset.dp||0;
    countUp(1200,d,p=>{n.textContent=(to*p).toFixed(dp)});
  });
  hooks.forEach(h=>h(el,d));
}
// Sections rise 14px and fade in as they enter; whatever enters together is
// staggered by 70ms in reading order. Once done, the hooks are removed so the
// elements are back to plain, untransformed layout. IntersectionObserver
// delivers asynchronously, so hooks registered by later scripts are in place.
(function(){
  if(!root.classList.contains("motion"))return;
  const io=new IntersectionObserver(es=>{
    es.filter(e=>e.isIntersecting).map(e=>e.target)
      .sort((a,b)=>a.compareDocumentPosition(b)&Node.DOCUMENT_POSITION_FOLLOWING?-1:1)
      .forEach((el,i)=>{
        io.unobserve(el);
        const d=Math.min(i,6)*70;
        el.style.transitionDelay=d+"ms";el.classList.add("in");
        onReveal(el,d);
        setTimeout(()=>{el.removeAttribute("data-rv");el.classList.remove("in");el.style.transitionDelay=""},d+760);
      });
  },{rootMargin:"0px 0px -8% 0px"});
  document.querySelectorAll("[data-rv]").forEach(el=>io.observe(el));
})();

/* ---------- footer record strip ---------- */
(function(){
  const strip=$(".rstrip");if(!strip)return;
  hooks.push((el,d)=>{
    if(el!==strip)return;
    strip.querySelectorAll(".pips .t").forEach((t,i)=>rise(t,{dy:5,dur:320,delay:d+200+i*30}));
  });
})();

/* ---------- tool scenes ---------- */
// The looping pictures on the home tiles (and tool-page headers). The CSS draws
// the finished picture; here each scene is armed, then runs only while it is on
// screen, and its first view starts at 1280ms, where the rebuild begins. With no
// observer, reduced motion or an unpainted tab nothing here fires and the still stays.
(function(){
  const scenes=[...document.querySelectorAll(".tsc")];
  if(!scenes.length||!root.classList.contains("deco")||!("IntersectionObserver" in window))return;
  const seen=new WeakSet();
  const io=new IntersectionObserver(es=>es.forEach(e=>{
    const el=e.target;
    el.classList.toggle("run",e.isIntersecting);
    if(e.isIntersecting&&!seen.has(el)){
      seen.add(el);
      if(el.getAnimations)el.getAnimations({subtree:true}).forEach(a=>{a.currentTime=1280});
    }
  }),{threshold:.3});
  scenes.forEach(el=>{el.classList.add("armed");io.observe(el)});
})();

/* ---------- ?diag: a small report box, to find out why decoration does not run on one device ---------- */
// Open any page with ?diag at the end of the address. It shows what the page sees and, every
// two seconds, whether the pictures are really moving. Scroll to the Tools tiles to test a
// scene. It changes nothing else.
if(/[?&]diag(=|&|$)/.test(location.search)){
  const box=document.createElement("pre");
  box.setAttribute("aria-hidden","true");
  box.style.cssText="position:fixed;left:8px;right:8px;bottom:8px;z-index:2147483647;margin:0;padding:10px;max-height:48vh;overflow:auto;background:#000;color:#8f8;font:11px/1.4 ui-monospace,Menlo,monospace;border:1px solid #3a3;border-radius:8px;white-space:pre-wrap;word-break:break-word;pointer-events:none";
  document.body.appendChild(box);
  const q=sel=>Array.prototype.slice.call(document.querySelectorAll(sel));
  const clockOf=()=>{
    const on=q(".tsc.run")[0],s=on||q(".tsc")[0];
    if(!s||!s.getAnimations)return null;
    const a=s.getAnimations({subtree:true})[0];
    return a?{t:Math.round(a.currentTime),state:a.playState,seen:!!on}:null;
  };
  const drawsOf=()=>{try{return window.PTArt&&PTArt.arts.length?PTArt.arts[0].draws:null}catch(e){return null}};
  let prev=null;
  const report=()=>{
    const cl=root.classList,sc=q(".tsc"),now={a:clockOf(),d:drawsOf()};
    let art="none";
    try{if(window.PTArt&&PTArt.arts.length){const a=PTArt.arts[0];art=a.key+" "+a.w+"x"+a.h+" visible "+a.vis+" draws "+a.draws}}catch(e){}
    const out=["PUBLIC TRACKER DIAG (updates every 2 s)",
      "ua: "+navigator.userAgent,
      "screen: "+innerWidth+"x"+innerHeight+" dpr "+devicePixelRatio,
      "html.motion: "+cl.contains("motion")+"   html.deco: "+cl.contains("deco"),
      "reduce motion: "+matchMedia("(prefers-reduced-motion: reduce)").matches,
      "IntersectionObserver: "+("IntersectionObserver" in window)+"  getAnimations: "+(!!Element.prototype.getAnimations)+"  animate: "+(!!Element.prototype.animate),
      "scenes: "+sc.length+"  armed "+sc.filter(e=>e.classList.contains("armed")).length+"  running "+sc.filter(e=>e.classList.contains("run")).length,
      "art: "+art,
      "errors: "+((window.__errs&&window.__errs.length)?"\n  "+window.__errs.join("\n  "):"none")];
    if(prev){
      const a0=prev.a,a1=now.a;
      out.push("scene clock: "+(!a1?"no scene found":!a1.seen?"no scene on screen yet (scroll to the Tools tiles)":(a0&&a0.t!==a1.t?"MOVING":"NOT MOVING")+" "+JSON.stringify(a0)+" -> "+JSON.stringify(a1)));
      out.push("art draws: "+prev.d+" -> "+now.d+(prev.d===null||now.d===null?"  (no art on this page)":now.d>prev.d?"  MOVING":"  NOT MOVING (still frame, or off screen)"));
    }else out.push("measuring...");
    prev=now;
    box.textContent=out.join("\n");
  };
  setTimeout(()=>{report();setInterval(report,2000)},800);
}

window.PT={$,moving,rise,EASE,countUp,onReveal:h=>hooks.push(h)};
})();
