// Page-side checks of the play log at phone and tablet widths (Details, stake, Pending, missing links). Run by check-pages.py inside the page.
const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const R=[];const rec=(n,ok,x)=>R.push((ok?'PASS ':'FAIL ')+n+(ok||x===undefined?'':' :: '+JSON.stringify(x)));
const vw=innerWidth, phone=vw<=760;
const vis=e=>{const c=getComputedStyle(e);return c.display!=='none'&&c.visibility!=='hidden'};
const click=async s=>{$(s).click();await sleep(350)};
document.activeElement&&document.activeElement.blur();
rec(`${vw}px: no sideways scroll on the page`,document.documentElement.scrollWidth<=vw,{sw:document.documentElement.scrollWidth});
const logRect=$('#log').getBoundingClientRect();
rec('log section stays inside the viewport',logRect.left>=0&&logRect.right<=vw+0.5,{l:logRect.left,r:logRect.right});
// filters
const q=$('#f-q').getBoundingClientRect(),f=$('#f-from').getBoundingClientRect(),t=$('#f-to').getBoundingClientRect();
rec('search box and both date boxes are visible and inside the log panel',[q,f,t].every(r=>r.width>60&&r.height>=34&&r.left>=0&&r.right<=vw+0.5),{q:[q.left,q.right,q.height],f:[f.left,f.right],t:[t.left,t.right]});
if(phone)rec('phone: search is full width, From and To sit side by side on one line',q.width>vw-70&&Math.abs(f.top-t.top)<2,{qw:q.width,ft:[f.top,t.top]});
rec('each new control has a name (label or aria-label)',['#f-q','#f-from','#f-to'].every(s=>{const e=$(s);const l=document.querySelector(`label[for="${e.id}"]`);return !!(l&&l.textContent.trim())}));
rec('Pending button is in the result group',!!$('#f-res button[data-v="Pending"]')&&vis($('#f-res button[data-v="Pending"]')));
const pr=$('#f-res button[data-v="Pending"]').getBoundingClientRect();
rec('Pending button inside the viewport',pr.right<=vw+0.5&&pr.left>=0,{l:pr.left,r:pr.right});
// phone record: open count and risked stay visible
const ledP=$$('.ledger p').filter(vis).map(p=>p.textContent.trim());
rec('record summary keeps "N open" and "units risked" visible at this width',ledP.some(x=>/open right now/.test(x))&&ledP.some(x=>/u risked/.test(x)),{ledP});
rec('record is labelled as the full record',/Full record/.test($('.rtag').textContent)&&vis($('.rtag')),{tag:$('.rtag').textContent});
// rows
// the newest play is the open one (no result tile yet), so the settled-row checks use the first settled row
const row=$('#rows tr[data-k]:not([data-open])');
const cells=s=>row.querySelector(s);
if(phone){
  rec('phone row: date, sport, odds and stake are all visible',['.c-date','.c-sport','.c-odds','.c-stake'].every(s=>vis(cells(s))),{});
  rec('phone row: stake reads "risk x.xxu"',/risk\s+\d+\.\d\du/.test(cells('.c-stake').innerText),{s:cells('.c-stake').innerText});
  rec('phone row: result tile visible and result word available to screen readers',!!cells('.c-res .t')&&!!cells('.c-res .w-txt').textContent);
  rec('phone row: Details control is there, collapsed, and its market/result/source stay out of the way until opened',!!cells('summary')&&!cells('details').open&&vis(cells('.c-more')),{});
  const sum=cells('summary').getBoundingClientRect();
  rec('Details summary is at least 28px tall (touch target) and named',sum.height>=28&&/Details for /.test(cells('summary').getAttribute('aria-label')),{h:sum.height,label:cells('summary').getAttribute('aria-label')});
  const before=row.getBoundingClientRect().height;
  cells('summary').click();await sleep(300);
  const dd=cells('.rd');
  rec('opening Details shows Market, Result and Source',cells('details').open&&vis(dd)&&/Market/.test(dd.textContent)&&/Result/.test(dd.textContent)&&/Source/.test(dd.textContent),{txt:dd.textContent.replace(/\s+/g,' ').trim()});
  rec('row grows when opened and stays inside the screen',row.getBoundingClientRect().height>before&&row.getBoundingClientRect().right<=vw+0.5);
  cells('summary').click();await sleep(250);
  rec('closing Details collapses it again',!cells('details').open);
  // a row with a post opens it when tapped; the Details control must not: stub window.open and press it for real
  $('#more-all')&&$('#more-all').click();await sleep(500);   // the newest 15 plays have no post link: list them all to find one that has
  const xr=$$('#rows tr[data-k]').find(r=>r.dataset.post),opened=[],realOpen=window.open;window.open=(...a)=>{opened.push(a);return null};
  xr.querySelector('summary').click();await sleep(150);
  xr.querySelector('.rd dd').dispatchEvent(new MouseEvent('click',{bubbles:true}));await sleep(150);
  xr.querySelector('summary').click();await sleep(150);
  window.open=realOpen;
  rec('tapping Details (or its text) does not open the post',opened.length===0,{opened});
  const outside=xr.querySelector('.c-play');window.open=(...a)=>{opened.push(a);return null};
  outside.dispatchEvent(new MouseEvent('click',{bubbles:true}));await sleep(150);window.open=realOpen;
  rec('a mouse click on the rest of a row with a post still opens that post (existing behaviour kept)',opened.length===1&&opened[0][0]===xr.dataset.post,{opened});
}else{
  rec('wide table: Details cell is hidden, columns show market, stake, result',!vis(cells('.c-more'))&&vis(cells('.c-mkt'))&&vis(cells('.c-stake'))&&vis(cells('.c-res')));
}
// pending row on this width
await click('#f-res button[data-v="Pending"]');
const p=$('#rows tr[data-k]');
const word=p.querySelector('.c-res .w-txt');
rec('Pending row: the word Pending is visible on screen',/Pending/.test(word.textContent)&&vis(word)&&word.getBoundingClientRect().width>20,{w:word.getBoundingClientRect().width});
const pl=p.querySelector('.c-pl');
rec('Pending row: profit shows a dash, never 0.00u',pl.textContent.trim().startsWith('–')&&!/0\.00/.test(pl.textContent)&&vis(pl));
if(phone){
  rec('Pending row: stake visible, source marked as missing in Details and by a dash',vis(p.querySelector('.c-stake'))&&vis(p.querySelector('.c-post .nolink'))&&/No post link on file/.test(p.querySelector('.rd').textContent));
}
await click('#clear');
// missing link marker on a normal row without a link
$('#more-all')&&$('#more-all').click();await sleep(500);
const no=$$('#rows tr[data-k]').find(r=>!r.dataset.post);
rec('a play without a post link shows a visible dash marker (not hidden) and says so to screen readers',vis(no.querySelector('.c-post .nolink'))&&/No post link on file/.test(no.querySelector('.nolink').textContent)&&no.querySelector('.nolink').getBoundingClientRect().width>(phone?20:4),{w:no.querySelector('.nolink').getBoundingClientRect().width});
const yes=$$('#rows tr[data-k]').find(r=>r.dataset.post);
rec('a play with a link still shows the X icon link',vis(yes.querySelector('.xl'))&&yes.querySelector('.xl').getBoundingClientRect().width>=20);
// whole-page overflow after everything rendered
rec('still no sideways scroll with all 473 rows listed',document.documentElement.scrollWidth<=vw,{sw:document.documentElement.scrollWidth});
return R.join('\n');
