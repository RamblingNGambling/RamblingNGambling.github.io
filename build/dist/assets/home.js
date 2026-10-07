/* Home: equity curve, play log with filters, breakdown, hero count-up.
   Data is inlined by the build in #pt-data; nothing is fetched. */
(function(){
'use strict';
const {$,moving,rise,EASE,countUp}=window.PT;

/* ---------- data ---------- */
const DATA=JSON.parse(document.getElementById("pt-data").textContent);
// [key, date, sport, market, play, game, odds, units, result W/L/P, units P/L, post url], newest first
const PLAYS=DATA.plays;
// Cumulative units at the close of each day with settled plays: [date, running total]
const SERIES=DATA.series;
// Last 20 settled results, oldest first
const FORM=DATA.form;
// [name, plays, won, lost, push, units, risked]
const BREAK=DATA.brk;

/* ---------- helpers ---------- */
const MO=["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const MINUS="−";
const DAY=864e5;
const esc=s=>String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const signed=(v,d=2)=>{const a=Math.abs(v).toFixed(d);return +a===0?(0).toFixed(d):(v>0?"+":MINUS)+a};
const cls=v=>v>0.004?"pos":v<-0.004?"neg":"zero-v";
const uHTML=v=>`<span class="${cls(v)}">${signed(v)}<span class="u">u</span></span>`;
const odds=o=>o>0?"+"+o:MINUS+Math.abs(o);
const dshort=s=>{const[,m,d]=s.split("-");return MO[+m-1]+" "+d};
const dlong=s=>{const[y,m,d]=s.split("-");return MO[+m-1]+" "+(+d)+", "+y};
const RES={W:"Won",L:"Lost",P:"Push"};
const tile=r=>`<span class="t ${r.toLowerCase()}" aria-hidden="true">${r}</span>`;
const XSVG='<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M18.24 2.25h3.31l-7.23 8.26 8.5 11.24h-6.65l-5.21-6.82-5.97 6.82H1.68l7.73-8.84L1.25 2.25h6.83l4.71 6.23zm-1.16 17.52h1.83L7.08 4.13H5.12z"/></svg>';

/* ---------- form strip ---------- */
(function(){
  const el=$("#pips");if(!el)return;
  el.innerHTML=[...FORM].map(r=>tile(r)).join("");
  const w=[...FORM].filter(r=>r==="W").length,l=[...FORM].filter(r=>r==="L").length,p=FORM.length-w-l;
  el.setAttribute("aria-label",`Last ${FORM.length} results, oldest first: ${w} won, ${l} lost, ${p} push. Sequence ${[...FORM].join(" ")}`);
})();

/* ---------- chart ---------- */
// Single series, so no legend: the title names it. Text uses ink tokens; only the line wears the accent.
const host=$("#chart"),tip=$("#tip");
let range=0,pts=[],geo=null,hi=-1;
const ALL=SERIES.map((d,i)=>({date:d[0],t:Date.parse(d[0]+"T12:00:00Z"),v:d[1],day:i?d[1]-SERIES[i-1][1]:d[1]}));

function niceStep(span,n){const raw=span/n,m=Math.pow(10,Math.floor(Math.log10(raw)));return [1,2,2.5,5,10].map(x=>x*m).find(s=>s>=raw)}
function drawChart(){
  if(!ALL.length){host.innerHTML='<p class="sample">No settled plays yet. The line starts with the first one.</p>';return}
  const W=host.clientWidth;if(!W)return;
  const H=W<520?200:250,P={l:40,r:14,t:18,b:26};
  const last=ALL[ALL.length-1];
  let base=0,start;
  if(range){
    start=last.t-range*DAY;
    // the window opens at the close of the day 30 days back; that close is the zero line
    const before=ALL.filter(p=>p.t<=start);base=before.length?before[before.length-1].v:0;
    pts=ALL.filter(p=>p.t>start);
  }else{pts=ALL.slice();start=ALL[0].t-DAY}
  // plotted value is the change within the window; ALL starts from zero anyway
  const ys=pts.map(p=>p.v-base);
  const lo=Math.min(0,...ys),hiV=Math.max(0,...ys);
  const step=niceStep(Math.max(hiV-lo,1),4),y0=Math.floor(lo/step)*step,y1=Math.ceil(hiV/step)*step;
  const x=t=>P.l+(t-start)/(last.t-start)*(W-P.l-P.r);
  const y=v=>P.t+(y1-v)/(y1-y0)*(H-P.t-P.b);
  const fmtTick=v=>v===0?"0":(v>0?"+":MINUS)+Math.abs(v);

  let g="";
  for(let v=y0;v<=y1+1e-9;v+=step){
    const yy=y(v).toFixed(1);
    g+=`<line class="${Math.abs(v)<1e-9?"zero":"grid"}" x1="${P.l}" x2="${W-P.r}" y1="${yy}" y2="${yy}"/>`;
    g+=`<text class="ax" x="${P.l-8}" y="${(+yy+3.5).toFixed(1)}" text-anchor="end">${fmtTick(+v.toFixed(2))}</text>`;
  }
  // x ticks: month starts for the full run, weekly steps back from the last day for 30 days
  let xt=[];
  if(range){for(let t=last.t;t>start+2*DAY;t-=7*DAY)xt.push(t)}
  else{const d0=new Date(start);for(let m=d0.getUTCMonth()+1;;m++){const t=Date.UTC(d0.getUTCFullYear(),m,1,12);if(t>last.t)break;xt.push(t)}}
  xt.forEach(t=>{
    const d=new Date(t),lab=range?MO[d.getUTCMonth()]+" "+d.getUTCDate():MO[d.getUTCMonth()];
    g+=`<text class="ax" x="${x(t).toFixed(1)}" y="${H-6}" text-anchor="middle">${lab}</text>`;
  });

  const seq=[{t:start,v:0}].concat(pts.map((p,i)=>({t:p.t,v:ys[i]})));
  const line=seq.map((p,i)=>(i?"L":"M")+x(p.t).toFixed(1)+" "+y(p.v).toFixed(1)).join("");
  const zy=y(0).toFixed(1),xEnd=x(last.t).toFixed(1);
  const area=line+`L${xEnd} ${zy}L${x(start).toFixed(1)} ${zy}Z`;
  const ex=x(last.t),ey=y(ys[ys.length-1]);

  host.querySelector("svg")&&host.querySelector("svg").remove();
  const svgNS="http://www.w3.org/2000/svg";
  const svg=document.createElementNS(svgNS,"svg");
  svg.setAttribute("viewBox",`0 0 ${W} ${H}`);svg.setAttribute("height",H);
  svg.setAttribute("tabindex","0");svg.setAttribute("role","img");
  const lowP=pts.reduce((a,b)=>b.v<a.v?b:a);
  svg.setAttribute("aria-label",range
    ?`Units over the last 30 days: ${signed(last.v-base)}u, running total ${signed(last.v)}u on ${dlong(last.date)}. Use arrow keys to step through days.`
    :`Cumulative units by day from ${dlong(pts[0].date)} to ${dlong(last.date)}, ending at ${signed(last.v)}u. Low ${signed(lowP.v)}u on ${dlong(lowP.date)}. Use arrow keys to step through days.`);
  // Fill above zero in the accent wash (the winning side), below zero in the loss wash.
  svg.innerHTML=`<defs>
      <linearGradient id="gpos" x1="0" y1="0" x2="0" y2="1"><stop offset="0" style="stop-color:var(--acc);stop-opacity:.24"/><stop offset="1" style="stop-color:var(--acc);stop-opacity:0"/></linearGradient>
      <clipPath id="cpos"><rect x="0" y="0" width="${W}" height="${zy}"/></clipPath>
      <clipPath id="cneg"><rect x="0" y="${zy}" width="${W}" height="${H}"/></clipPath>
    </defs>${g}
    <path class="area" d="${area}" fill="url(#gpos)" clip-path="url(#cpos)"/>
    <path class="area" d="${area}" style="fill:var(--down-wash)" clip-path="url(#cneg)"/>
    <path class="ln" d="${line}"/>
    <g id="hov" style="display:none"><line class="xh" x1="0" x2="0" y1="${P.t}" y2="${H-P.b}"/>
      <g class="mk"><circle class="halo" r="10"/><circle r="4.5" style="fill:var(--acc);stroke:var(--s1)" stroke-width="2"/></g></g>
    <circle class="end" cx="${ex}" cy="${ey}" r="4.5" style="fill:var(--acc);stroke:var(--s1)" stroke-width="2"/>
    <text class="endlab" x="${ex-10}" y="${ey-12}" text-anchor="end">${signed(range?last.v-base:last.v)}u</text>
    <rect id="hit" x="${P.l}" y="0" width="${W-P.l-P.r}" height="${H}" fill="transparent"/>`;
  host.insertBefore(svg,tip);
  geo={x,y,ys,W,H,base,svg,hov:svg.querySelector("#hov"),xh:svg.querySelector(".xh"),mk:svg.querySelector(".mk")};

  $("#delta").textContent=range?`${signed(last.v-base)}u over 30 days`:`since ${dshort(ALL[0].date)}`;

  const hit=svg.querySelector("#hit");
  const nearest=cx=>{let b=0,bd=1e9;pts.forEach((p,i)=>{const d=Math.abs(x(p.t)-cx);if(d<bd){bd=d;b=i}});return b};
  const local=e=>{const r=svg.getBoundingClientRect();return (e.clientX-r.left)*(W/r.width)};
  hit.addEventListener("pointermove",e=>show(nearest(local(e))));
  hit.addEventListener("pointerdown",e=>show(nearest(local(e))));
  svg.addEventListener("pointerleave",hide);
  svg.addEventListener("focus",()=>show(hi>=0&&hi<pts.length?hi:pts.length-1));
  svg.addEventListener("blur",hide);
  svg.addEventListener("keydown",e=>{
    let i=hi<0?pts.length-1:hi;
    if(e.key==="ArrowLeft")i--;else if(e.key==="ArrowRight")i++;
    else if(e.key==="Home")i=0;else if(e.key==="End")i=pts.length-1;
    else if(e.key==="Escape"){hide();return}else return;
    e.preventDefault();show(Math.max(0,Math.min(pts.length-1,i)));
  });
}
// The marker glides between days along the line itself: it eases through a
// fractional index and is placed on the segment between two days, so a long
// jump traces the curve rather than cutting across it. Tooltip text snaps to
// the target day; only its position eases. Measurements happen once per day
// change, never inside the animation frame.
let cur=-1,glideRaf=0,glideT=0,tipW=0,tipH=0,tipS=1,tipBox=0;
function place(fi){
  const i0=Math.floor(fi),i1=Math.min(pts.length-1,i0+1),f=fi-i0;
  const xa=geo.x(pts[i0].t),ya=geo.y(geo.ys[i0]);
  const cx=xa+(geo.x(pts[i1].t)-xa)*f,cy=ya+(geo.y(geo.ys[i1])-ya)*f;
  geo.xh.setAttribute("transform",`translate(${cx.toFixed(2)} 0)`);
  geo.mk.setAttribute("transform",`translate(${cx.toFixed(2)} ${cy.toFixed(2)})`);
  let left=cx*tipS+14;if(left+tipW>tipBox)left=cx*tipS-tipW-14;
  tip.style.transform=`translate(${Math.max(0,left).toFixed(1)}px,${Math.max(0,cy*tipS-tipH-12).toFixed(1)}px)`;
}
function glide(now){
  // rAF time can trail the performance.now() taken in show(); clamp so dt is never negative
  const dt=Math.max(0,Math.min(64,now-glideT));glideT=now;
  cur+=(hi-cur)*(1-Math.exp(-dt/70));
  if(Math.abs(hi-cur)<.002)cur=hi;
  cur=Math.max(0,Math.min(pts.length-1,cur));
  place(cur);
  glideRaf=cur===hi?0:requestAnimationFrame(glide);
}
function show(i){
  if(!geo)return;
  const was=tip.classList.contains("on");
  if(i!==hi||!was){
    const p=pts[i];
    tip.innerHTML=`<b>${dlong(p.date)}</b>Running ${uHTML(p.v)}<br><span>That day</span> ${uHTML(p.day)}`;
    tip.classList.add("on");
    const r=geo.svg.getBoundingClientRect();
    tipS=r.width/geo.W;tipBox=r.width;tipW=tip.offsetWidth;tipH=tip.offsetHeight;
  }
  hi=i;geo.hov.style.display="";
  if(!was||cur<0||!moving()){cancelAnimationFrame(glideRaf);glideRaf=0;cur=i;place(i);return}
  if(!glideRaf){glideT=performance.now();glideRaf=requestAnimationFrame(glide)}
}
function hide(){
  tip.classList.remove("on");
  cancelAnimationFrame(glideRaf);glideRaf=0;cur=-1;
  if(geo)geo.hov.style.display="none";
}
// Draw-in: the line is drawn left to right (pathLength=1 keeps the dash maths
// independent of size), the fill fades in behind it, then the end point lands.
function playChart(dur,delay=0){
  if(!geo||!moving())return;
  const s=geo.svg,ln=s.querySelector(".ln");
  ln.setAttribute("pathLength","1");ln.style.strokeDasharray="1 3";
  const a=ln.animate([{strokeDashoffset:"1.02"},{strokeDashoffset:"0"}],{duration:dur,delay,easing:"cubic-bezier(.45,.05,.2,1)",fill:"backwards"});
  a.onfinish=a.oncancel=()=>{ln.style.strokeDasharray="";ln.removeAttribute("pathLength")};
  s.querySelectorAll(".area").forEach(el=>el.animate([{opacity:0},{opacity:1}],{duration:dur*.6,delay:delay+dur*.5,easing:"ease-out",fill:"backwards"}));
  s.querySelector(".end").animate([{opacity:0,transform:"scale(.2)"},{opacity:1,transform:"scale(1.25)",offset:.6},{opacity:1,transform:"none"}],
    {duration:420,delay:delay+dur*.9,easing:"ease-out",fill:"backwards"});
  rise(s.querySelector(".endlab"),{dy:4,dur:360,delay:delay+dur*.95});
}
document.querySelectorAll(".chartp .seg button").forEach(b=>b.addEventListener("click",()=>{
  if(b.getAttribute("aria-pressed")==="true")return;
  range=+b.dataset.r;hi=-1;
  document.querySelectorAll(".chartp .seg button").forEach(o=>o.setAttribute("aria-pressed",o===b));
  hide();drawChart();playChart(750);
}));
// Draw once now so the entrance has a chart to animate; after that, redraw only
// when the width really changes (a no-op redraw would cut the draw-in short).
drawChart();
let rT;new ResizeObserver(()=>{cancelAnimationFrame(rT);rT=requestAnimationFrame(()=>{
  if(geo&&host.clientWidth===geo.W)return;hide();drawChart()})}).observe(host);

/* ---------- breakdown ---------- */
const TITLES={sport:["By sport","Sport"],market:["By market","Market"],month:["By month","Month"]};
function drawBreak(k){
  const rows=BREAK[k],mx=Math.max(...rows.map(r=>Math.abs(r[5])),1e-9);
  $("#brk-t").textContent=TITLES[k][0];$("#brk-col").textContent=TITLES[k][1];
  $("#brk-panel").setAttribute("aria-labelledby","tab-"+k);
  $("#brk-rows").innerHTML=rows.map(([n,c,w,l,p,u,risk])=>{
    const roi=risk>0?u/risk*100:0,thin=c<10,pct=(Math.abs(u)/mx*50).toFixed(2);
    return `<tr><th scope="row">${esc(n)}${thin?' <span class="thin" title="Fewer than 10 plays">†</span>':""}</th>
      <td class="num">${c}</td><td class="num c-wlp">${w}-${l}-${p}</td>
      <td class="c-bar"><div class="dbar" aria-hidden="true"><i class="${u>=0?"p":"n"}" style="width:max(0px,calc(${pct}% - 1px))"></i></div></td>
      <td class="num">${uHTML(u)}</td>
      <td class="num${thin?" thin":""}">${signed(roi,1)}%</td></tr>`;
  }).join("");
}
// Rows settle in, then each bar grows out of the zero line toward its sign.
function growBars(delay=0){
  if(!moving())return;
  $("#brk-rows").querySelectorAll("tr").forEach((tr,i)=>{
    rise(tr,{dy:4,dur:260,delay:delay+i*35});
    tr.querySelector(".dbar i").animate([{transform:"scaleX(0)"},{transform:"none"}],{duration:560,delay:delay+80+i*45,easing:EASE,fill:"backwards"});
  });
}
const tabs=[...document.querySelectorAll("#brk-tabs [role=tab]")];
function selectTab(t){
  const same=t.getAttribute("aria-selected")==="true";
  tabs.forEach(o=>{const on=o===t;o.setAttribute("aria-selected",on);o.tabIndex=on?0:-1});
  if(same)return;
  drawBreak(t.dataset.k);growBars();
}
tabs.forEach((t,i)=>{
  t.addEventListener("click",()=>selectTab(t));
  t.addEventListener("keydown",e=>{
    const d=e.key==="ArrowRight"?1:e.key==="ArrowLeft"?-1:0;if(!d)return;
    e.preventDefault();const n=tabs[(i+d+tabs.length)%tabs.length];n.focus();selectTab(n);
  });
});
drawBreak("sport");

/* ---------- play log ---------- */
// Same filter logic as the prototype: sport AND market AND result, "All"
// passes everything. The full log is paged so the first paint stays short.
const SPORT_ORDER=DATA.sportOrder,MKT_ORDER=DATA.marketOrder;
const F={sport:"All",result:"All",market:"All"};
const PAGE=25;let limit=PAGE;
const rowsEl=$("#rows"),tally=$("#tally"),moreEl=$("#more");
const match=r=>(F.sport==="All"||r[2]===F.sport)&&(F.market==="All"||r[3]===F.market)&&(F.result==="All"||r[8]===F.result);

function buildFilters(){
  const count=(k,v)=>PLAYS.filter(r=>r[k]===v).length;
  const sports=SPORT_ORDER.filter(s=>count(2,s));
  $("#f-sport").innerHTML=[["All",PLAYS.length]].concat(sports.map(s=>[s,count(2,s)]))
    .map(([s,n])=>`<button type="button" data-v="${esc(s)}" aria-pressed="${s===F.sport}">${esc(s)}<span class="n">${n}</span></button>`).join("");
  $("#f-res").innerHTML=[["All","All"],["W","Won"],["L","Lost"],["P","Push"]]
    .map(([v,l])=>`<button type="button" data-v="${v}" aria-pressed="${v===F.result}">${l}</button>`).join("");
  const mk=MKT_ORDER.filter(m=>count(3,m));
  $("#f-mkt").innerHTML=`<option value="All">All markets</option>`+mk.map(m=>`<option value="${esc(m)}">${esc(m)} (${count(3,m)})</option>`).join("");
  $("#f-sport").addEventListener("click",e=>{const b=e.target.closest("button");if(b){F.sport=b.dataset.v;sync()}});
  $("#f-res").addEventListener("click",e=>{const b=e.target.closest("button");if(b){F.result=b.dataset.v;sync()}});
  $("#f-mkt").addEventListener("change",e=>{F.market=e.target.value;sync()});
}
function sync(){
  document.querySelectorAll("#f-sport button").forEach(b=>b.setAttribute("aria-pressed",b.dataset.v===F.sport));
  document.querySelectorAll("#f-res button").forEach(b=>b.setAttribute("aria-pressed",b.dataset.v===F.result));
  $("#f-mkt").value=F.market;
  limit=PAGE;
  renderLog(true);
}
// Filter changes animate FLIP-style: rows that stay slide from where they were
// to where they are now, rows that arrive rise in with a short stagger. Every
// position is read in one pass before any animation is written. Only rows on
// screen are animated; the rest would move unseen.
function renderLog(anim){
  anim=anim&&moving();
  const was=new Map(),vh=innerHeight;
  if(anim)rowsEl.querySelectorAll("tr[data-k]").forEach(tr=>{const r=tr.getBoundingClientRect();if(r.bottom>-40&&r.top<vh+40)was.set(tr.dataset.k,r.top)});
  drawLog();
  if(!anim)return;
  const trs=[...rowsEl.children],now=trs.map(tr=>tr.getBoundingClientRect().top);
  let n=0;
  trs.forEach((tr,i)=>{
    if(now[i]>vh+40||now[i]<-400)return;
    const k=tr.dataset.k;
    if(k!=null&&was.has(k)){
      const dy=was.get(k)-now[i];
      if(Math.abs(dy)>.5)tr.animate([{transform:`translateY(${dy}px)`},{transform:"none"}],{duration:380,easing:EASE});
    }else rise(tr,{dy:8,dur:300,delay:Math.min(n++,10)*28});
  });
  tally.querySelectorAll("b").forEach(b=>rise(b,{dy:3,dur:240}));
}
function drawLog(){
  try{
    if(!Array.isArray(PLAYS))throw new Error("bad data");
    if(!PLAYS.length){
      rowsEl.innerHTML=`<tr class="state"><td colspan="9"><b>Nothing posted yet</b>The first play shows up here as soon as it is posted on X.</td></tr>`;
      tally.innerHTML="<span>0 plays</span>";moreEl.hidden=true;return;
    }
    const list=PLAYS.filter(match);
    const active=F.sport!=="All"||F.market!=="All"||F.result!=="All";
    const w=list.filter(r=>r[8]==="W").length,l=list.filter(r=>r[8]==="L").length,p=list.filter(r=>r[8]==="P").length;
    const net=list.reduce((a,r)=>a+r[9],0);
    tally.innerHTML=`<span><b data-n="${list.length}">${list.length}</b> of ${PLAYS.length} plays</span><span><b>${w}-${l}-${p}</b></span>`+
      `<span>Net <b>${uHTML(net)}</b></span>`+
      `<button type="button" class="clear" id="clear"${active?"":" hidden"}>Clear filters</button>`;
    $("#clear").addEventListener("click",clearF);
    if(!list.length){
      rowsEl.innerHTML=`<tr class="state"><td colspan="9"><b>No plays match</b>Nothing in the log fits that combination of filters.<br><button type="button" id="clear2">Clear filters</button></td></tr>`;
      $("#clear2").addEventListener("click",clearF);moreEl.hidden=true;return;
    }
    const shown=list.slice(0,limit);
    rowsEl.innerHTML=shown.map(r=>{
      const [k,date,sport,mkt,play,game,o,u,res,pl,post]=r;
      const link=post
        ?`<a class="xl" href="${esc(post)}" target="_blank" rel="noopener noreferrer" aria-label="Original post on X: ${esc(play)}">${XSVG}</a>`
        :`<span class="nolink" title="No post link on file">–<span class="sr">No post link on file</span></span>`;
      return `<tr data-k="${k}">
        <td class="c-date">${dshort(date)}</td>
        <td class="c-play">${esc(play)}${game?`<span class="g">${esc(game)}</span>`:""}</td>
        <td class="c-sport"><span class="tag">${esc(sport)}</span></td>
        <td class="c-mkt">${esc(mkt)}</td>
        <td class="c-odds num">${odds(o)}</td>
        <td class="c-stake num"><span class="mo">risk </span>${(+u).toFixed(2)}u</td>
        <td class="c-res"><span class="res">${RES[res]?tile(res):""}<span class="w-txt">${RES[res]||esc(res)}</span></span></td>
        <td class="c-pl num">${uHTML(pl)}</td>
        <td class="c-post">${link}</td></tr>`;
    }).join("");
    const left=list.length-shown.length;
    moreEl.hidden=false;
    moreEl.innerHTML=`<span class="sp">Showing <b>${shown.length}</b> of ${list.length}</span>`+
      (left?`<button type="button" class="ghost" id="more-n">Show ${Math.min(50,left)} more</button>`+
            (left>50?`<button type="button" class="ghost" id="more-all">Show all ${list.length}</button>`:""):"");
    const mn=$("#more-n"),ma=$("#more-all");
    if(mn)mn.addEventListener("click",()=>{limit+=50;renderLog(true)});
    if(ma)ma.addEventListener("click",()=>{limit=Infinity;renderLog(true)});
  }catch(err){
    rowsEl.innerHTML=`<tr class="state"><td colspan="9"><b>The log did not load</b>The record is still published as a plain data file.<br><a class="btn" href="plays.json">Open plays.json</a></td></tr>`;
    tally.innerHTML="<span>Log unavailable</span>";moreEl.hidden=true;
  }
}
function clearF(){F.sport="All";F.market="All";F.result="All";sync();$("#f-sport button").focus()}
buildFilters();renderLog();

/* ---------- entrances ---------- */
function countHero(delay){
  // Hold the final width while counting so the column beside it never shifts.
  const big=$(".big"),ci=$("#cu-i"),cd=$("#cu-d"),to=Math.abs(+big.dataset.to);
  big.style.minWidth=big.getBoundingClientRect().width+"px";
  countUp(1200,delay,p=>{const s=(to*p).toFixed(2).split(".");ci.textContent=s[0];cd.textContent=s[1]},()=>{big.style.minWidth=""});
}
PT.onReveal((el,d)=>{
  if(el.classList.contains("big"))countHero(d);
  if(el.classList.contains("chartp")){
    playChart(1300,d+120);
    [...$("#pips").children].forEach((t,i)=>rise(t,{dy:5,dur:320,delay:d+300+i*30}));
  }
  if(el.classList.contains("bpanel"))growBars(d+120);
});
})();
