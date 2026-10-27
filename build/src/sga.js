/* SGA 20+ page: the ladder chart and the slip viewer.
   The ladder is drawn here, from the game list inlined in the page, in the width it is
   shown at, so its type stays readable on a phone and it is redrawn on resize. The table,
   the figures and the slip thumbnails are plain HTML written by the build, so without this
   script the page still reads in full and a thumbnail is a link to the picture. */
(function(){
'use strict';
const $=s=>document.querySelector(s);
try{localStorage.setItem("pt-sga-seen","1")}catch(e){}   // seen: the tab that points here has done its job
const NS="http://www.w3.org/2000/svg";
const svg=(t,a)=>{const e=document.createElementNS(NS,t);for(const k in a)e.setAttribute(k,a[k]);return e};
const sx=x=>(x>=100?x.toFixed(0):x>=10?x.toFixed(1):x.toFixed(2))+"x";

/* ---------- the ladder ---------- */
const box=$("#sg-ladder"),dataEl=$("#sg-data");
let D=null;
try{D=dataEl?JSON.parse(dataEl.textContent):null}catch(e){D=null}
let drawnW=0;
function ladder(){
  if(!box||!D||!D.g||!D.g.length)return;
  const w=box.clientWidth;if(!w)return;
  const W=Math.max(300,Math.min(1100,Math.round(w)));
  if(Math.abs(W-drawnW)<6)return;
  drawnW=W;
  const g=D.g.slice(-40),n=g.length,H=(n<=3?-40:0)+(W<520?230:270),L=6,R=6,T=26,B=30,iw=W-L-R,ih=H-T-B;
  const peak=Math.max(D.peak||1,1),ymax=peak*1.14,big=peak>8,lg=Math.log(ymax);
  // Compounding is exponential: past about 8x a straight scale flattens every early bar,
  // so the height is then the log of the roll, from the first stake, and the chart says so.
  const Y=v=>T+ih*(1-(big?Math.log(Math.max(v,1))/lg:v/ymax));
  const gap=n>24?3:n>12?5:8,bw=Math.min(64,(iw-gap*(n-1))/n),x0=L+(iw-(bw*n+gap*(n-1)))/2;
  const every=n>14?n:Math.max(1,Math.ceil(40/(bw+gap)));
  const s=svg("svg",{viewBox:`0 0 ${W} ${H}`,role:"img","aria-label":D.label||"Bar chart of the roll going into each game"});
  s.appendChild(svg("line",{x1:L,x2:W-R,y1:Y(0).toFixed(1),y2:Y(0).toFixed(1),"class":"grid"}));
  s.appendChild(svg("line",{x1:L,x2:W-R,y1:Y(1).toFixed(1),y2:Y(1).toFixed(1),"class":"zero"}));
  if(big){const t=svg("text",{x:L,y:12,"class":"ax"});t.textContent="log scale";s.appendChild(t)}
  const first=D.g.length-n;
  g.forEach((r,i)=>{
    const x=x0+i*(bw+gap),top=r.r==="Win"?r.x:r.f,
          c=r.r==="Win"?"w":r.r==="Loss"?"l":r.r==="Void"?"v":"o",
          y=Y(top),h=Math.max(2,Y(0)-y);
    const b=svg("rect",{x:x.toFixed(1),y:y.toFixed(1),width:bw.toFixed(1),height:h.toFixed(1),rx:4,"class":"sb "+c});
    b.style.setProperty("--d",Math.round(i*Math.min(40,600/n))+"ms");
    s.appendChild(b);
    if(i%every===(n-1)%every){
      const t=svg("text",{x:(x+bw/2).toFixed(1),y:(y-6).toFixed(1),"text-anchor":"middle","class":"lab"});
      t.textContent=(r.r==="Loss"?"✕ ":"")+sx(top);s.appendChild(t);
    }
    const num=first+i+1;
    if((n<=14&&bw>=18)||(num%5===0&&n-1-i>=2)||i===n-1){
      const a=svg("text",{x:(x+bw/2).toFixed(1),y:H-10,"text-anchor":"middle","class":"ax"});
      a.textContent=String(num);s.appendChild(a);
    }
  });
  box.replaceChildren(s);
}
ladder();
if("ResizeObserver" in window&&box)new ResizeObserver(ladder).observe(box);
else addEventListener("resize",ladder);

/* ---------- the slip viewer: a tap enlarges, a tap or Esc closes ---------- */
const slips=[...document.querySelectorAll("a.sgpf")];
if(slips.length){
  let lb=null,opener=null;
  const close=()=>{if(!lb)return;lb.remove();lb=null;document.removeEventListener("keydown",onKey);if(opener&&opener.focus)opener.focus()};
  const onKey=e=>{if(e.key==="Escape")close()};
  slips.forEach(a=>a.addEventListener("click",e=>{
    if(e.metaKey||e.ctrlKey||e.shiftKey||e.button)return;     // let a modified click open the file as usual
    e.preventDefault();opener=a;
    lb=document.createElement("div");lb.className="sglb";lb.setAttribute("role","dialog");lb.setAttribute("aria-modal","true");
    lb.setAttribute("aria-label",a.title||"Bet slip");
    const im=document.createElement("img");im.src=a.getAttribute("href");im.alt=a.title||"Bet slip";
    const x=document.createElement("button");x.type="button";x.setAttribute("aria-label","Close");x.innerHTML="&times;";
    lb.append(im,x);lb.addEventListener("click",close);document.body.appendChild(lb);
    document.addEventListener("keydown",onKey);x.focus();
  }));
}

/* ---------- motion: only where the page has opted in (html.motion: no reduced motion, no script error) ---------- */
const motion=document.documentElement.classList.contains("motion")&&"IntersectionObserver" in window;

/* The tagline: each word goes from muted to full ink as it crosses a line 30% up from the bottom of the
   screen, in reading order. Muted words are still 30% ink, never invisible, and a word already scrolled
   past counts as crossed, so a reload halfway down the page does not leave any behind. */
const tag=$("#sg-tagline");
if(motion&&tag){
  const words=[...tag.querySelectorAll(".w")];
  const io=new IntersectionObserver(es=>{
    const up=es.filter(e=>e.isIntersecting||e.boundingClientRect.top<(e.rootBounds?e.rootBounds.top:0))
      .sort((a,b)=>a.boundingClientRect.top-b.boundingClientRect.top||a.boundingClientRect.left-b.boundingClientRect.left);
    up.forEach((e,i)=>{io.unobserve(e.target);e.target.style.transitionDelay=Math.min(i,10)*60+"ms";e.target.classList.add("on")});
  },{rootMargin:"0px 0px -30% 0px"});
  tag.classList.add("armed");
  words.forEach(w=>io.observe(w));
}

/* The three step cards: each visual loops only while its card is on screen, and rests on a still picture
   (the CSS default) when motion is off. */
const steps=[...document.querySelectorAll(".sg-step")];
if(motion&&steps.length){
  const io=new IntersectionObserver(es=>es.forEach(e=>e.target.classList.toggle("run",e.isIntersecting)),{threshold:.3});
  steps.forEach(s=>{s.classList.add("armed");io.observe(s)});
}
})();
