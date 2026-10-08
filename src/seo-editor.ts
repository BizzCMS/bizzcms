// SEO panel in the content editor (SEO plugin). Gathers the SEO fields (src/seo-fields.ts) into one card
// with three tabs, like Yoast SEO:
//   SEO      focus keyphrase, SEO title, meta description, Google preview, SEO and readability checks
//   Social   social title, description and image, with a share preview
//   Advanced noindex, nofollow, canonical, breadcrumb title, key content
// "Auto-fill SEO" fills every empty SEO field from the content (keyphrase, related keyphrases, title,
// description, image description). Scores are saved with the item (seoScore, readabilityScore), so the
// Content list can show them (SEO_LIST_SCRIPT). Inputs stay the real form inputs: saving is unchanged.
// Readability checks for passive voice and transition words are English only; the others work in any language.

export const SEO_EDITOR_SCRIPT = `<script>(function(){
var form=document.getElementById('content-form');if(!form||!form.querySelector('[name="focusKeyphrase"]'))return;
function q(n){return form.querySelector('[name="'+n+'"]')}
function val(n){var e=q(n);return e?String(e.value||'').trim():''}
function group(n){var e=q(n);return e?e.closest('.form-group'):null}
function esc(s){return String(s).replace(/[&<>"']/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})}
var col=val('collection_id'),ctx={siteName:location.hostname,tagline:'',origin:location.origin,used:[]};
var idm=location.pathname.match(/\\/admin\\/content\\/([^/]+)\\/edit/);
// ---- build the panel
var card=document.createElement('div');card.className='field-group rounded-lg bg-white dark:bg-zinc-900 shadow-sm ring-1 ring-zinc-950/5 dark:ring-white/10 mb-6 bizz-seo-card';
card.innerHTML='<div class="field-group-header border-b border-zinc-950/5 dark:border-white/10 px-6 py-4 bizz-seo-head"><h3 class="text-base/7 font-semibold text-zinc-950 dark:text-white">SEO</h3><span class="bizz-seo-badge" data-badge="seo">SEO</span><span class="bizz-seo-badge" data-badge="read">Readability</span><button type="button" class="bizz-seo-auto" data-auto>Auto-fill SEO</button></div>'
 +'<div class="bizz-seo-tabbar" role="tablist"><button type="button" data-t="seo" class="is-on">SEO</button><button type="button" data-t="social">Social</button><button type="button" data-t="adv">Advanced</button></div>'
 +'<div class="px-6 py-6"><div data-p="seo"><div class="bizz-seo-msg" data-msg hidden></div><div data-slot="seo"></div><div class="bizz-seo-preview" data-gp></div><div class="bizz-seo-results"><h4>SEO analysis</h4><ul data-r="seo"></ul><h4>Readability</h4><ul data-r="read"></ul></div></div>'
 +'<div data-p="social" hidden><div data-slot="social"></div><div class="bizz-seo-social" data-sp></div></div><div data-p="adv" hidden><div data-slot="adv"></div></div></div>';
var anchor=form.querySelector('[data-group-id="content-details"]')||form.querySelector('.field-group:last-of-type');
if(anchor&&anchor.parentNode)anchor.parentNode.insertBefore(card,anchor.nextSibling);else form.appendChild(card);
var slots={seo:['focusKeyphrase','relatedKeyphrases','seoTitle','seoDescription'],social:['socialTitle','socialDescription','seoImage'],adv:['noindex','nofollow','canonical','breadcrumbTitle','keyContent']};
Object.keys(slots).forEach(function(k){var slot=card.querySelector('[data-slot="'+k+'"]');slots[k].forEach(function(n){var g=group(n);if(g){g.classList.add('bizz-seo-field-moved');slot.appendChild(g)}})});
['seoScore','readabilityScore'].forEach(function(n){var g=group(n);if(g)g.style.display='none'});
card.querySelector('.bizz-seo-tabbar').addEventListener('click',function(e){var b=e.target.closest('button[data-t]');if(!b)return;
  card.querySelectorAll('.bizz-seo-tabbar button').forEach(function(x){x.classList.toggle('is-on',x===b)});
  card.querySelectorAll('[data-p]').forEach(function(p){p.hidden=p.getAttribute('data-p')!==b.getAttribute('data-t')})});
// ---- reading the content
function html(){return val('content')||val('body')||val('description')||''}
function doc(){var d=document.createElement('div');d.innerHTML=html();return d}
function text(el){return (el.textContent||'').replace(/\\s+/g,' ').trim()}
function words(t){return t?t.split(/\\s+/).filter(function(w){return /[\\p{L}\\p{N}]/u.test(w)}):[]}
function norm(s){return String(s||'').toLowerCase().normalize('NFKD').replace(/[\\u0300-\\u036f]/g,'').replace(/[^\\p{L}\\p{N}]+/gu,' ').trim()}
function contains(hay,needle){needle=norm(needle);if(!needle)return false;return (' '+norm(hay)+' ').indexOf(' '+needle+' ')>-1}
function count(hay,needle){needle=norm(needle);if(!needle)return 0;var h=' '+norm(hay)+' ',n=0,i=0;while((i=h.indexOf(' '+needle+' ',i))>-1){n++;i+=needle.length+1}return n}
function sentences(t){return t.split(/(?<=[.!?])\\s+(?=[A-Z\\u00C0-\\u017F"“])/).map(function(s){return s.trim()}).filter(function(s){return words(s).length>0})}
function title(){return val('title')}
function seoTitle(){return val('seoTitle')||title()}
function path(){var p=val('path');if(p)return p.charAt(0)==='/'?p:'/'+p;var s=val('slug');if(col==='posts')return '/blog/'+s;if(col==='categories')return '/blog/category/'+s;return '/'+s}
function fullTitle(){var t=seoTitle(),s=ctx.siteName;if(path()==='/')return val('seoTitle')||(ctx.tagline?s+' - '+ctx.tagline:s);var ns=norm(s);return ns&&norm(t).slice(-ns.length)===ns?t:t+' | '+s}
function firstPara(d){var p=d.querySelector('p');return p?text(p):''}
function desc(){return val('seoDescription')||val('excerpt')}
// ---- keyphrase suggestions
var STOP=('until while during without within toward upon whether since unless because though although between among across along around behind beyond ever never always often still even much many lot lots a an the and or but if then than of to in on at by for with from into over under about as is are was were be been being it its this that these those there here we you they he she i me my our your their his her them us not no yes can will would should could may might do does did done has have had so such very more most less also just only all any each other some what which who whom whose when where why how up down out off again further once both few own same too s t don now get got one two new use using used make makes made your yours via per vs '
 +'i u na je se da su za od do sa s o po iz ili ali ako kao što sto koji koja koje to ta taj te ti mi vi oni ona ono biti bio bila bilo smo ste sam si će ce ne nije još jos već vec samo sve svi kod pri prema nakon prije kroz bez između izmedu može moze mogu kako gdje kada zašto zasto ovo ova ovaj ovi tu tamo vrlo više vise manje jer pa te dok').split(' ');
var STOPSET={};STOP.forEach(function(w){if(w)STOPSET[w]=1});
function suggest(){var d=doc(),scores={},counts={},inTitle={},add=function(t,w,isTitle){String(t||'').split(/[.,;:!?()"“”„–—|]+/).forEach(function(chunk){var ws=norm(chunk).split(' ').filter(Boolean);for(var n=1;n<=3;n++)for(var i=0;i+n<=ws.length;i++){var g=ws.slice(i,i+n);if(STOPSET[g[0]]||STOPSET[g[n-1]]||g.some(function(x){return x.length<3&&!/\d/.test(x)}))continue;var k=g.join(' ');scores[k]=(scores[k]||0)+w*(n===1?0.6:n===2?2.2:2.6);counts[k]=(counts[k]||0)+1;if(isTitle)inTitle[k]=1}})};
  add(title(),5,1);add(val('excerpt'),2);d.querySelectorAll('h2,h3,h4').forEach(function(h){add(text(h),3)});add(text(d),1);
  var tags=val('tags');try{JSON.parse(tags||'[]').forEach(function(t){add(String(t),3,1)})}catch(e){}
  var list=Object.keys(scores).filter(function(k){return k.indexOf(' ')<0||counts[k]>=2||inTitle[k]}).map(function(k){return [k,scores[k]]}).filter(function(x){return x[1]>=4}).sort(function(a,b){return b[1]-a[1]});
  if(list.length&&list[0][0].indexOf(' ')<0){var top=list[0],better=list.filter(function(x){return x[0].indexOf(' ')>-1&&(' '+x[0]+' ').indexOf(' '+top[0]+' ')>-1&&x[1]>=top[1]*0.3})[0];if(better){list.splice(list.indexOf(better),1);list.unshift(better)}}
  var out=[];list.forEach(function(x){if(out.length<6&&!out.some(function(o){return o.indexOf(x[0])>-1||x[0].indexOf(o)>-1}))out.push(x[0])});return out}
function cut(s,max){s=s.replace(/\\s+/g,' ').trim();if(s.length<=max)return s;var c=s.slice(0,max+1);var i=c.lastIndexOf(' ');return (i>max*0.6?c.slice(0,i):c.slice(0,max)).replace(/[,;:\\s]+$/,'')+'…'}
function makeDesc(kp){var d=doc(),t=val('excerpt');if(t&&t.length>=70)return cut(t,155);var all=sentences(text(d));if(!all.length)return t?cut(t,155):'';
  var start=0;if(kp)for(var i=0;i<Math.min(all.length,6);i++)if(contains(all[i],kp)){start=i;break}
  var outS='';for(var j=start;j<all.length;j++){if((outS+' '+all[j]).trim().length>155){if(!outS)outS=all[j];break}outS=(outS+' '+all[j]).trim()}return cut(outS,155)}
function set(n,v){var e=q(n);if(!e||!v)return false;if(String(e.value||'').trim())return false;e.value=v;e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));return true}
card.querySelector('[data-auto]').addEventListener('click',function(){
  var filled=[],sug=suggest(),kp=val('focusKeyphrase')||sug[0]||'';
  if(set('focusKeyphrase',kp))filled.push('focus keyphrase');
  if(set('relatedKeyphrases',sug.filter(function(x){return norm(x)!==norm(kp)}).slice(0,4).join(', ')))filled.push('related keyphrases');
  var t=title(),room=60-ctx.siteName.length-3;if(path()!=='/'&&t.length>room&&set('seoTitle',cut(t,room).replace(/…$/,'')))filled.push('SEO title');
  if(set('seoDescription',makeDesc(kp)))filled.push('meta description');
  if(val('featuredImage')&&set('featuredImageAlt',t))filled.push('featured image description');
  var msg=card.querySelector('[data-msg]');msg.hidden=false;
  msg.innerHTML=filled.length?'Filled in: <strong>'+esc(filled.join(', '))+'</strong>. Check the texts, then save.':'Nothing to fill: every SEO field already has a value. Empty a field and press Auto-fill again to get a new suggestion.';
  analyse()});
// ---- analysis
var TRANS=('also, besides, furthermore, moreover, in addition, additionally, first, second, third, finally, then, next, after that, meanwhile, however, but, yet, although, though, instead, nevertheless, on the other hand, in contrast, still, because, since, therefore, thus, hence, so, as a result, consequently, for example, for instance, such as, in fact, indeed, of course, in short, in summary, to sum up, overall, similarly, likewise, above all, especially, in particular, for this reason, that is, in other words').split(', ');
function isEnglish(t){var w=words(norm(t)).slice(0,400),en=0,hr=0;w.forEach(function(x){if(/^(the|and|is|are|of|to|with|for|that|this|you|your)$/.test(x))en++;if(/^(je|su|da|za|se|na|od|koji|ili|kao|što|sto)$/.test(x))hr++});return en>=hr}
function analyse(){var d=doc(),body=text(d),w=words(body),kp=val('focusKeyphrase'),R=[],D=[];
  function r(list,s,msg){list.push([s,msg])}
  var isPost=col==='posts',min=isPost?300:150;
  if(!kp)r(R,'bad','No focus keyphrase yet. Set one, or press Auto-fill SEO.');else{
    var st=seoTitle();r(R,contains(st,kp)?(norm(st).indexOf(norm(kp))===0?'good':'ok'):'bad',contains(st,kp)?(norm(st).indexOf(norm(kp))===0?'Keyphrase at the start of the SEO title. Great.':'Keyphrase is in the SEO title. Moving it to the start is even better.'):'Put the keyphrase in the SEO title.');
    r(R,contains(desc(),kp)?'good':'bad',contains(desc(),kp)?'Keyphrase appears in the meta description.':'Use the keyphrase in the meta description.');
    var sl=norm(val('slug')).replace(/ /g,'');r(R,sl.indexOf(norm(kp).replace(/ /g,''))>-1?'good':'ok',sl.indexOf(norm(kp).replace(/ /g,''))>-1?'Keyphrase is in the URL.':'The URL slug does not contain the keyphrase.');
    var fp=firstPara(d);r(R,contains(fp,kp)?'good':'bad',contains(fp,kp)?'Keyphrase in the introduction.':'Use the keyphrase in the first paragraph.');
    var dens=w.length?count(body,kp)*norm(kp).split(' ').length/w.length*100:0;r(R,dens>=0.5&&dens<=3?'good':dens>3?'bad':'ok','Keyphrase density '+dens.toFixed(1)+'% ('+count(body,kp)+'×). Aim for 0.5–3%.');
    var hs=[].slice.call(d.querySelectorAll('h2,h3')).some(function(h){return contains(text(h),kp)});if(d.querySelector('h2,h3'))r(R,hs?'good':'ok',hs?'Keyphrase in a subheading.':'Use the keyphrase in one of the subheadings.');
    var alts=[].slice.call(d.querySelectorAll('img')).map(function(i){return i.getAttribute('alt')||''}).concat([val('featuredImageAlt')]);r(R,alts.some(function(a){return contains(a,kp)})?'good':'ok',alts.some(function(a){return contains(a,kp)})?'Keyphrase in an image description.':'Describe an image with the keyphrase (alt text or featured image description).');
    var dup=ctx.used.filter(function(u){return u.phrase===norm(kp)||u.phrase===kp.toLowerCase()});r(R,dup.length?'bad':'good',dup.length?'Keyphrase already used for "'+dup[0].title+'". Use a different one per page.':'Keyphrase not used on other pages.');}
  var tl=fullTitle().length;r(R,tl>=30&&tl<=60?'good':tl>60?'bad':'ok','Title length '+tl+' characters (best 30–60).');
  var dl=desc().length;r(R,!dl?'bad':dl>=120&&dl<=156?'good':'ok',!dl?'No meta description. Google will pick some text itself.':'Meta description '+dl+' characters (best 120–156).');
  r(R,w.length>=min?'good':w.length>=min*0.66?'ok':'bad','Text length '+w.length+' words (at least '+min+').');
  var links=[].slice.call(d.querySelectorAll('a[href]')),internal=links.filter(function(a){var h=a.getAttribute('href');return h.charAt(0)==='/'||h.indexOf(location.host)>-1}).length,out=links.length-internal;
  r(R,internal?'good':'ok',internal?internal+' internal link(s).':'Add a link to another page of this site.');r(R,out?'good':'ok',out?out+' outbound link(s).':'No links to other sites. A good source can help.');
  var imgs=d.querySelectorAll('img').length+(val('featuredImage')?1:0);r(R,imgs?'good':'ok',imgs?imgs+' image(s).':'Add an image (or a featured image).');
  var noAlt=[].slice.call(d.querySelectorAll('img')).filter(function(i){return !(i.getAttribute('alt')||'').trim()}).length;if(noAlt)r(R,'bad',noAlt+' image(s) without a description (alt text).');
  if(d.querySelector('h1'))r(R,'bad','The text has an H1 heading. The title is already the H1; use H2 and H3 inside the text.');
  if(q('noindex')&&q('noindex').checked)r(R,'bad','This page is hidden from search engines (Advanced › noindex).');
  // readability
  var S=sentences(body),en=isEnglish(body);
  if(w.length<50)r(D,'ok','Add more text to check readability.');else{
    var longS=S.filter(function(s){return words(s).length>20}).length,pl=S.length?longS/S.length*100:0;r(D,pl<=25?'good':pl<=35?'ok':'bad',Math.round(pl)+'% of sentences have more than 20 words (keep it under 25%).');
    var paras=[].slice.call(d.querySelectorAll('p')).map(function(p){return words(text(p)).length}),lp=paras.filter(function(n){return n>150}).length;r(D,lp?'bad':'good',lp?lp+' paragraph(s) longer than 150 words. Split them.':'Paragraph lengths are fine.');
    var blocks=[],cur=0;[].slice.call(d.children).forEach(function(c){if(/^H[2-4]$/.test(c.tagName)){blocks.push(cur);cur=0}else cur+=words(text(c)).length});blocks.push(cur);var maxB=Math.max.apply(null,blocks);
    if(w.length>300)r(D,maxB>300?'bad':'good',maxB>300?'A part of '+maxB+' words has no subheading. Add a subheading every 300 words.':'Subheadings break up the text well.');
    var starts={},rep=0;S.forEach(function(s,i){var f=norm(s).split(' ')[0];if(i>1&&f&&f===norm(S[i-1]).split(' ')[0]&&f===norm(S[i-2]).split(' ')[0])rep++});r(D,rep?'ok':'good',rep?'Several sentences in a row start with the same word.':'Sentence starts are varied.');
    if(en){var pas=S.filter(function(s){return /\\b(is|are|was|were|be|been|being|get|got)\\s+(\\w+ly\\s+)?\\w+(ed|en)\\b/i.test(s)}).length,pp=S.length?pas/S.length*100:0;r(D,pp<=10?'good':pp<=15?'ok':'bad',Math.round(pp)+'% passive voice (keep it under 10%).');
      var tr=S.filter(function(s){var l=' '+s.toLowerCase()+' ';return TRANS.some(function(t){return l.indexOf(' '+t+' ')>-1||l.indexOf(' '+t+',')>-1})}).length,tp=S.length?tr/S.length*100:0;r(D,tp>=30?'good':tp>=20?'ok':'bad',Math.round(tp)+'% of sentences use transition words (aim for 30%).')}
    else r(D,'ok','Passive voice and transition words are checked in English only for now.');}
  render(R,'seo');render(D,'read');preview();
  var sc=function(L){if(!L.length)return 0;var p={good:9,ok:6,bad:3};return Math.round(L.reduce(function(a,x){return a+p[x[0]]},0)/(L.length*9)*100)};
  var s1=sc(R),s2=sc(D);badge('seo',s1);badge('read',s2);var a=q('seoScore'),b=q('readabilityScore');if(a)a.value=kp?s1:Math.min(s1,40);if(b)b.value=s2}
function render(list,k){var ul=card.querySelector('[data-r="'+k+'"]');list.sort(function(a,b){var o={bad:0,ok:1,good:2};return o[a[0]]-o[b[0]]});ul.innerHTML=list.map(function(x){return '<li><span class="bizz-seo-dot is-'+x[0]+'"></span>'+esc(x[1])+'</li>'}).join('')}
function badge(k,n){var b=card.querySelector('[data-badge="'+k+'"]');b.className='bizz-seo-badge '+(n>=70?'is-good':n>=45?'is-ok':'is-bad');b.title=(k==='seo'?'SEO':'Readability')+' score '+n}
function preview(){var t=fullTitle(),dd=desc()||'(Google will show some text from the page)',url=(ctx.origin.replace(/^https?:\\/\\//,'')+path()).replace(/\\/$/,'').split('/').join(' › ');
  card.querySelector('[data-gp]').innerHTML='<div class="bizz-seo-gp-label">Google preview</div><div class="bizz-seo-gp"><div class="bizz-seo-gp-url">'+esc(url)+'</div><div class="bizz-seo-gp-title">'+esc(cut(t,62))+'</div><div class="bizz-seo-gp-desc">'+esc(cut(dd,158))+'</div></div><div class="bizz-seo-bars"><span>Title <i style="--w:'+Math.min(100,t.length/60*100)+'%" class="'+(t.length>=30&&t.length<=60?'is-good':'is-ok')+'"></i></span><span>Description <i style="--w:'+Math.min(100,desc().length/156*100)+'%" class="'+(desc().length>=120&&desc().length<=156?'is-good':'is-ok')+'"></i></span></div>';
  var st=val('socialTitle')||seoTitle(),sd=val('socialDescription')||desc(),img=val('seoImage')||val('featuredImage');
  card.querySelector('[data-sp]').innerHTML='<div class="bizz-seo-gp-label">Share preview (Facebook, LinkedIn, X)</div><div class="bizz-seo-share">'+(img?'<img src="'+esc(img)+'" alt="">':'<div class="bizz-seo-share-noimg">No image: the featured image or the site default is used.</div>')+'<div><small>'+esc(ctx.origin.replace(/^https?:\\/\\//,''))+'</small><strong>'+esc(cut(st,90))+'</strong><p>'+esc(cut(sd,140))+'</p></div></div>'}
var timer;function soon(){clearTimeout(timer);timer=setTimeout(analyse,350)}
form.addEventListener('input',soon);form.addEventListener('change',soon);
var ed=form.querySelector('[contenteditable="true"]');if(ed)new MutationObserver(soon).observe(ed,{childList:true,subtree:true,characterData:true});
form.addEventListener('submit',analyse,true);
fetch('/admin/bizz/seo/context'+(idm?'?id='+encodeURIComponent(idm[1]):''),{credentials:'same-origin'}).then(function(r){return r.ok?r.json():null}).catch(function(){return null}).then(function(c){if(c)ctx=c;analyse()});
})();</script>`

