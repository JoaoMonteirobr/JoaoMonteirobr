/* Tema "LED dot-matrix" (teste): tela de entrada com pontos animados e enfeite parado no Dashboard. Só aparência; a lógica do app continua a mesma. */
(function(){
'use strict';
var LOOP=20,LEVELS=[0,.26,.52,.78,1],TW=420,TH=Math.round(420*.481);
function hash(a,b){var x=Math.sin(a*127.1+b*311.7)*43758.5453;return x-Math.floor(x)}
function smooth(a,b,x){var t=Math.min(1,Math.max(0,(x-a)/(b-a)));return t*t*(3-2*t)}
function mixAt(t,on,off,dur){return smooth(on,on+dur,t)*(1-smooth(off,off+dur,t))}

// Desenhos-fonte em tons de cinza: prédios (pose A) e casas (pose B). Cinza médio vira ponto grande; claro, ponto pequeno.
function tile(draw,mirror){var c=document.createElement('canvas');c.width=TW;c.height=TH;var g=c.getContext('2d');g.fillStyle='#fff';g.fillRect(0,0,TW,TH);if(mirror){g.translate(TW,0);g.scale(-1,1)}draw(g);return c}
function shade(g,x,y,w,h,a,b){var gr=g.createLinearGradient(x,0,x+w,0);gr.addColorStop(0,a);gr.addColorStop(1,b);g.fillStyle=gr;g.fillRect(x,y,w,h)}
function windows(g,x,y,w,h,cw,ch,col){g.fillStyle=col;for(var yy=y+10;yy<y+h-14;yy+=ch*2)for(var xx=x+8;xx<x+w-cw-4;xx+=cw*2)g.fillRect(xx,yy,cw,ch)}
function buildings(g){
 shade(g,0,40,120,TH-40,'#555','#6d6d6d');windows(g,0,40,120,TH-40,9,7,'#d9d9d9');
 shade(g,110,10,90,TH-10,'#444','#5e5e5e');windows(g,110,10,90,TH-10,8,8,'#cfcfcf');
 shade(g,195,70,80,TH-70,'#666','#7a7a7a');windows(g,195,70,80,TH-70,7,6,'#e2e2e2');
 shade(g,270,115,70,TH-115,'#777','#8a8a8a');windows(g,270,115,70,TH-115,6,6,'#e6e6e6');
 g.fillStyle='#4a4a4a';g.fillRect(150,0,4,12);
}
function houses(g){
 function house(x,w,h,tone){var y=TH-h;shade(g,x,y,w,h,tone,'#808080');g.fillStyle='#3d3d3d';g.beginPath();g.moveTo(x-10,y);g.lineTo(x+w/2,y-w*.42);g.lineTo(x+w+10,y);g.closePath();g.fill();g.fillStyle='#e4e4e4';g.fillRect(x+w*.15,y+h*.22,w*.22,h*.22);g.fillRect(x+w*.62,y+h*.22,w*.22,h*.22);g.fillStyle='#2e2e2e';g.fillRect(x+w*.42,y+h*.5,w*.17,h*.5)}
 house(0,150,105,'#5a5a5a');house(170,120,85,'#6a6a6a');house(305,70,55,'#777');
}
var tiles=null;
function getTiles(){if(!tiles)tiles={LA:tile(buildings,false),RA:tile(buildings,true),LB:tile(houses,false),RB:tile(houses,true)};return tiles}

// Grade de pontos LED: cada pixel do "campo" vira um ponto, em 5 tamanhos.
function Grid(cv,density){
 var self=this;self.cv=cv;self.ctx=cv.getContext('2d');
 self.resize=function(){
  var r=cv.getBoundingClientRect();self.W=Math.max(1,r.width);self.H=Math.max(1,r.height);self.DPR=Math.min(2,window.devicePixelRatio||1);
  cv.width=self.W*self.DPR;cv.height=self.H*self.DPR;self.ctx.setTransform(self.DPR,0,0,self.DPR,0,0);
  self.step=Math.max(5,self.W/density);self.rowStep=self.step*2.05;self.cols=Math.ceil(self.W/self.step);self.rows=Math.ceil(self.H/self.rowStep);self.R=self.step*.46;
  self.seeds=new Float32Array(self.cols*self.rows);for(var j=0;j<self.rows;j++)for(var i=0;i<self.cols;i++)self.seeds[j*self.cols+i]=.55*hash(i,j)+.45*hash(j*3.1,7.7);
  self.fA=field();self.fB=field();
 };
 function field(){var c=document.createElement('canvas');c.width=self.cols;c.height=self.rows;return c.getContext('2d',{willReadFrequently:true})}
 self.clearFields=function(){[self.fA,self.fB].forEach(function(g){g.setTransform(1,0,0,1,0,0);g.fillStyle='#fff';g.fillRect(0,0,self.cols,self.rows)})};
 // weight(i,j) devolve 0..1 para apagar pontos em zonas de texto.
 self.draw=function(t,mL,mR,weight,glitch){
  var dA=self.fA.getImageData(0,0,self.cols,self.rows).data,dB=self.fB.getImageData(0,0,self.cols,self.rows).data,ctx=self.ctx,cols=self.cols;
  ctx.clearRect(0,0,self.W,self.H);ctx.fillStyle='#0d0d0d';ctx.beginPath();
  var tick=Math.floor(t*7);
  for(var j=0;j<self.rows;j++){
   var shift=glitch&&hash(j,tick)>.965?Math.round((hash(tick,j)-.5)*8):0;
   for(var i=0;i<cols;i++){
    var si=Math.min(cols-1,Math.max(0,i-shift)),seed=self.seeds[j*cols+i],m=i<cols/2?mL:mR,d=seed<m?dB:dA;
    var v=Math.min(1,Math.max(0,(1-d[(j*cols+si)*4]/255-.16)/.42));if(!v)continue;
    if(m>.001&&m<.999){var dd=Math.abs(seed-m);if(dd<.12){v*=dd/.12;if(hash(i+tick,j)<=.4)v*=.3}}
    if(glitch)v*=.86+.14*Math.sin(t*3.2+seed*40);
    v*=weight(i,j);if(v<=0)continue;
    var lv=0;for(var k=LEVELS.length-1;k>0;k--)if(v>=LEVELS[k]-.13){lv=k;break}
    if(!lv)continue;var r=lv===1?self.R*.38:self.R*LEVELS[lv],x=(i+.5)*self.step,y=(j+.5)*self.rowStep;
    ctx.moveTo(x+r,y);ctx.arc(x,y,r,0,6.2832);
   }
  }
  ctx.fill();
 };
 // Desenha um bloco-fonte no campo, com deriva, "respiração" e leve rotação.
 self.place=function(g,img,left,t,hwF,cyF,motion){
  var W=self.W,H=self.H,a=2*Math.PI*t/LOOP,ph=left?0:Math.PI,hw=W*hwF,hh=hw*.481,cy=H*cyF;
  var reach=motion?(.035*Math.sin(a+ph)+.012*Math.sin(2*a+1.3+ph))*W:0,sc=motion?1+.07*Math.sin(a+.9+ph):1,rot=motion?(left?1:-1)*.045*Math.sin(a+2.1+ph):0;
  var x=left?reach-W*.045:W-hw+W*.045-reach,px=left?0:W;
  g.setTransform(self.cols/W,0,0,self.rows/H,0,0);g.translate(px,cy);g.rotate(rot);g.scale(sc,sc);g.translate(-px,-cy);
  g.imageSmoothingQuality='high';g.drawImage(img,x,cy-hh/2,hw,hh);
 };
 self.resize();
}

// ---------- Tela de entrada ----------
var ICONS=[['M10 1l9 4-9 4-9-4zm-9 8l9 4 9-4v3l-9 4-9-4zm0 5l9 4 9-4v2l-9 4-9-4z','Imóveis'],['M10 1a9 9 0 110 18 9 9 0 010-18zm0 3a6 6 0 100 12 6 6 0 000-12zm0 3a3 3 0 110 6 3 3 0 010-6z','Pagamentos'],['M10 1l8 4.5v9L10 19l-8-4.5v-9zM10 6l-4 2.3v4.4L10 15l4-2.3V8.3z','Contratos'],['M1 17L7 6l3 5 3-7 6 13z','Gastos'],['M1 5q4.5-3 9 0t9 0v3q-4.5 3-9 0t-9 0zm0 7q4.5-3 9 0t9 0v3q-4.5 3-9 0t-9 0z','Relatórios'],['M3 15c0-7 5-12 14-12-1 9-6 14-13 13l-1 2-2-1z','IPTU']];
window.login=function(){
 APP.innerHTML='<div class="led-auth"><canvas id="led_dots"></canvas><nav><div class="brand"><img src="/logo-casa-matos.png?v=1" alt="Casa Matos">Matos</div><button class="pill" data-led-open type="button">Entrar</button></nav><div class="copy"><h1><span>Seus imóveis,</span>em ordem.</h1><p>Aluguéis, contratos, gastos e comprovantes da família Matos em um só lugar.</p><div class="cta"><button data-led-open type="button">Entrar no sistema</button></div></div><div class="feats">'+ICONS.map(function(x){return '<span><svg viewBox="0 0 20 20"><path d="'+x[0]+'"/></svg>'+x[1]+'</span>'}).join('')+'</div></div>'
 +'<div class="led-veil" id="led_veil"><div class="led-card" role="dialog" aria-modal="true" aria-labelledby="led_title"><button type="button" class="led-x" id="led_x" aria-label="Fechar">×</button><h2 id="led_title">Entrar</h2><small>Área segura da Matos, Gestão de aluguéis.</small><div id="msg"></div>'
 +'<label class="lbl" for="email">Telefone ou e-mail</label><input id="email" class="inp" type="text" inputmode="text" autocomplete="username" placeholder="(68) 99999-9999 ou e-mail">'
 +'<label class="lbl" for="senha">Senha</label><div class="pw"><input id="senha" class="inp" type="password" autocomplete="current-password" placeholder="Digite sua senha"><button id="eye" class="eye" type="button" aria-label="Mostrar senha">◉</button></div>'
 +'<button id="signin" class="btn primary">Entrar no sistema</button><div class="notice" style="margin-top:12px">Novos acessos são cadastrados pelo administrador do sistema.</div>'
 +'<div class="links"><button id="recover" class="link" type="button">Esqueci minha senha</button><span>Conexão segura</span></div></div></div>';
 var veil=E('led_veil');
 function open(){veil.classList.add('open');E('email').focus()}
 Array.prototype.forEach.call(document.querySelectorAll('[data-led-open]'),function(b){b.onclick=open});
 E('led_x').onclick=function(){veil.classList.remove('open')};
 veil.onclick=function(e){if(e.target===veil)veil.classList.remove('open')};
 E('senha').onkeydown=E('email').onkeydown=function(e){if(e.key==='Enter')signin()};
 E('eye').onclick=function(){var p=E('senha');p.type=p.type==='password'?'text':'password'};
 E('signin').onclick=signin;E('recover').onclick=recover;
 animateLogin(E('led_dots'));
};
function animateLogin(cv){
 var T=getTiles(),grid=new Grid(cv,205),t0=performance.now();
 function onResize(){if(document.body.contains(cv))grid.resize()}
 window.addEventListener('resize',onResize);
 function frame(now){
  if(!document.body.contains(cv)){window.removeEventListener('resize',onResize);return}
  var t=(((now-t0)/1000)%LOOP+LOOP)%LOOP,portrait=grid.H>grid.W,hwF=portrait?.66:.53,cyF=portrait?.66:.54,qw=portrait?.44:.2,qc=portrait?.33:.385;
  grid.clearFields();grid.place(grid.fA,T.LA,true,t,hwF,cyF,true);grid.place(grid.fA,T.RA,false,t,hwF,cyF,true);grid.place(grid.fB,T.LB,true,t,hwF,cyF,true);grid.place(grid.fB,T.RB,false,t,hwF,cyF,true);
  grid.draw(t,mixAt(t,6.2,14.6,1.6),mixAt(t,2.4,10.4,1.6),function(i,j){var cx=Math.abs((i+.5)/grid.cols-.5),ey=((j+.5)*grid.rowStep/grid.H-qc)/.085;return smooth(.035,.11,cx)*smooth(.85,1.25,Math.hypot(cx/qw,ey))},true);
  requestAnimationFrame(frame);
 }
 requestAnimationFrame(frame);
}
// Se a tela antiga já tiver sido montada antes deste arquivo carregar, troca pela nova.
if(document.querySelector('.auth')&&!(window.session&&session.access_token))window.login();

// ---------- Enfeite parado no Dashboard ----------
function drawBanner(cv){
 var T=getTiles(),grid=new Grid(cv,230);
 grid.clearFields();grid.place(grid.fA,T.RA,false,0,.4,.56,false);
 grid.draw(3,0,0,function(i){var x=(i+.5)/grid.cols;return smooth(.32,.5,x)},false);
}
function addBanner(){
 if(typeof page==='undefined'||page!=='Dashboard')return;
 var c=E('content');if(!c||c.querySelector('.led-banner'))return;
 var bar=c.querySelector('.simple-toolbar');if(!bar)return;
 var nome=(window.currentProfile&&currentProfile.nome||'').split(' ')[0];
 bar.insertAdjacentHTML('afterend','<div class="led-banner"><canvas></canvas><div><b><span>'+(nome?'Olá, '+esc(nome)+'.':'Olá.')+'</span> Seus imóveis, em ordem.</b><small>Resumo do mês logo abaixo.</small></div></div>');
 drawBanner(c.querySelector('.led-banner canvas'));
}
var lastW=window.innerWidth;
window.addEventListener('resize',function(){if(Math.abs(window.innerWidth-lastW)<40)return;lastW=window.innerWidth;var cv=document.querySelector('.led-banner canvas');if(cv)drawBanner(cv)});

var queued=false;
new MutationObserver(function(){if(queued)return;queued=true;requestAnimationFrame(function(){queued=false;addBanner()})}).observe(document.body,{childList:true,subtree:true});
})();
