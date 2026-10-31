// Page-side checks of the play log at 1440px (search, dates, Pending, summary, source links). Run by check-pages.py inside the page.
// Every expectation is worked out here from /plays.json, not from the page.
const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const R=[];const rec=(n,ok,x)=>R.push((ok?'PASS ':'FAIL ')+n+(ok||x===undefined?'':' :: '+JSON.stringify(x)));
const raw=(await (await fetch('/plays.json')).json()).plays;
// independent expectations, straight from plays.json (result words, not the page's one-letter codes)
const isSettledW=p=>p.result==='Win'||p.result==='Loss'||p.result==='Push';
const expect=(list)=>{const s={n:list.length,w:0,l:0,p:0,open:0,net:0,risk:0};
  for(const p of list){ if(p.result==='Win')s.w++; else if(p.result==='Loss')s.l++; else if(p.result==='Push')s.p++; else if(p.result==='Pending')s.open++;
    if(isSettledW(p)){s.net+=p.units_pl;s.risk+=p.units;} } return s;};
const u2=v=>(Math.round(Math.round(v*1e6)/1e4)/100).toFixed(2);
const fmt=v=>Math.abs(v)<0.005?'0.00':(v>0?'+':'−')+Math.abs(v).toFixed(2);
const read=()=>{const b=$$('#tally b').map(x=>x.textContent.replace(/\s+/g,' ').trim());
  return {label:($('#tally .tl')||{}).textContent,n:+b[0],wlp:b[1],net:b[2].replace(/u$/,''),open:+b[3],risk:b[4],rows:$$('#rows tr[data-k]').length,state:$('#rows tr.state')?$('#rows tr.state').textContent.trim().slice(0,60):null,clearHidden:$('#clear').hidden}};
const same=(got,exp)=>got.n===exp.n&&got.wlp===`${exp.w}-${exp.l}-${exp.p}`&&got.open===exp.open&&
  (exp.w+exp.l+exp.p?(got.net===fmt(exp.net)&&got.risk===u2(exp.risk)+'u'):(got.net==='–'&&got.risk==='–'));
const set=async(id,v)=>{const e=$(id);e.value=v;e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));await sleep(380)};
const click=async s=>{$(s).click();await sleep(380)};
document.activeElement&&document.activeElement.blur();
// 1 start
let g=read();rec('start: whole log, 473 of 473, matches plays.json (W-L-P, net, open, risked)',g.label==='Whole log'&&g.n===raw.length&&same(g,expect(raw))&&g.clearHidden,{g,exp:expect(raw)});
// 2 pending
await click('#f-res button[data-v="Pending"]');g=read();
const pend=raw.filter(p=>p.result==='Pending');
rec('Pending filter: only the open play, summary says 1 open and shows dashes for net and risked',same(g,expect(pend))&&g.label==='Filtered log'&&g.rows===pend.length&&!g.clearHidden,{g});
const prow=$('#rows tr[data-k]');
rec('Pending row: result is the word Pending, profit is a dash (not 0.00u), stake kept',
  prow.querySelector('.c-res .w-txt').textContent==='Pending'&&getComputedStyle(prow.querySelector('.c-res .w-txt')).display!=='none'&&prow.querySelector('.c-pl').textContent.trim().startsWith('–')&&!/0\.00u/.test(prow.querySelector('.c-pl').textContent)&&/0\.50u/.test(prow.querySelector('.c-stake').textContent),
  {res:prow.querySelector('.c-res').textContent.trim(),pl:prow.querySelector('.c-pl').textContent.trim(),stake:prow.querySelector('.c-stake').textContent.trim()});