/** SEO and readability dots next to titles in the Content list. */
export const SEO_LIST_SCRIPT = `<script>(function(){
var links=[].slice.call(document.querySelectorAll('a[href*="/admin/content/"][href*="/edit"]'));
var byId={};links.forEach(function(a){var m=a.getAttribute('href').match(/\\/admin\\/content\\/([^/]+)\\/edit/);if(m&&a.textContent.trim()&&!a.querySelector('svg'))(byId[m[1]]=byId[m[1]]||[]).push(a)});
var ids=Object.keys(byId);if(!ids.length)return;
fetch('/admin/bizz/seo/scores?ids='+ids.join(','),{credentials:'same-origin'}).then(function(r){return r.ok?r.json():{}}).then(function(s){ids.forEach(function(id){var v=s[id];if(!v||(v.seo==null&&v.read==null))return;
  var c=function(n,l){return n==null?'':'<span class="bizz-seo-dot '+(n>=70?'is-good':n>=45?'is-ok':'is-bad')+'" title="'+l+' '+n+'"></span>'};
  byId[id].forEach(function(a){if(a.parentNode.querySelector('.bizz-seo-dots'))return;var sp=document.createElement('span');sp.className='bizz-seo-dots';sp.innerHTML=c(v.seo,'SEO')+c(v.read,'Readability');a.after(sp)})})}).catch(function(){});
})();</script>`
