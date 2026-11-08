/* Relatório mensal Matos: PDF consolidado no navegador com anexos privados. */
(function(){
'use strict';
var loader=null,CDNS=[
 'https://cdn.jsdelivr.net/npm/pdf-lib@1.17.1/dist/pdf-lib.min.js',
 'https://unpkg.com/pdf-lib@1.17.1/dist/pdf-lib.min.js'
];
function loadPdfLib(){
 if(window.PDFLib&&window.PDFLib.PDFDocument)return Promise.resolve(window.PDFLib);
 if(loader)return loader;
 loader=(async function(){
  for(var i=0;i<CDNS.length;i++){
   try{
    await new Promise(function(ok,fail){var s=document.createElement('script');s.src=CDNS[i];s.crossOrigin='anonymous';s.onload=ok;s.onerror=function(){s.remove();fail(new Error('Biblioteca PDF indisponível'))};document.head.appendChild(s)});
    if(window.PDFLib&&window.PDFLib.PDFDocument)return window.PDFLib;
   }catch(_){}
  }
  throw new Error('Não foi possível carregar o gerador de PDF. Verifique sua conexão e tente novamente.')
 })().catch(function(e){loader=null;throw e});
 return loader
}
function readable(v){
 return String(v==null?'':v).replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim().split('').map(function(ch){
  var n=ch.charCodeAt(0);
  if(n>=32&&n<=255)return ch;
  return {'\u2013':'-','\u2014':'-','\u2018':"'",'\u2019':"'",'\u201c':'"','\u201d':'"','\u2026':'...'}[ch]||'?'
 }).join('')
}
function currency(n){return Number(n||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'})}
function dateBR(v){if(!v)return 'Não informada';var t=String(v).slice(0,10).split('-');return t.length===3?t[2]+'/'+t[1]+'/'+t[0]:readable(v)}
function moneyN(n){return Number(n||0).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2})}
function fit(str,font,size,maxWidth){
 var s=readable(str);
 if(font.widthOfTextAtSize(s,size)<=maxWidth)return s;
 while(s.length&&font.widthOfTextAtSize(s+'...',size)>maxWidth)s=s.slice(0,-1);
 return s+'...'
}
function wrap(str,font,size,maxWidth,maxLines){
 var words=readable(str).split(' '),lines=[],line='';
 for(var i=0;i<words.length;i++){
  var candidate=(line?line+' ':'')+words[i];
  if(font.widthOfTextAtSize(candidate,size)<=maxWidth){line=candidate;continue}
  if(line){lines.push(line);line=''}
  var remaining=words[i];
  while(remaining.length&&font.widthOfTextAtSize(remaining,size)>maxWidth){
   var part=fit(remaining,font,size,maxWidth),raw=part.endsWith('...')?part.slice(0,-3):part;
   if(!raw){remaining='';break}
   lines.push(raw);remaining=remaining.slice(raw.length)
  }
  line=remaining
 }
 if(line)lines.push(line);
 if(lines.length>maxLines){
  lines=lines.slice(0,maxLines);
  lines[maxLines-1]=fit(lines[maxLines-1]+'...',font,size,maxWidth)
 }
 return lines.length?lines:['—']
}
function drawWrapped(page,text,font,size,x,y,width,color,maxLines,lineHeight){
 var lines=wrap(text,font,size,width,maxLines||2);
 lines.forEach(function(l,i){page.drawText(l,{x:x,y:y-i*(lineHeight||11),font:font,size:size,color:color})});
 return lines.length
}
function createPalette(lib){
 return {navy:lib.rgb(0.063,0.161,0.271),gold:lib.rgb(0.79,0.61,0.25),blue:lib.rgb(0.19,0.34,0.51),
  muted:lib.rgb(0.36,0.43,0.51),soft:lib.rgb(0.95,0.97,0.99),white:lib.rgb(1,1,1),ink:lib.rgb(0.12,0.18,0.24),
  green:lib.rgb(0.08,0.47,0.29),red:lib.rgb(0.63,0.16,0.18),stroke:lib.rgb(0.85,0.89,0.93)}
}
function basicHeader(page,title,sub,font,bold,pal){
 var w=page.getWidth(),h=page.getHeight();
 page.drawRectangle({x:0,y:h-69,width:w,height:69,color:pal.navy});
 page.drawRectangle({x:0,y:h-73,width:w,height:4,color:pal.gold});
 page.drawText(readable(title),{x:34,y:h-31,size:18,font:bold,color:pal.white});
 page.drawText(fit(sub,font,10,w-72),{x:35,y:h-51,size:10,font:font,color:pal.white});
}
function proofEntries(rows){
 return rows.filter(function(r){return r.charge&&r.charge.id&&r.charge.comprovante_path})
  .map(function(r,i){return {row:r,number:String(i+1).padStart(2,'0')}})
}
function proofMime(charge){
 var mime=String(charge.comprovante_tipo||'').toLowerCase().split(';')[0];
 if(mime==='application/pdf'||mime==='image/jpeg'||mime==='image/png'||mime==='image/webp')return mime;
 var path=String(charge.comprovante_path||'').toLowerCase();
 if(/\.pdf$/.test(path))return 'application/pdf';
 if(/\.png$/.test(path))return 'image/png';
 if(/\.webp$/.test(path))return 'image/webp';
 if(/\.(jpg|jpeg)$/.test(path))return 'image/jpeg';
 throw new Error('O tipo de arquivo do comprovante não é suportado.')
}
async function fetchPrivateProof(entry){
 var path=String(entry.row.charge.comprovante_path||''),segments=path.split('/').map(encodeURIComponent).join('/');
 if(!path||path.includes('..'))throw new Error('Caminho do comprovante inválido.');
 var response=await fetch(SUPA_URL+'/storage/v1/object/authenticated/comprovantes/'+segments,{
  method:'GET',headers:{apikey:KEY,Authorization:'Bearer '+session.access_token}
 });
 if(!response.ok)throw new Error('Não foi possível acessar o comprovante '+entry.number+' (HTTP '+response.status+'). Verifique suas permissões.');
 var bytes=await response.arrayBuffer();
 if(bytes.byteLength>10*1024*1024)throw new Error('O comprovante '+entry.number+' excede 10 MB.');
 if(bytes.byteLength===0)throw new Error('O comprovante '+entry.number+' está vazio.');
 return {bytes:bytes,type:proofMime(entry.row.charge)}
}
async function jpegForImage(raw,type){
 var blob=new Blob([raw],{type:type}),bitmap=null,url=null,img=null;
 try{
  if('createImageBitmap' in window){try{bitmap=await createImageBitmap(blob)}catch(_){}}
  if(!bitmap){
   url=URL.createObjectURL(blob);
   img=await new Promise(function(ok,fail){var node=new Image();node.onload=function(){ok(node)};node.onerror=function(){fail(new Error('A imagem não pôde ser decodificada.'))};node.src=url})
  }
  var w=bitmap?bitmap.width:img.naturalWidth,h=bitmap?bitmap.height:img.naturalHeight;
  if(!w||!h)throw new Error('Dimensões de imagem inválidas.');
  var s=Math.min(1,1700/w,2200/h),canvas=document.createElement('canvas');
  canvas.width=Math.max(1,Math.round(w*s));canvas.height=Math.max(1,Math.round(h*s));
  var ctx=canvas.getContext('2d');if(!ctx)throw new Error('O navegador não permite converter a imagem.');
  ctx.fillStyle='#ffffff';ctx.fillRect(0,0,canvas.width,canvas.height);
  ctx.drawImage(bitmap||img,0,0,canvas.width,canvas.height);
  var jpg=await new Promise(function(ok,fail){canvas.toBlob(function(b){b?ok(b):fail(new Error('Não foi possível converter a imagem.'))},'image/jpeg',0.88)});
  return await jpg.arrayBuffer()
 }finally{if(bitmap&&bitmap.close)bitmap.close();if(url)URL.revokeObjectURL(url)}
}
function download(bytes,k){
 var url=URL.createObjectURL(new Blob([bytes],{type:'application/pdf'})),a=document.createElement('a');
 a.href=url;a.download='Matos_Relatorio_'+k+'_com_comprovantes.pdf';a.style.display='none';document.body.appendChild(a);a.click();a.remove();
 setTimeout(function(){URL.revokeObjectURL(url)},60000)
}
async function exportReport(k,rows,progress){
 if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(k))throw new Error('Competência mensal inválida.');
 var lib=await loadPdfLib(),doc=await lib.PDFDocument.create(),pal=createPalette(lib);
 doc.setTitle('Matos - Relatório mensal '+k+' com comprovantes');doc.setAuthor('Matos - Gestão de Aluguéis');
 var normal=await doc.embedFont(lib.StandardFonts.Helvetica),bold=await doc.embedFont(lib.StandardFonts.HelveticaBold);
 var entries=proofEntries(rows),byId={};entries.forEach(function(e){byId[e.row.charge.id]=e.number});
 var paid=rows.filter(function(r){return r.status==='pago'}),pending=rows.filter(function(r){return r.status!=='pago'});
 var totals={expected:rows.reduce(function(s,r){return s+Number(r.expected||0)},0),
  paid:rows.reduce(function(s,r){return s+Number(r.paid||0)},0),
  pending:rows.reduce(function(s,r){return s+Number(r.pending||0)},0)};
 var landscape=[841.89,595.28],margin=32,w=landscape[0],mainPages=[],page=null,y=0;
 function newPage(){
  page=doc.addPage(landscape);mainPages.push(page);
  basicHeader(page,'MATOS | Relatório mensal','Competência: '+k+'  |  Emitido em '+new Date().toLocaleDateString('pt-BR'),normal,bold,pal);
  y=landscape[1]-96
 }
 function text(str,x,yy,size,font,color,maxWidth){
  page.drawText(maxWidth?fit(str,font||normal,size,maxWidth):readable(str),{x:x,y:yy,size:size,font:font||normal,color:color||pal.ink})
 }
 function ensure(height){if(y-height<48)newPage()}
 function bar(label,number,accent){
  var bw=(w-2*margin-20)/3,x=margin+number*(bw+10),cy=y-53;
  page.drawRectangle({x:x,y:cy,width:bw,height:53,color:pal.soft,borderColor:pal.stroke,borderWidth:0.7});
  page.drawRectangle({x:x,y:cy,width:3,height:53,color:accent});
  text(label,x+13,cy+35,9,bold,pal.muted);
  text(currency([totals.expected,totals.paid,totals.pending][number]),x+13,cy+13,15,bold,pal.navy,bw-22)
 }
 newPage();
 bar('Previsto',0,pal.gold);bar('Recebido',1,pal.green);bar('Pendente',2,pal.red);y-=75;
 text(rows.length+' locações  |  '+paid.length+' pagas  |  '+pending.length+' pendentes  |  '+entries.length+' comprovantes privados',margin,y,9,normal,pal.muted);
 y-=26;
 // 777 pt cabem na largura útil do A4 em paisagem. Incluir data real, nunca presumida.
 var cols=[{title:'INQUILINO',width:151},{title:'IMÓVEL',width:144},{title:'VENCIMENTO',width:69},
  {title:'PREVISTO',width:72},{title:'RECEBIDO',width:72},{title:'PAGO EM',width:79},
  {title:'SITUAÇÃO',width:65},{title:'COMPROVANTE',width:125}];
 var rowsize=31;
 function tableHeading(){
  var x=margin;
  page.drawRectangle({x:margin,y:y-23,width:w-2*margin,height:25,color:pal.navy});
  cols.forEach(function(col){text(col.title,x+5,y-16,7.3,bold,pal.white,col.width-10);x+=col.width});
  y-=25
 }
 function section(name,list){
  ensure(85);
  text(name+' ('+list.length+')',margin,y,13,bold,pal.navy);y-=18;
  tableHeading();
  if(!list.length){
   ensure(35);text('Nenhum lançamento nesta situação.',margin+8,y-17,9,normal,pal.muted);y-=33;return
  }
  list.forEach(function(r,i){
   if(y-rowsize<48){newPage();tableHeading()}
   var x=margin,bg=i%2===0?pal.soft:pal.white;
   page.drawRectangle({x:margin,y:y-rowsize,width:w-2*margin,height:rowsize,color:bg});
   var values=[r.tenant&&r.tenant.nome||'—',r.property&&r.property.nome||'—',dateBR(r.due),
    moneyN(r.expected),moneyN(r.paid),r.charge&&r.charge.data_pagamento?dateBR(r.charge.data_pagamento):'Não informada',
    r.status==='pago'?'Pago':'Pendente',r.charge&&byId[r.charge.id]?'Comprovante '+byId[r.charge.id]:'Sem anexo'];
   cols.forEach(function(col,j){
    if(j<=1)drawWrapped(page,values[j],normal,8.1,x+5,y-12,col.width-11,pal.ink,2,10);
    else if(j===3||j===4){
     var val=fit(values[j],normal,8,col.width-10);
     text(val,x+col.width-5-normal.widthOfTextAtSize(val,8),y-18,8,normal,pal.ink)
    }else{
     var size=j===5?7.2:8;
     text(values[j],x+5,y-18,size,j===6?bold:normal,j===6?(r.status==='pago'?pal.green:pal.red):pal.ink,col.width-10)
    }
    x+=col.width
   });
   y-=rowsize
  });
  y-=22
 }
 section('Aluguéis pagos',paid);section('Aluguéis pendentes',pending);
 ensure(75);text('Índice de comprovantes vinculados',margin,y,13,bold,pal.navy);y-=20;
 if(!entries.length){text('Nenhum comprovante anexado nesta competência.',margin,y-6,9,normal,pal.muted);y-=24}
 entries.forEach(function(entry){
  ensure(24);
  var r=entry.row,raw='Comprovante '+entry.number+'  |  '+(r.tenant&&r.tenant.nome||'Inquilino')+'  |  '+(r.property&&r.property.nome||'Imóvel')
   +'  |  '+currency(r.paid)+'  |  '+(r.charge.data_pagamento?dateBR(r.charge.data_pagamento):'data não informada');
  text(raw,margin,y-5,9,normal,pal.ink,w-2*margin);
  y-=18
 });
 ensure(35);text('Pagamentos sem comprovante são identificados como \'Sem anexo\'. Datas não informadas não são presumidas.',margin,y-8,8,normal,pal.muted,w-2*margin);
 mainPages.forEach(function(p,i){p.drawText('Matos - Gestao de Alugueis  •  '+k+'  •  Relatorio '+(i+1)+'/'+mainPages.length,
  {x:margin,y:23,size:8,font:normal,color:pal.muted})});
 for(var i=0;i<entries.length;i++){
  var entry=entries[i],r=entry.row,charge=r.charge;
  if(progress)progress(i+1,entries.length);
  var file;
  try{file=await fetchPrivateProof(entry)}catch(e){throw new Error('Anexo '+entry.number+': '+e.message)}
  try{
   if(file.type==='application/pdf'){
    var cover=doc.addPage([595.28,841.89]);
    basicHeader(cover,'COMPROVANTE '+entry.number,'Anexo documental · competência '+k,normal,bold,pal);
    cover.drawText('Inquilino: '+fit(r.tenant&&r.tenant.nome||'—',normal,11,495),{x:45,y:717,size:11,font:normal,color:pal.ink});
    cover.drawText('Imóvel: '+fit(r.property&&r.property.nome||'—',normal,11,495),{x:45,y:681,size:11,font:normal,color:pal.ink});
    cover.drawText('Competência: '+k+'  |  Pago: '+currency(r.paid)+'  |  Data: '+dateBR(charge.data_pagamento),{x:45,y:645,size:10,font:normal,color:pal.ink});
    drawWrapped(cover,'Arquivo: '+(charge.comprovante_nome||'comprovante.pdf'),normal,10,45,607,505,pal.ink,3,13);
    cover.drawText('O comprovante original está incorporado integralmente nas páginas seguintes.',{x:45,y:540,size:10,font:normal,color:pal.muted});
    var original=await lib.PDFDocument.load(file.bytes),idx=original.getPageIndices();
    if(!idx.length)throw new Error('O PDF não contém páginas.');
    var copied=await doc.copyPages(original,idx);copied.forEach(function(p){doc.addPage(p)})
   }else{
    var jpg=await jpegForImage(file.bytes,file.type),im=await doc.embedJpg(jpg),imgPage=doc.addPage([595.28,841.89]);
    basicHeader(imgPage,'COMPROVANTE '+entry.number,'Documento digital · competência '+k,normal,bold,pal);
    imgPage.drawText('Inquilino: '+fit(r.tenant&&r.tenant.nome||'—',normal,10,510),{x:38,y:738,size:10,font:normal,color:pal.ink});
    imgPage.drawText('Imóvel: '+fit(r.property&&r.property.nome||'—',normal,10,510),{x:38,y:716,size:10,font:normal,color:pal.ink});
    imgPage.drawText('Competência: '+k+' | Recebido: '+currency(r.paid)+' | Data: '+dateBR(charge.data_pagamento),{x:38,y:694,size:9,font:normal,color:pal.ink});
    imgPage.drawText('Arquivo: '+fit(charge.comprovante_nome||'comprovante',normal,9,510),{x:38,y:674,size:9,font:normal,color:pal.muted});
    var dims=im.scale(Math.min(520/im.width,615/im.height)),px=(595.28-dims.width)/2,py=36+(615-dims.height)/2;
    imgPage.drawRectangle({x:35,y:33,width:525,height:620,color:pal.white,borderColor:pal.stroke,borderWidth:0.7});
    imgPage.drawImage(im,{x:px,y:py,width:dims.width,height:dims.height})
   }
  }catch(error){throw new Error('Anexo '+entry.number+' ('+readable(charge.comprovante_nome||'arquivo')+'): '+error.message+'. Nenhum PDF parcial foi gerado.')}
 }
 var bytes=await doc.save();download(bytes,k);return {paginas:doc.getPageCount(),anexos:entries.length}
}
window.MatosMonthlyReport={export:exportReport,proofEntries:proofEntries};
})();
