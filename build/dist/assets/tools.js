/* Calculators. The maths and behaviour are carried over from the previous
   site unchanged; only routing, copy and styling hooks moved. Each page holds
   one tool, named by <body data-tool>, and every block below is guarded by the
   presence of its own markup.

   Dropped on purpose: the payout page's screenshot reader. It downloaded
   Tesseract from a CDN, and this site makes no external requests. */
(function(){
'use strict';
var TOOL=document.body.getAttribute('data-tool')||'';
function $(s){return document.querySelector(s)}
function el(t,c,x){var e=document.createElement(t);if(c)e.className=c;if(x!=null)e.textContent=x;return e}
/* the page's own address, without query or hash, for links people share */
function here(){return location.href.split(/[?#]/)[0]}

/* -- shared maths -- */
/* Read a price. A signed number, or 100 and above, is American.
   A plain number above 1 and below 100 is decimal. */
function pOdds(s){
  s=String(s==null?'':s).trim().replace(/[\s,]/g,'');
  if(!s||!/^[+-]?(\d+\.?\d*|\.\d+)$/.test(s))return null;
  var v=parseFloat(s);
  if(!isFinite(v))return null;
  if(v<=-100)return 1+100/(-v);
  if(v>=100)return 1+v/100;
  if(v>1&&v<100&&s.charAt(0)!=='-')return v;
  return null;
}
/* Decimal price back to an American price. */
function am(d){
  if(!(d>1))return '--';
  if(Math.abs(d-2)<1e-9)return '+100';   /* an even market reads +100, not -100 */
  var v=d>2?Math.round((d-1)*100):-Math.round(100/(d-1));
  return (v>0?'+':'')+v;
}
function dec(d){return d.toFixed(d<10?3:2)}
function p2(x){return (x*100).toFixed(2)+'%'}
function fine(id,html){$(id).innerHTML=html}
function mark(inp,ok){inp.className=ok?'':'bad'}
/* money to the cent, however big it gets */
function cash2(v){return '$'+Math.abs(v).toLocaleString('en-US',
  {minimumFractionDigits:2,maximumFractionDigits:2})}
function money2(v){return (v<0?'-':'+')+cash2(v)}
function num(e){var v=parseFloat(String(e.value).replace(/[^0-9.]/g,''));return (v>0&&isFinite(v))?v:null}

/* -- poker: whole cents throughout, so a split never loses or invents a cent -- */
function pkCents(s){
  s=String(s==null?'':s).replace(/[\s,$]/g,'');
  if(!s)return null;
  if(!/^(\d+\.?\d{0,2}|\.\d{1,2})$/.test(s))return NaN;
  return Math.round(parseFloat(s)*100);
}
function pkMoney(c){
  return '$'+(Math.abs(c)/100).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
}
function pkSigned(c){return (c>0?'+':c<0?'-':'')+pkMoney(c)}
/* Share the gap across the table by the size of each result. nets are cents and
   add up to the gap; the adjusted nets add up to zero. A player who broke even
   takes none of it. Cents that do not divide go to the largest remainders. */
function pkSplit(nets){
  var gap=0,w=0,i;
  for(i=0;i<nets.length;i++){gap+=nets[i];w+=Math.abs(nets[i])}
  var share=nets.map(function(){return 0});
  if(!gap||!w)return {gap:gap,share:share,net:nets.slice()};
  var g=Math.abs(gap),sign=gap>0?1:-1,used=0,rem=[];
  for(i=0;i<nets.length;i++){
    var exact=g*Math.abs(nets[i])/w,f=Math.floor(exact+1e-9);
    share[i]=f;used+=f;
    rem.push({i:i,r:exact-f,w:Math.abs(nets[i])});
  }
  rem.sort(function(a,b){return (b.r-a.r)||(b.w-a.w)||(a.i-b.i)});
  for(i=0;used<g;i++,used++)share[rem[i%rem.length].i]++;
  share=share.map(function(s){return s*sign});
  return {gap:gap,share:share,net:nets.map(function(n,k){return n-share[k]})};
}
/* Who pays whom. Exact matches go first, since each one squares two players in
   one payment. Then the biggest debt meets the biggest credit, again and again,
   which settles n players in at most n-1 payments. */
function pkSettle(people){
  var cr=[],db=[],out=[],i,j;
  people.forEach(function(p){
    if(p.net>0)cr.push({name:p.name,v:p.net});
    else if(p.net<0)db.push({name:p.name,v:-p.net});
  });
  function big(a,b){return (b.v-a.v)||(a.name.toLowerCase()<b.name.toLowerCase()?-1:1)}
  db.sort(big);cr.sort(big);
  for(i=0;i<db.length;i++)for(j=0;j<cr.length;j++){
    if(db[i].v&&cr[j].v===db[i].v){
      out.push({from:db[i].name,to:cr[j].name,amt:db[i].v});cr[j].v=0;db[i].v=0;break;
    }
  }
  for(;;){
    db=db.filter(function(x){return x.v>0}).sort(big);
    cr=cr.filter(function(x){return x.v>0}).sort(big);
    if(!db.length||!cr.length)break;
    var amt=Math.min(db[0].v,cr[0].v);
    out.push({from:db[0].name,to:cr[0].name,amt:amt});
    db[0].v-=amt;cr[0].v-=amt;
  }
  out.sort(function(a,b){
    var x=a.from.toLowerCase(),y=b.from.toLowerCase();
    return x<y?-1:x>y?1:(b.amt-a.amt);
  });
  return out;
}

/* -- segmented buttons: one pressed at a time -- */
function press(list,hit){
  list.forEach(function(o){var on=o===hit;o.classList.toggle('on',on);o.setAttribute('aria-pressed',on?'true':'false')});
}

/* -- arbitrage: a stake on each side -- */
if($('#ar-a'))(function(){
  var oA=$('#ar-a'),oB=$('#ar-b'),sA=$('#ar-sa'),sB=$('#ar-sb'),pA=$('#ar-pa'),pB=$('#ar-pb');
  var last='a';   /* the side edited most recently; the other one follows it */
  /* never type over the field the person is in */
  function set(e,v){if(document.activeElement===e)return;
    e.value=(v==null||!isFinite(v)||v<=0)?'':v.toFixed(2)}
  function paint(src){
    var da=pOdds(oA.value),db=pOdds(oB.value);
    mark(oA,da!==null||!oA.value);mark(oB,db!==null||!oB.value);
    var out=$('#ar-out'),pct=$('#ar-pct');
    if(da===null||db===null){
      ['#ar-ts','#ar-tp','#ar-out'].forEach(function(k){$(k).textContent='$0.00'});
      pct.textContent='0.00%';pct.className='num';out.className='num mut';
      fine('#ar-fine',(oA.value||oB.value)?'That price does not read. Use +150, -130 or 2.50.'
                                          :'Enter both prices, then a stake on either side.');
      return}
    /* a payout works backwards to the stake that reaches it */
    if(src==='pa'){var v=num(pA);if(v)set(sA,v/da)}
    if(src==='pb'){var w=num(pB);if(w)set(sB,w/db)}
    /* the side you did not touch follows, so both outcomes return the same money */
    var drive=(src==='sb'||src==='pb')?'b':(src==='sa'||src==='pa')?'a':last;
    last=drive;
    var a=num(sA),b=num(sB);
    if(drive==='a'){if(a)set(sB,a*da/db);else if(b)set(sA,b*db/da)}
    else{if(b)set(sA,b*db/da);else if(a)set(sB,a*da/db)}
    a=num(sA);b=num(sB);
    set(pA,a?a*da:null);set(pB,b?b*db:null);

    var ra=a?a*da:0,rb=b?b*db:0,ts=(a||0)+(b||0);
    var tp=(a&&b)?Math.min(ra,rb):(ra||rb),profit=tp-ts;
    $('#ar-ts').textContent=cash2(ts);
    $('#ar-tp').textContent=cash2(tp);
    out.textContent=(ts>0?money2(profit):'$0.00');
    out.className='num '+(ts<=0?'mut':profit>1e-9?'win':profit<-1e-9?'loss':'mut');
    pct.textContent=(ts>0&&profit>0?'+':'')+(ts>0?(profit/ts*100).toFixed(2):'0.00')+'%';
    pct.className='num '+(ts<=0?'':profit>1e-9?'win':profit<-1e-9?'loss':'');

    var s=1/da+1/db;
    fine('#ar-fine',
      (s<1?'Arb of <u>'+p2(1/s-1)+'</u> on the stake at these prices'
          :'No arb &mdash; the book holds <i>'+p2((s-1)/s)+'</i> at these prices'));
  }
  [[oA,'odds'],[oB,'odds'],[sA,'sa'],[sB,'sb'],[pA,'pa'],[pB,'pb']].forEach(function(k){
    k[0].addEventListener('input',function(){paint(k[1])});
    k[0].addEventListener('blur',function(){paint(k[1])});
  });
  $('#ar-clear').addEventListener('click',function(){
    last='a';[oA,oB,sA,sB,pA,pB].forEach(function(e){e.value=''});
    paint('odds');oA.focus();
  });
  paint('odds');
})();

/* -- odds: percent to odds, and back -- */
if($('#pc-in'))(function(){
  var inp=$('#pc-in'),out=$('#pc-out');
  function paint(){
    var v=parseFloat(inp.value);
    if(!(v>0&&v<100)){
      out.textContent='--';out.className='out num mut';
      fine('#pc-fine',inp.value?'Use a number above 0 and below 100.'
                               :'Enter a chance from 0 to 100.');
      return}
    var p=v/100,d=1/p;
    out.textContent=am(d);out.className='out num';
    fine('#pc-fine','Decimal <i>'+dec(d)+'</i> &middot; pays <i>'+dec(d-1)+'</i> to 1');
  }
  inp.addEventListener('input',paint);
  paint();

  var io=$('#pc-o'),oo=$('#pc-oout');
  function back(){
    var d=pOdds(io.value);
    mark(io,d!==null||!io.value);
    if(d===null){
      oo.textContent='--';oo.className='out num sm mut';
      fine('#pc-ofine',io.value?'That price does not read.':'American or decimal.');
      return}
    var p=1/d;
    oo.textContent=p2(p);oo.className='out num sm';
    fine('#pc-ofine','American <i>'+am(d)+'</i> &middot; decimal <i>'+dec(d)+'</i><br>'+
                     'This is the raw price, vig included');
  }
  io.addEventListener('input',back);
  back();

  /* a multiplier is the payout for each $1, so it is the decimal price */
  var im=$('#pc-m'),mo=$('#pc-mout');
  function mult(){
    var t=String(im.value==null?'':im.value).trim().replace(/[\s,$]/g,'').replace(/[x×]$/i,'');
    var d=/^(\d+\.?\d*|\.\d+)$/.test(t)?parseFloat(t):NaN;
    var ok=isFinite(d)&&d>1;
    mark(im,ok||!im.value);
    if(!ok){
      mo.textContent='--';mo.className='out num sm mut';
      fine('#pc-mfine',im.value?'Use a multiplier above 1.':'The payout for each $1. Kalshi shows this.');
      return}
    mo.textContent=am(d);mo.className='out num sm';
    fine('#pc-mfine','Decimal <i>'+dec(d)+'</i> &middot; chance <i>'+p2(1/d)+'</i><br>'+
                     'Profit <i>'+dec(d-1)+'</i> for each 1 risked');
  }
  im.addEventListener('input',mult);
  mult();
})();

/* -- devig a two-way market -- */
if($('#dv-a'))(function(){
  var ia=$('#dv-a'),ib=$('#dv-b'),method='mult';
  var NAME={mult:'Multiplicative',add:'Additive',pow:'Power'};

  /* Power: find k where pA^k + pB^k = 1. The sum falls as k rises,
     so a plain bisection finds k. */
  function powerK(pa,pb){
    var lo=(pa+pb>1)?1:0.0001, hi=(pa+pb>1)?60:1, k, f, i;
    for(i=0;i<200;i++){
      k=(lo+hi)/2;
      f=Math.pow(pa,k)+Math.pow(pb,k)-1;
      if(Math.abs(f)<1e-12)break;
      if(f>0)lo=k;else hi=k;
    }
    return k;
  }
  function fairA(pa,pb,m){
    if(m==='add')return pa-(pa+pb-1)/2;
    if(m==='pow')return Math.pow(pa,powerK(pa,pb));
    return pa/(pa+pb);
  }
  function blank(){
    ['#dv-pa','#dv-oa','#dv-pb','#dv-ob'].forEach(function(k){
      $(k).textContent='--';$(k).className=$(k).className.replace(' mut','')+' mut'});
  }
  function put(k,txt,lil){var e=$(k);e.textContent=txt;e.className='dv num'+(lil?' lil':'')}
  function paint(){
    var da=pOdds(ia.value),db=pOdds(ib.value);
    mark(ia,da!==null||!ia.value);mark(ib,db!==null||!ib.value);
    if(da===null||db===null){
      blank();
      fine('#dv-fine',(ia.value||ib.value)?'That price does not read. Use +120, -140 or 2.20.'
                                          :'Enter both sides of the market.');
      return}
    var pa=1/da,pb=1/db,s=pa+pb,fa=fairA(pa,pb,method),fb=1-fa;
    if(!(fa>0&&fa<1)){
      blank();
      fine('#dv-fine','These two prices do not make a market this method can split.');
      return}
    put('#dv-pa',p2(fa));put('#dv-oa',am(1/fa),1);
    put('#dv-pb',p2(fb));put('#dv-ob',am(1/fb),1);
    fine('#dv-fine',
      (s>1?'Book holds <i>'+p2((s-1)/s)+'</i>':'These prices are under 100% already')+
      ' &middot; raw <i>'+p2(pa)+'</i> / <i>'+p2(pb)+'</i> &middot; '+NAME[method]);
  }
  var segs=[].slice.call(document.querySelectorAll('#view-devig .sg'));
  segs.forEach(function(b){
    b.addEventListener('click',function(){
      method=b.getAttribute('data-m');press(segs,b);paint();
    });
  });
  [ia,ib].forEach(function(e){e.addEventListener('input',paint)});
  paint();
})();

/* -- reset a tool page -- */
[].slice.call(document.querySelectorAll('.treset')).forEach(function(btn){
  btn.addEventListener('click',function(){
    var pane=$('#view-'+btn.getAttribute('data-r'));
    [].slice.call(pane.querySelectorAll('input')).forEach(function(f){
      f.value='';
      f.dispatchEvent(new Event('input',{bubbles:true}));
    });
    var f=pane.querySelector('input');if(f)f.focus();
  });
});

/* -- cheat sheet: whole or half percent, three blocks -- */
if($('#csheet'))(function(){
  var host=$('#csheet');
  var step=1;
  function key(p){return 'cr-'+Math.round(p*10)}
  function build(){
    host.innerHTML='';
    var rows=[],p;
    for(p=step;p<100;p+=step){
      var v=Math.round(p*10)/10,d=100/v;
      rows.push({p:v,am:am(d),dec:dec(d),neg:v>50})}
    var per=Math.ceil(rows.length/3);
    for(var b=0;b<3;b++){
      var slice=rows.slice(b*per,(b+1)*per);if(!slice.length)continue;
      var blk=el('div','cblk');
      var hd=el('div','crow hd');
      hd.appendChild(el('div','','Chance'));hd.appendChild(el('div','','American'));
      hd.appendChild(el('div','','Decimal'));blk.appendChild(hd);
      slice.forEach(function(r){
        var tr=el('div','crow');tr.id=key(r.p);
        tr.appendChild(el('div','',(step<1?r.p.toFixed(1):String(r.p))+'%'));
        tr.appendChild(el('div','am'+(r.neg?' neg':''),r.am));
        tr.appendChild(el('div','dc',r.dec));
        blk.appendChild(tr)});
      host.appendChild(blk)}
  }
  function jump(){
    [].slice.call(document.querySelectorAll('.crow.hit')).forEach(function(e){e.className='crow'});
    var v=parseFloat($('#cf').value);
    if(!(v>0&&v<100))return;
    v=Math.round(v/step)*step;
    var t=$('#'+key(Math.round(v*10)/10));if(!t)return;
    t.className='crow hit';t.scrollIntoView({block:'nearest'});
  }
  var segs=[].slice.call(document.querySelectorAll('.csteps .sg'));
  segs.forEach(function(b){
    b.addEventListener('click',function(){
      step=parseFloat(b.getAttribute('data-step'));press(segs,b);
      build();jump();
    });
  });
  $('#cf').addEventListener('input',jump);
  build();
})();

/* -- hedge a bet you already hold -- */
if($('#hg-o'))(function(){
  var iO=$('#hg-o'),iS=$('#hg-s'),iH=$('#hg-h'),iHS=$('#hg-hs'),iC=$('#hg-c');
  function paint(){
    var dO=pOdds(iO.value),dH=pOdds(iH.value),st=num(iS);
    mark(iO,dO!==null||!iO.value);mark(iH,dH!==null||!iH.value);
    var w1=$('#hg-w1'),w2=$('#hg-w2'),out=$('#hg-out'),pct=$('#hg-pct');
    function blank(msg){
      [w1,w2,out].forEach(function(e){e.textContent='$0.00';e.className='num mut'});
      pct.textContent='0.00%';pct.className='num';fine('#hg-fine',msg)}
    if(dO===null||dH===null||!st){
      blank('Enter your price, your stake, and the price on the other side.');
      return}
    var even=st*dO/dH;                       /* the stake that makes both sides pay the same */
    var h=num(iHS);
    if(h===null){iHS.placeholder=even.toFixed(2)}
    var use=(h===null)?even:h;
    var risk=st+use;
    var p1=st*dO-risk;                       /* your bet wins */
    var pw=use*dH-risk;                      /* the hedge wins */
    var lock=Math.min(p1,pw);
    w1.textContent=money2(p1);w1.className='num '+(p1>1e-9?'win':p1<-1e-9?'loss':'mut');
    w2.textContent=money2(pw);w2.className='num '+(pw>1e-9?'win':pw<-1e-9?'loss':'mut');
    out.textContent=money2(lock);out.className='num '+(lock>1e-9?'win':lock<-1e-9?'loss':'mut');
    pct.textContent=(lock>0?'+':'')+(lock/risk*100).toFixed(2)+'%';
    pct.className='num '+(lock>1e-9?'win':lock<-1e-9?'loss':'');
    var txt=(h===null)
      ? 'Equal hedge of <u>'+cash2(even)+'</u> at '+am(dH)+' &middot; '+cash2(risk)+' at risk in total'
      : 'Equal hedge would be <u>'+cash2(even)+'</u> &middot; '+cash2(risk)+' at risk in total';
    var c=num(iC);
    if(c!==null){
      var cp=c-st,gap=lock-cp;
      txt+='<br>Cash out returns '+cash2(c)+', a profit of <i>'+money2(cp)+'</i>. '+
        (Math.abs(gap)<0.005?'The two are level.'
          :gap>0?'Hedging is <u>'+cash2(gap)+'</u> better.'
                :'Cash out is <u>'+cash2(-gap)+'</u> better.');
    }
    fine('#hg-fine',txt);
  }
  [iO,iS,iH,iHS,iC].forEach(function(e){
    e.addEventListener('input',paint);e.addEventListener('blur',paint)});
  $('#hg-clear').addEventListener('click',function(){
    [iO,iS,iH,iHS,iC].forEach(function(e){e.value=''});iHS.placeholder='auto';paint();iO.focus()});
  paint();
})();

/* -- parlay and round robin -- */
if($('#pl-legs'))(function(){
  var box=$('#pl-legs'),MAXL=10,mode='straight',legs=['','',''];
  function bits(m){var n=0;while(m){n+=m&1;m>>=1}return n}
  function nCk(n,k){if(k<0||k>n)return 0;var r=1,i;for(i=1;i<=k;i++)r=r*(n-k+i)/i;return Math.round(r)}

  function drawLegs(){
    box.innerHTML='';
    legs.forEach(function(v,i){
      var row=el('div','leg');
      row.appendChild(el('span','ln','Leg '+(i+1)));
      var inp=document.createElement('input');
      inp.type='text';inp.value=v;inp.placeholder='+120';inp.autocomplete='off';
      inp.spellcheck=false;inp.setAttribute('aria-label','Odds on leg '+(i+1));
      inp.addEventListener('input',function(){legs[i]=inp.value;
        mark(inp,pOdds(inp.value)!==null||!inp.value);paint()});
      row.appendChild(inp);
      var x=el('button','legx','×');
      x.type='button';x.title='Remove this leg';
      x.setAttribute('aria-label','Remove leg '+(i+1));
      x.addEventListener('click',function(){
        if(legs.length<=2)return;legs.splice(i,1);drawLegs();drawModes();paint()});
      row.appendChild(x);
      box.appendChild(row);
    });
    $('#pl-hint').textContent=legs.length+' of '+MAXL+' legs';
    $('#pl-add').disabled=(legs.length>=MAXL);
  }
  function drawModes(){
    var seg=$('#pl-mode'),n=live().length;seg.innerHTML='';
    var opts=[['straight','Straight']],k;
    for(k=2;k<n;k++)opts.push([String(k),'By '+k+'s']);
    if(opts.length===1)opts.push(['2','By 2s']);
    if(mode!=='straight'&&+mode>=n)mode='straight';
    opts.forEach(function(o){
      var b=el('button','sg'+(String(mode)===o[0]?' on':''),o[1]);
      b.type='button';b.setAttribute('data-m',o[0]);
      b.setAttribute('aria-pressed',String(mode)===o[0]?'true':'false');
      b.addEventListener('click',function(){mode=o[0];drawModes();paint()});
      seg.appendChild(b);
    });
  }
  function live(){
    var out=[];legs.forEach(function(v){var d=pOdds(v);if(d!==null)out.push(d)});return out}

  function paint(){
    var D=live(),n=D.length,S=parseFloat(String($('#pl-s').value).replace(/[^0-9.]/g,''));
    if(!(S>0))S=0;
    var outTab=$('#pl-out'),comboTab=$('#pl-combos');
    outTab.innerHTML='';comboTab.innerHTML='';
    if(n<2){
      ['#pl-n','#pl-risk','#pl-best','#pl-bestp'].forEach(function(k,i){
        $(k).textContent=i===0?'0':'$0.00';$(k).className='num mut'});
      $('#pl-count').textContent='';
      fine('#pl-fine','Enter a price on at least two legs.');
      return}
    var K=(mode==='straight')?n:Math.min(+mode,n);
    /* every bet on the ticket, as a bitmask over the live legs */
    var combos=[],m,i,d;
    for(m=1;m<(1<<n);m++){
      if(bits(m)!==K)continue;
      d=1;for(i=0;i<n;i++)if(m&(1<<i))d*=D[i];
      combos.push({m:m,d:d});
    }
    var risk=S*combos.length,best=0;
    combos.forEach(function(c){best+=S*c.d});
    $('#pl-n').textContent=String(combos.length);$('#pl-n').className='num';
    $('#pl-risk').textContent=cash2(risk);$('#pl-risk').className='num';
    $('#pl-best').textContent=cash2(best);$('#pl-best').className='num';
    $('#pl-bestp').textContent=money2(best-risk);
    $('#pl-bestp').className='num '+(best-risk>1e-9?'win':'loss');
    $('#pl-title').textContent=(mode==='straight')
      ? 'Straight parlay of '+n+' legs' : 'Round robin, '+n+' legs by '+K+'s';
    $('#pl-count').textContent=combos.length+(combos.length===1?' bet':' bets')+
      ' · '+cash2(risk)+' at risk';

    /* what comes back for each number of winning legs */
    var head=el('div','prow hd');
    ['Legs hit','Bets that win','Comes back','Profit'].forEach(function(t){
      head.appendChild(el('div','',t))});
    outTab.appendChild(head);
    /* work out the fewest legs that guarantee a profit, then mark that row */
    var rows=[],brk=-1,j;
    for(j=0;j<=n;j++){
      var mn=Infinity,mx=-Infinity,w;
      for(w=0;w<(1<<n);w++){
        if(bits(w)!==j)continue;
        var ret=0;
        for(i=0;i<combos.length;i++)if((combos[i].m&w)===combos[i].m)ret+=S*combos[i].d;
        if(ret<mn)mn=ret;if(ret>mx)mx=ret;
      }
      if(mn===Infinity){mn=mx=0}
      rows.push({j:j,mn:mn,mx:mx});
      if(brk<0&&mn-risk>1e-9)brk=j;
    }
    for(j=rows.length-1;j>=0;j--){
      var r=rows[j],pmin=r.mn-risk,pmax=r.mx-risk;
      var tr=el('div','prow'+(r.j===brk?' brk':''));
      tr.appendChild(el('div','',r.j+' of '+n));
      tr.appendChild(el('div','',String(nCk(r.j,K))));
      tr.appendChild(el('div','',(Math.abs(r.mx-r.mn)<0.005)?cash2(r.mn):cash2(r.mn)+' – '+cash2(r.mx)));
      tr.appendChild(el('div',(pmax>1e-9?'win':pmax<-1e-9?'loss':'mut'),
        (Math.abs(pmax-pmin)<0.005)?money2(pmin):money2(pmin)+' – '+money2(pmax)));
      outTab.appendChild(tr);
    }

    /* every bet, with its own price */
    var ch=el('div','prow hd');
    ['Bet','Decimal','American','Pays'].forEach(function(t){ch.appendChild(el('div','',t))});
    comboTab.appendChild(ch);
    combos.forEach(function(c){
      var names=[];for(i=0;i<n;i++)if(c.m&(1<<i))names.push(i+1);
      var tr=el('div','prow');
      tr.appendChild(el('div','','Legs '+names.join(', ')));
      tr.appendChild(el('div','',dec(c.d)));
      tr.appendChild(el('div','',am(c.d)));
      tr.appendChild(el('div','',cash2(S*c.d)));
      comboTab.appendChild(tr);
    });

    var full=1;for(i=0;i<n;i++)full*=D[i];
    fine('#pl-fine','All '+n+' legs together price at <u>'+am(full)+'</u> ('+dec(full)+')'+
      ((mode==='straight')?''
        :' &middot; a straight '+n+'-leg parlay at '+cash2(S)+' would pay '+cash2(S*full)));
  }
  $('#pl-add').addEventListener('click',function(){
    if(legs.length>=MAXL)return;legs.push('');drawLegs();drawModes();paint()});
  $('#pl-s').addEventListener('input',paint);
  $('#pl-clear').addEventListener('click',function(){
    legs=['','',''];mode='straight';$('#pl-s').value='10';
    drawLegs();drawModes();paint();box.querySelector('input').focus()});
  drawLegs();drawModes();paint();
})();

/* -- payout: a stake and a price in any of five forms -- */
if($('#py-am'))(function(){
  var F={am:$('#py-am'),dec:$('#py-dec'),frac:$('#py-frac'),imp:$('#py-imp'),mult:$('#py-mult')};
  var KEYS=['am','dec','frac','imp','mult'];
  var CURD=null,legs=['','',''],MAXL=12;

  /* ---- one reader per format ---- */
  function rAm(s){s=String(s).trim().replace(/[\s,]/g,'');
    if(!/^[+-]?\d+(\.\d+)?$/.test(s))return null;
    var v=parseFloat(s);if(!isFinite(v))return null;
    if(v>=100)return 1+v/100;
    if(v<=-100)return 1+100/(-v);
    return null}
  function rDec(s){s=String(s).trim().replace(/[\s,]/g,'');
    if(!/^\d+(\.\d+)?$/.test(s))return null;
    var v=parseFloat(s);return v>1?v:null}
  function rFrac(s){var m=String(s).trim().match(/^(\d+(?:\.\d+)?)\s*[\/:]\s*(\d+(?:\.\d+)?)$/);
    if(!m)return null;var p=parseFloat(m[1]),q=parseFloat(m[2]);
    return (p>0&&q>0)?1+p/q:null}
  function rImp(s){s=String(s).trim().replace(/[\s,%]/g,'');
    if(!/^\d+(\.\d+)?$/.test(s))return null;
    var v=parseFloat(s);return (v>0&&v<100)?100/v:null}
  function rMult(s){s=String(s).trim().replace(/[\s,]/g,'').replace(/[xX×]$/,'');
    if(!/^\d+(\.\d+)?$/.test(s))return null;
    var v=parseFloat(s);return v>1?v:null}
  var READ={am:rAm,dec:rDec,frac:rFrac,imp:rImp,mult:rMult};

  /* any of the five, used by the legs */
  function anyOdds(s){
    s=String(s==null?'':s).trim();
    if(!s)return null;
    var d=rFrac(s);if(d!==null)return d;
    d=rAm(s);if(d!==null)return d;
    if(/[xX×]$/.test(s)){d=rMult(s);if(d!==null)return d}
    return rDec(s);
  }

  /* ---- one writer per format ---- */
  function wFrac(d){
    var x=d-1;if(!(x>0))return '';
    /* the smallest denominator that is close enough, so 2.333 reads 7/3
       rather than 233/100 */
    var tol=Math.max(1e-9,x*0.004),best=null,q,p,err;
    for(q=1;q<=100;q++){
      p=Math.round(x*q);
      if(p<1)continue;
      err=Math.abs(p/q-x);
      if(best===null||err<best.e-1e-12)best={p:p,q:q,e:err};
      if(err<=tol)break;
    }
    if(best===null)return '';
    var a=best.p,b=best.q,t;
    while(b){t=a%b;a=b;b=t}
    return (best.p/a)+'/'+(best.q/a);
  }
  var WRITE={
    am:function(d){return am(d)},
    dec:function(d){return dec(d)},
    frac:wFrac,
    imp:function(d){return (100/d).toFixed(2)},
    mult:function(d){return d.toFixed(2)}
  };

  function fill(src,d){
    KEYS.forEach(function(k){
      if(k===src)return;
      F[k].value=(d===null)?'':WRITE[k](d);
      mark(F[k],true);
    });
  }
  function render(){
    var S=num($('#py-s')),fee=num($('#py-f'))||0,w=$('#py-win'),p=$('#py-pay');
    if(CURD===null||S===null){
      w.textContent='$0.00';w.className='num mut';
      p.textContent='$0.00';p.className='num mut';
      fine('#py-fine',CURD===null?'Type a price into any one of the five fields.'
                                 :'Enter a bet amount.');
      return}
    var pay=S*CURD,profit=pay-S-fee;
    w.textContent=(profit<0?'-':'')+cash2(profit);
    w.className='num '+(profit>1e-9?'win':profit<-1e-9?'loss':'mut');
    p.textContent=cash2(pay);p.className='num';
    var txt='American <i>'+am(CURD)+'</i> &middot; decimal <i>'+dec(CURD)+
      '</i> &middot; '+(100/CURD).toFixed(2)+'% implied &middot; pays <i>'+dec(CURD-1)+'</i> to 1';
    if(fee>0){
      var real=pay/(S+fee);
      txt+='<br>You pay '+cash2(S+fee)+' all in, so your true price is <i>'+am(real)+
           '</i> &middot; '+real.toFixed(2)+'× &middot; '+(100/real).toFixed(2)+'% implied';
    }
    fine('#py-fine',txt);
  }
  KEYS.forEach(function(k){
    var e=F[k];
    e.addEventListener('input',function(){
      var raw=e.value.trim();
      var d=raw?READ[k](raw):null;
      mark(e,d!==null||!raw);
      CURD=d;
      fill(k,d);
      render();
    });
  });
  $('#py-s').addEventListener('input',render);
  $('#py-f').addEventListener('input',render);

  /* ---- parlay side ---- */
  var box=$('#py-legs');
  function drawLegs(){
    box.innerHTML='';
    legs.forEach(function(v,i){
      var row=el('div','leg');
      row.appendChild(el('span','ln','Leg '+(i+1)));
      var inp=document.createElement('input');
      inp.type='text';inp.value=v;inp.placeholder='+120';inp.autocomplete='off';
      inp.spellcheck=false;inp.setAttribute('aria-label','Price on leg '+(i+1));
      var out=el('span','lread','');
      function readout(){
        var d=anyOdds(inp.value);
        mark(inp,d!==null||!inp.value);
        out.textContent=(d===null)?'':(am(d)+' · '+(100/d).toFixed(1)+'%');
      }
      inp.addEventListener('input',function(){legs[i]=inp.value;readout();paintP()});
      readout();
      row.appendChild(inp);
      row.appendChild(out);
      var x=el('button','legx','×');
      x.type='button';x.title='Remove this leg';
      x.setAttribute('aria-label','Remove leg '+(i+1));
      x.addEventListener('click',function(){
        if(legs.length<=2)return;legs.splice(i,1);drawLegs();paintP()});
      row.appendChild(x);
      box.appendChild(row);
    });
    $('#py-hint').textContent=legs.length+' of '+MAXL+' legs';
    $('#py-add').disabled=(legs.length>=MAXL);
  }
  $('#py-add').addEventListener('click',function(){
    if(legs.length>=MAXL)return;legs.push('');drawLegs();paintP();
    var ins=box.querySelectorAll('input');ins[ins.length-1].focus()});

  function paintP(){
    var D=[];legs.forEach(function(v){var d=anyOdds(v);if(d!==null)D.push(d)});
    var S=num($('#py-ps')),fee=num($('#py-pf'))||0;
    var n=$('#py-pn'),o=$('#py-po'),w=$('#py-pw'),p=$('#py-pp');
    n.textContent=String(D.length);n.className='num'+(D.length?'':' mut');
    if(D.length<2){
      o.textContent='--';o.className='num mut';
      w.textContent='$0.00';w.className='num mut';
      p.textContent='$0.00';p.className='num mut';
      fine('#py-pfine','Enter a price on at least two legs.');
      return}
    var d=1;D.forEach(function(x){d*=x});
    o.textContent=am(d);o.className='num';
    if(S===null){
      w.textContent='$0.00';w.className='num mut';
      p.textContent='$0.00';p.className='num mut';
      fine('#py-pfine','Decimal <i>'+dec(d)+'</i> &middot; '+(100/d).toFixed(2)+
        '% implied &middot; enter a bet amount.');
      return}
    var pay=S*d,profit=pay-S-fee;
    w.textContent=(profit<0?'-':'')+cash2(profit);
    w.className='num '+(profit>1e-9?'win':profit<-1e-9?'loss':'mut');
    p.textContent=cash2(pay);p.className='num';
    var txt='Decimal <i>'+dec(d)+'</i> &middot; '+(100/d).toFixed(2)+
      '% implied &middot; every leg must win.';
    if(fee>0)txt+=' Fees of '+cash2(fee)+' come out of the profit.';
    fine('#py-pfine',txt);
  }
  $('#py-ps').addEventListener('input',paintP);
  $('#py-pf').addEventListener('input',paintP);

  /* ---- single or parlay ---- */
  var msegs=[].slice.call(document.querySelectorAll('#py-mode .sg'));
  function setMode(m){
    $('#py-single').hidden=(m!=='single');
    $('#py-parlay').hidden=(m!=='parlay');
    msegs.forEach(function(b){
      var hit=b.getAttribute('data-m')===m;
      b.classList.toggle('on',hit);
      b.setAttribute('aria-pressed',hit?'true':'false');
    });
  }
  msegs.forEach(function(b){
    b.addEventListener('click',function(){setMode(b.getAttribute('data-m'))})});
  /* RESET clears the boxes; the legs are drawn fresh as well */
  $('#view-payout .treset').addEventListener('click',function(){
    legs=['','',''];drawLegs();paintP();render();
  });

  drawLegs();paintP();render();
})();

/* -- poker settle-up --
   Buy-ins and cash-outs in, payments out. The table is kept in this browser, so
   a reload in the middle of a game loses nothing. Copy link carries the whole
   table in the address, through the hidden #pk-game field. */
if($('#pk-rows'))(function(){
  var rows=$('#pk-rows');
  var KEY='rg.poker.v1',MAXP=24,CAP=100000000;   /* $1,000,000: past that it is a typo */
  var G=fresh(10000),R={},TOT=null,armed='',armT=null,warn='',LAST=null;

  function fresh(buy){return {buy:buy,split:false,seq:0,ps:[]}}
  function inOf(p){return p.n*G.buy+p.extra}
  function plain(c){return c%100?(c/100).toFixed(2):String(c/100)}
  function count(c){
    if(!(G.buy>0))return '--';
    var v=c/G.buy;
    return Math.abs(v-Math.round(v))<1e-9?String(Math.round(v)):String(+v.toFixed(2));
  }
  function cleanName(s){return String(s||'').replace(/\s+/g,' ').trim().slice(0,24)}
  /* the other player already using this name, if any */
  function taken(name,id){
    var k=name.toLowerCase();
    return G.ps.filter(function(p){return p.id!==id&&p.name.toLowerCase()===k})[0]||null;
  }
  function flag(inp,ok){inp.classList.toggle('bad',!ok)}
  function whole(v,lo,hi){return typeof v==='number'&&v===Math.floor(v)&&v>=lo&&v<=hi}
  function valid(g){
    if(!g||!whole(g.buy,0,CAP)||!Array.isArray(g.ps)||g.ps.length>MAXP)return false;
    return g.ps.every(function(p){
      return p&&whole(p.id,1,1e9)&&typeof p.name==='string'&&!!p.name&&whole(p.n,0,999)&&
        whole(p.extra,0,CAP)&&(p.out===null||whole(p.out,0,CAP));
    });
  }
  function names(a){
    if(a.length>4)return a.slice(0,3).join(', ')+' and '+(a.length-3)+' others';
    return a.length<2?a.join(''):a.slice(0,-1).join(', ')+' and '+a[a.length-1];
  }

  /* the whole table as one short string, for the address bar */
  function encode(){
    return ['1',G.buy,G.split?1:0,G.ps.map(function(p){
      return [encodeURIComponent(p.name),p.n,p.extra,p.out===null?'':p.out].join(':');
    }).join(',')].join('|');
  }
  function decode(s){
    var a=String(s||'').split('|');
    if(a.length!==4||a[0]!=='1')return null;
    var g=fresh(+a[1]);g.split=(a[2]==='1');
    try{
      (a[3]?a[3].split(','):[]).forEach(function(t){
        var f=t.split(':');if(f.length!==4)throw 0;
        g.ps.push({id:++g.seq,name:cleanName(decodeURIComponent(f[0])),n:+f[1],extra:+f[2],
          out:f[3]===''?null:+f[3]});
      });
    }catch(e){return null}
    return valid(g)?g:null;
  }
  function load(){
    try{
      var g=JSON.parse(localStorage.getItem(KEY)||'null');
      if(valid(g)){
        G=g;G.split=!!G.split;
        G.seq=G.ps.reduce(function(m,p){return Math.max(m,p.id)},0);
      }
    }catch(e){}
  }
  function save(){
    try{localStorage.setItem(KEY,JSON.stringify(G))}catch(e){}
    $('#pk-game').value=encode();
  }

  /* a destructive button asks twice: the first press arms it, the second acts */
  function arm(k){armed=k;clearTimeout(armT);armT=setTimeout(disarm,3500);paint()}
  function disarm(){armed='';clearTimeout(armT);paint()}

  function cell(cls,label){
    var c=el('div','pkc '+cls);
    if(label)c.appendChild(el('span','pkl',label));
    return c;
  }
  function moneyIn(val,aria){
    var w=el('div','mi'),i=document.createElement('input');
    w.appendChild(el('span','','$'));
    i.type='text';i.inputMode='decimal';i.autocomplete='off';i.value=val;
    i.setAttribute('aria-label',aria);
    w.appendChild(i);
    return {w:w,i:i};
  }
  /* Enter moves down the column, so a whole table of cash-outs can be typed in one go */
  function onEnter(inp,p,which){
    inp.addEventListener('keydown',function(e){
      if(e.key!=='Enter')return;
      e.preventDefault();
      var nx=G.ps[G.ps.indexOf(p)+1];
      if(nx&&R[nx.id])R[nx.id][which].focus();else inp.blur();
    });
  }

  function drawRows(){
    rows.innerHTML='';R={};TOT=null;
    if(!G.ps.length){
      rows.appendChild(el('div','pkempty','No players yet. Add everyone at the table above.'));
      paint();return;
    }
    var hd=el('div','pkrow hd');
    [['pnm','Player'],['pst','Buy-ins'],['pin','In'],['pout','Cash-out'],['pnet','Net'],['px','']]
      .forEach(function(h){hd.appendChild(el('div','pkc '+h[0],h[1]))});
    rows.appendChild(hd);

    G.ps.forEach(function(p){
      var row=el('div','pkrow'),ctl=el('div','pkctl');

      var nm=cell('pnm'),ni=document.createElement('input');
      ni.type='text';ni.className='pkname';ni.value=p.name;ni.maxLength=24;
      ni.autocomplete='off';ni.spellcheck=false;ni.setAttribute('aria-label','Player name');
      ni.addEventListener('input',function(){
        var v=cleanName(ni.value),ok=!!v&&!taken(v,p.id);
        flag(ni,ok);
        if(ok){p.name=v;save();paint()}
      });
      ni.addEventListener('blur',function(){ni.value=p.name;flag(ni,true)});
      nm.appendChild(ni);row.appendChild(nm);

      var st=cell('pst','Buy-ins'),stp=el('div','pkstep'),
          minus=el('button','','−'),cnt=el('span','num'),plus=el('button','','+');
      minus.type='button';plus.type='button';
      minus.setAttribute('aria-label','One fewer buy-in');
      plus.setAttribute('aria-label','One more buy-in');
      minus.addEventListener('click',function(){if(p.n>0)p.n--;else p.extra=0;save();paint()});
      plus.addEventListener('click',function(){if(p.n<999)p.n++;save();paint()});
      stp.appendChild(minus);stp.appendChild(cnt);stp.appendChild(plus);
      st.appendChild(stp);ctl.appendChild(st);

      var ic=cell('pin','In'),mi=moneyIn(plain(inOf(p)),'Money in');
      mi.i.addEventListener('input',function(){
        var c=pkCents(mi.i.value);
        if(c!==c||c>CAP){flag(mi.i,false);return}
        flag(mi.i,true);c=c||0;
        if(G.buy>0){p.n=Math.min(999,Math.floor(c/G.buy));p.extra=c-p.n*G.buy}
        else{p.n=0;p.extra=c}
        save();paint();
      });
      mi.i.addEventListener('blur',function(){mi.i.value=plain(inOf(p));flag(mi.i,true)});
      onEnter(mi.i,p,'inI');
      ic.appendChild(mi.w);ctl.appendChild(ic);

      var oc=cell('pout','Cash-out'),mo=moneyIn(p.out===null?'':plain(p.out),'Cash-out');
      mo.i.addEventListener('input',function(){
        var c=pkCents(mo.i.value);
        if(c!==c||c>CAP){flag(mo.i,false);return}
        flag(mo.i,true);p.out=c;save();paint();
      });
      mo.i.addEventListener('blur',function(){mo.i.value=p.out===null?'':plain(p.out);flag(mo.i,true)});
      onEnter(mo.i,p,'outI');
      oc.appendChild(mo.w);ctl.appendChild(oc);
      row.appendChild(ctl);

      var net=el('div','pkc pnet num');row.appendChild(net);
      var xc=cell('px'),x=el('button','legx','×');
      x.type='button';
      x.addEventListener('click',function(){
        if(armed!=='rm'+p.id){arm('rm'+p.id);return}
        armed='';clearTimeout(armT);
        G.ps=G.ps.filter(function(q){return q!==p});
        save();drawRows();
      });
      xc.appendChild(x);row.appendChild(xc);

      rows.appendChild(row);
      R[p.id]={row:row,cnt:cnt,minus:minus,inI:mi.i,outI:mo.i,net:net,x:x};
    });

    var tot=el('div','pkrow tot'),tc=el('div','pkctl');
    var tn=cell('pnm');tn.appendChild(el('span','','Total'));tot.appendChild(tn);
    TOT={st:el('span','v num'),inn:el('span','v num'),out:el('span','v num'),net:el('div','pkc pnet num')};
    var a=cell('pst','Buy-ins'),b=cell('pin','In'),c=cell('pout','Cash-out');
    a.appendChild(TOT.st);b.appendChild(TOT.inn);c.appendChild(TOT.out);
    tc.appendChild(a);tc.appendChild(b);tc.appendChild(c);tot.appendChild(tc);
    tot.appendChild(TOT.net);tot.appendChild(cell('px'));
    rows.appendChild(tot);
    paint();
  }

  function paint(){
    var ps=G.ps,n=ps.length,tin=0,tout=0,miss=[];
    ps.forEach(function(p){tin+=inOf(p);if(p.out===null)miss.push(p.name);else tout+=p.out});
    var ready=n>=2&&!miss.length,gap=ready?tout-tin:0;
    /* a split answers one gap; once the count is square it is spent */
    if(ready&&!gap&&G.split){G.split=false;save()}
    var nets=ps.map(function(p){return p.out===null?null:p.out-inOf(p)});
    var sp=(ready&&gap&&G.split)?pkSplit(nets):null;

    var nb=$('#pk-new');
    nb.textContent=armed==='new'?'Clear the table?':'New game ×';
    nb.classList.toggle('arm',armed==='new');

    ps.forEach(function(p,i){
      var r=R[p.id];if(!r)return;
      var c=inOf(p),hot=(armed==='rm'+p.id);
      var ct=count(c);
      r.cnt.textContent=ct;
      r.cnt.className='num'+(ct.length>3?' sm':'');   /* "12.51" has to fit a phone's stepper */
      r.minus.disabled=!(c>0);
      if(document.activeElement!==r.inI)r.inI.value=plain(c);
      r.x.setAttribute('aria-label',hot?'Press again to remove '+p.name:'Remove '+p.name);
      r.row.classList.toggle('arm',hot);
      if(hot){r.net.className='pkc pnet loss';r.net.textContent='Remove?';return}
      if(nets[i]===null){r.net.className='pkc pnet num mut';r.net.textContent='--';return}
      var v=sp?sp.net[i]:nets[i];
      r.net.className='pkc pnet num '+(v>0?'win':v<0?'loss':'mut');
      r.net.textContent=pkSigned(v);
      if(sp&&sp.share[i])r.net.appendChild(el('i','','split '+pkSigned(-sp.share[i])));
    });
    if(TOT){
      TOT.st.textContent=count(tin);
      TOT.inn.textContent=pkMoney(tin);
      TOT.out.textContent=pkMoney(tout);
      TOT.net.className='pkc pnet num '+(ready?(gap?'loss':'mut'):'mut');
      TOT.net.textContent=ready?pkSigned(gap):'--';
    }

    var f=$('#pk-fine');f.innerHTML='';
    if(warn)f.appendChild(el('span','loss',warn));
    else if(!n)f.textContent='Set the buy-in, then add everyone at the table.';
    else f.textContent=n+(n===1?' player':' players')+
      (G.buy>0?' · '+count(tin)+' buy-ins':'')+' · '+pkMoney(tin)+' in';

    /* the settle-up card */
    $('#pk-np').textContent=String(n);
    $('#pk-tin').textContent=pkMoney(tin);
    $('#pk-tout').textContent=pkMoney(tout);
    var ge=$('#pk-gap'),gn=$('#pk-gapn');
    if(!ready){ge.textContent='--';ge.className='num mut';gn.textContent=n>=2?'waiting':''}
    else if(!gap){ge.textContent='$0.00';ge.className='num';gn.textContent='square'}
    else{ge.textContent=pkMoney(gap);ge.className='num loss';gn.textContent=gap<0?'short':'over'}

    var msg,btn=$('#pk-split'),pay=$('#pk-pay'),showPay=ready&&(!gap||G.split),tx=[];
    if(n<2)msg=n?'Add at least one more player.':'Add the players to start.';
    else if(miss.length)msg='Waiting on a cash-out from '+names(miss)+'.';
    else if(!gap)msg='The count is square.';
    else if(!G.split)msg='The cash-outs come to '+pkMoney(tout)+' against '+pkMoney(tin)+
      ' bought in, so '+pkMoney(gap)+(gap<0?' is missing.':' more is claimed than was put in.')+
      ' Recount the chips, or split the gap across the table.';
    else msg=pkMoney(gap)+(gap<0?' was missing':' too much was counted')+
      '. It is split across the table by the size of each result.';
    btn.hidden=!(ready&&gap);
    btn.textContent=G.split?'Undo split':'Split the '+pkMoney(gap);

    LAST=null;pay.innerHTML='';
    if(showPay){
      var people=ps.map(function(p,i){return {name:p.name,net:sp?sp.net[i]:nets[i]}});
      tx=pkSettle(people);
      msg+=' '+(tx.length?tx.length+(tx.length===1?' payment settles':' payments settle')+' the table.'
        :'Nobody owes anything.');
      var h=el('div','prow hd');
      ['Pays','To','Amount'].forEach(function(t){h.appendChild(el('div','',t))});
      pay.appendChild(h);
      tx.forEach(function(t){
        var r=el('div','prow');
        r.appendChild(el('div','',t.from));r.appendChild(el('div','',t.to));
        r.appendChild(el('div','num',pkMoney(t.amt)));
        pay.appendChild(r);
      });
      LAST={tin:tin,gap:sp?gap:0,people:people,tx:tx};
    }
    pay.hidden=!(showPay&&tx.length);
    $('#pk-msg').textContent=msg;
    $('#pk-copy').disabled=!LAST;
  }

  /* the results as plain text, for the group chat */
  function report(){
    if(!LAST)return '';
    var L=[],d=new Date();
    L.push('Poker settle-up · '+d.toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric'}));
    L.push((G.buy>0?'$'+plain(G.buy)+' buy-in · ':'')+G.ps.length+' players · '+pkMoney(LAST.tin)+' in');
    L.push('');
    LAST.people.slice().sort(function(a,b){return b.net-a.net})
      .forEach(function(p){L.push(p.name+' '+pkSigned(p.net))});
    if(LAST.tx.length){
      L.push('');
      LAST.tx.forEach(function(t){L.push(t.from+' pays '+t.to+' '+pkMoney(t.amt))});
    }
    if(LAST.gap){
      L.push('');
      L.push(pkMoney(LAST.gap)+(LAST.gap<0?' was missing from the count':' too much was counted')+
        ', split across the table by the size of each result.');
    }
    if(/^https?:$/.test(location.protocol))L.push('',location.host+location.pathname);
    return L.join('\n');
  }

  function add(){
    var inp=$('#pk-name'),name=cleanName(inp.value),dup=taken(name,0);
    if(!name){inp.focus();return}
    if(G.ps.length>=MAXP)warn='The table is full at '+MAXP+' players.';
    else if(dup)warn=dup.name+' is already at the table.';
    else{
      warn='';
      G.ps.push({id:++G.seq,name:name,n:1,extra:0,out:null});
      inp.value='';save();drawRows();
    }
    flag(inp,!warn);paint();inp.focus();
  }
  $('#pk-add').addEventListener('click',add);
  $('#pk-name').addEventListener('keydown',function(e){if(e.key==='Enter'){e.preventDefault();add()}});
  $('#pk-name').addEventListener('input',function(){
    if(warn){warn='';flag($('#pk-name'),true);paint()}
  });

  var bi=$('#pk-buy');
  bi.addEventListener('input',function(){
    var c=pkCents(bi.value);
    if(c!==c||c>CAP){flag(bi,false);return}
    flag(bi,true);G.buy=c||0;save();paint();
  });
  bi.addEventListener('blur',function(){bi.value=G.buy?plain(G.buy):'';flag(bi,true)});
  bi.addEventListener('keydown',function(e){
    if(e.key==='Enter'){e.preventDefault();$('#pk-name').focus()}
  });

  $('#pk-new').addEventListener('click',function(){
    if(!G.ps.length){$('#pk-name').focus();return}
    if(armed!=='new'){arm('new');return}
    armed='';clearTimeout(armT);warn='';
    G=fresh(G.buy);save();drawRows();$('#pk-name').focus();
  });
  $('#pk-split').addEventListener('click',function(){G.split=!G.split;save();paint()});
  $('#pk-copy').addEventListener('click',function(){
    var t=report(),b=this;if(!t)return;
    function ok(){
      b.textContent='Copied';b.classList.add('done');
      setTimeout(function(){b.textContent='Copy results';b.classList.remove('done')},1600);
    }
    if(navigator.clipboard&&navigator.clipboard.writeText)
      navigator.clipboard.writeText(t).then(ok,function(){window.prompt('Copy the results',t)});
    else window.prompt('Copy the results',t);
  });

  /* a shared link lands here: the address fills #pk-game, and the table it
     carries replaces this browser's own */
  $('#pk-game').addEventListener('input',function(){
    var g=decode(this.value);if(!g)return;
    G=g;armed='';warn='';save();
    bi.value=G.buy?plain(G.buy):'';
    drawRows();
    /* the address has done its job; a reload should show later edits, not the link again */
    if(history.replaceState){try{history.replaceState(null,'',here())}catch(e){}}
  });

  load();
  bi.value=G.buy?plain(G.buy):'';
  $('#pk-game').value=encode();
  drawRows();
})();

/* ---------- shareable tool links ---------- */
/* A tool page keeps its numbers in the query string, so a filled-in calculator
   can be pasted to someone and open exactly as it was left. */
(function(){
  var FIELDS={
    arb:['ar-a','ar-b','ar-sa','ar-sb'],
    hedge:['hg-o','hg-s','hg-h','hg-hs','hg-c'],
    odds:['pc-in','pc-o','pc-m'],
    devig:['dv-a','dv-b'],
    parlay:['pl-s'],
    payout:['py-s','py-f','py-dec','py-ps','py-pf'],
    poker:['pk-game']
  };
  function q(){
    var s=location.search.slice(1);
    if(!s)return {};
    var out={};
    s.split('&').forEach(function(kv){
      var p=kv.split('=');if(p[0])out[decodeURIComponent(p[0])]=decodeURIComponent(p[1]||'')});
    return out}
  function fire(e){e.dispatchEvent(new Event('input',{bubbles:true}))}

  /* fill a tool from the address bar, once, on arrival */
  (function apply(){
    var v=TOOL,f=FIELDS[v];
    if(!f)return;
    var p=q(),any=false;
    f.forEach(function(id){var e=$('#'+id);
      if(e&&p[id]!=null&&p[id]!==''){e.value=p[id];any=true}});
    if(v==='parlay'&&p.legs){
      var want=p.legs.split(',');
      var add=$('#pl-add');
      while(document.querySelectorAll('#pl-legs input').length<want.length&&!add.disabled)add.click();
      var ins=document.querySelectorAll('#pl-legs input');
      want.forEach(function(val,i){if(ins[i]){ins[i].value=val;fire(ins[i])}});
      if(p.mode){var mb=document.querySelector('#pl-mode .sg[data-m="'+p.mode+'"]');if(mb)mb.click()}
      any=true;
    }
    if(v==='payout'){
      if(p.mode){var pmb=document.querySelector('#py-mode .sg[data-m="'+p.mode+'"]');
        if(pmb){pmb.click();any=true}}
      if(p.legs){
        var pw=p.legs.split(','),padd=$('#py-add');
        while(document.querySelectorAll('#py-legs input').length<pw.length&&!padd.disabled)padd.click();
        var pins=document.querySelectorAll('#py-legs input');
        pw.forEach(function(val,i){if(pins[i]){pins[i].value=val;fire(pins[i])}});
        any=true;
      }
    }
    if(v==='devig'&&p.m){
      var b=document.querySelector('#view-devig .sg[data-m="'+p.m+'"]');if(b)b.click()}
    if(any){f.forEach(function(id){var e=$('#'+id);if(e)fire(e)})}
  })();

  [].slice.call(document.querySelectorAll('.tlink')).forEach(function(btn){
    btn.addEventListener('click',function(){
      var k=btn.getAttribute('data-k'),parts=[];
      (FIELDS[k]||[]).forEach(function(id){
        var e=$('#'+id);
        if(e&&e.value.trim())parts.push(id+'='+encodeURIComponent(e.value.trim()))});
      if(k==='parlay'){
        var vals=[].slice.call(document.querySelectorAll('#pl-legs input'))
          .map(function(e){return e.value.trim()}).filter(Boolean);
        if(vals.length)parts.push('legs='+encodeURIComponent(vals.join(',')));
        var on=document.querySelector('#pl-mode .sg.on');
        if(on)parts.push('mode='+on.getAttribute('data-m'));
      }
      if(k==='payout'){
        var pm=document.querySelector('#py-mode .sg.on');
        if(pm)parts.push('mode='+pm.getAttribute('data-m'));
        var pv=[].slice.call(document.querySelectorAll('#py-legs input'))
          .map(function(e){return e.value.trim()}).filter(Boolean);
        if(pv.length)parts.push('legs='+encodeURIComponent(pv.join(',')));
      }
      if(k==='devig'){
        var d=document.querySelector('#view-devig .sg.on');
        if(d)parts.push('m='+d.getAttribute('data-m'));
      }
      var url=here()+(parts.length?'?'+parts.join('&'):'');
      function ok(){btn.textContent='Copied';btn.classList.add('done');
        setTimeout(function(){btn.textContent='Copy link';btn.classList.remove('done')},1600)}
      if(navigator.clipboard&&navigator.clipboard.writeText){
        navigator.clipboard.writeText(url).then(ok,function(){window.prompt('Copy this link',url)});
      }else{window.prompt('Copy this link',url)}
    });
  });
})();

/* ---------- motion: a changed figure settles into place ---------- */
(function(){
  if(!window.PT||!window.MutationObserver)return;
  var figs=[].slice.call(document.querySelectorAll('.asum span,.dv,.out'));
  if(!figs.length)return;
  var mo=new MutationObserver(function(list){
    if(!PT.moving())return;
    var seen=[];
    list.forEach(function(m){
      var t=m.target.nodeType===1?m.target:m.target.parentNode;
      if(!t||seen.indexOf(t)>=0)return;seen.push(t);
      t.classList.remove('tickd');void t.offsetWidth;t.classList.add('tickd');
    });
  });
  /* armed after the first paint, so arriving on the page does not flicker */
  setTimeout(function(){
    figs.forEach(function(f){mo.observe(f,{childList:true,characterData:true,subtree:true})});
  },0);
})();
})();
