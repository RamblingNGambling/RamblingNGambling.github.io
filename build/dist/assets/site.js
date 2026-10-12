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

window.PT={$,moving,rise,EASE,countUp,onReveal:h=>hooks.push(h)};
})();