rec('Pending row has no link and says so',!!prow.querySelector('.nolink')&&/No post link on file/.test(prow.querySelector('.c-post').textContent));
await click('#clear');
// 3 search
for(const [q,terms] of [['mcmillan',['mcmillan']],['over receiving',['over','receiving']],['MCMILLAN',['mcmillan']],['  mcmillan   over ',['mcmillan','over']],['zzzzqq',['zzzzqq']]]){
  await set('#f-q',q);g=read();
  const exp=expect(raw.filter(p=>{const h=(p.play+' '+(p.game||'')).toLowerCase();return terms.every(t=>h.includes(t))}));
  rec(`search "${q}": ${exp.n} plays, summary matches`,same(g,exp)&&(exp.n?g.rows===Math.min(15,exp.n):/No plays match/.test(g.state||'')),{g,exp});
}
await set('#f-q','');
// 4 dates
await set('#f-from','2026-10-01');await set('#f-to','2026-10-15');g=read();
let exp=expect(raw.filter(p=>p.date>='2026-10-01'&&p.date<='2026-10-15'));
rec(`date range Oct 1 to Oct 15: ${exp.n} plays, summary matches`,same(g,exp),{g,exp});
await set('#f-to','2026-10-01');g=read();exp=expect(raw.filter(p=>p.date==='2026-10-01'));
rec('same day for From and To is allowed (one day)',same(g,exp)&&!$('#f-err').textContent,{g,exp});
await set('#f-from','');g=read();exp=expect(raw.filter(p=>p.date<='2026-10-01'));
rec('only a To date: everything up to it',same(g,exp),{g,exp});
await set('#f-to','');await set('#f-from','2026-10-25');g=read();exp=expect(raw.filter(p=>p.date>='2026-10-25'));
rec('only a From date: everything from it (includes the open play dated later)',same(g,exp)&&g.open===1,{g,exp});
// 5 backwards
await set('#f-from','2026-10-20');await set('#f-to','2026-10-01');g=read();
rec('From after To: message shown, both boxes flagged, nothing matches, state row explains',
  /From date is after the To date/.test($('#f-err').textContent)&&$('#f-from').getAttribute('aria-invalid')==='true'&&$('#f-to').getAttribute('aria-invalid')==='true'&&$('#f-from').getAttribute('aria-describedby')==='f-err'&&g.n===0&&/runs backwards/.test(g.state||''),{err:$('#f-err').textContent,g});
await set('#f-to','2026-10-30');
rec('fixing the range clears the message and the flags',$('#f-err').textContent===''&&$('#f-from').getAttribute('aria-invalid')===null&&read().n>0);
// 6 combine
await click('#f-sport button[data-v="NFL"]');await set('#f-q','over');
g=read();exp=expect(raw.filter(p=>p.sport==='NFL'&&p.date>='2026-10-20'&&p.date<='2026-10-30'&&(p.play+' '+(p.game||'')).toLowerCase().includes('over')));
rec('sport + search + dates together',same(g,exp),{g,exp});
// 7 clear
await click('#clear');g=read();
rec('Clear filters resets everything: boxes empty, buttons All, message gone, whole log back',
  g.label==='Whole log'&&g.n===raw.length&&same(g,expect(raw))&&$('#f-q').value===''&&$('#f-from').value===''&&$('#f-to').value===''&&$('#f-err').textContent===''&&$('#f-sport button[aria-pressed="true"]').dataset.v==='All'&&$('#f-res button[aria-pressed="true"]').dataset.v==='All'&&g.clearHidden,{g});
// 8 links
$('#more-all')&&$('#more-all').click();await sleep(500);
const rows=$$('#rows tr[data-k]');const withX=rows.filter(r=>r.querySelector('.xl')).length,without=rows.filter(r=>r.querySelector('.nolink')).length;
const wantX=raw.filter(p=>/^https:\/\/(x|twitter)\.com\/[A-Za-z0-9_]+\/status\/\d+/i.test(p.post||'')).length;
rec(`all ${raw.length} rows listed; ${wantX} keep their X link and ${raw.length-wantX} are marked as having none`,rows.length===raw.length&&withX===wantX&&without===raw.length-wantX,{rows:rows.length,withX,without,wantX});
const hrefs=rows.filter(r=>r.querySelector('.xl')).every(r=>r.querySelector('.xl').href===r.dataset.post&&r.querySelector('.xl').target==='_blank'&&/noopener/.test(r.querySelector('.xl').rel));
rec('every kept link opens its own post in a new tab with noopener',hrefs);
rec('every row without a link has screen-reader text',rows.filter(r=>r.querySelector('.nolink')).every(r=>/No post link on file/.test(r.querySelector('.nolink').textContent)));
const byKey=new Map(raw.map((p,i)=>[String(i),p]));let linkMismatch=0;for(const r of rows){const p=byKey.get(r.dataset.k);const want=/^https:\/\/(x|twitter)\.com\/[A-Za-z0-9_]+\/status\/\d+/i.test(p.post||'')?p.post:'';const got=r.dataset.post||'';if(want!==got)linkMismatch++}
rec('each row links to the same post plays.json holds for it',linkMismatch===0,{linkMismatch});
// 9 no dollar signs
rec('no dollar sign anywhere in the log section',!/\$/.test($('#log').textContent));
// 10 the record above and the whole-log summary agree on units risked
await click('#clear');
const heroRisk=($('.ledger').textContent.match(/on ([0-9.]+)u risked/)||[])[1];
rec('record above and whole-log summary give the same units risked ('+heroRisk+'u)',read().risk===heroRisk+'u',{hero:heroRisk,tally:read().risk});
return R.join('\n');
