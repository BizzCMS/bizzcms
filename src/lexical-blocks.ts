// Images, tables, embeds and code in the visual editor.
// Upstream's Lexical editor (0.21, loaded from esm.sh through an import map) only registers paragraph,
// heading, quote, list and link nodes, so <img>, <table>, <iframe>, <figure>, <pre> and <hr> were lost.
// Lexical only accepts node classes when an editor is created, so this script:
//   - loads the same 'lexical' module (same import-map URL, so the same classes) and defines two
//     vanilla (no React) DecoratorNodes:
//       bizz-image  an <img> (src, alt, width), inline, shown as the image; double-click edits its description
//       bizz-html   any table, figure, iframe, pre, hr, video, audio, embed or object, kept exactly as it
//                   was (shown read-only in the editor, written back unchanged on save)
//   - wraps window.__lexical.createEditor so upstream's own editors are created with those nodes (its
//     toolbar, history and save-to-field stay as they are), and wraps $generateNodesFromDOM so loose
//     text or inline nodes at the top level go into a paragraph instead of failing the whole import;
//   - holds upstream's initializeLexicalEditors until the nodes are ready;
//   - adds an Image button to each toolbar that opens the Media library.
// The HTML switch and the save guard (src/content-guard.ts) stay as a safety net.

export const LEXICAL_BLOCKS_SCRIPT = `<script>(function(){
if(!document.querySelector('.lexical-editor-wrapper'))return;
function okUrl(u){u=String(u||'').trim();return /^(https?:)?\\/\\//i.test(u)||u.charAt(0)==='/'}
function safe(html){var t=document.createElement('template');t.innerHTML=html||'';
  t.content.querySelectorAll('script,style,link,meta,base').forEach(function(n){n.remove()});
  t.content.querySelectorAll('iframe,embed,object').forEach(function(n){var src=n.getAttribute('src')||n.getAttribute('data')||'';var host='';try{host=new URL(src,location.href).hostname}catch(e){}
    var p=document.createElement('div');p.className='bizz-lex-embed';p.textContent='Embedded content'+(host?' from '+host:'');n.replaceWith(p)});
  t.content.querySelectorAll('*').forEach(function(el){[].slice.call(el.attributes).forEach(function(a){if(/^on/i.test(a.name)||(/^(href|src|action|xlink:href)$/i.test(a.name)&&/^\\s*(javascript|vbscript|data:text)/i.test(a.value)))el.removeAttribute(a.name)})});
  return t.innerHTML}
var ready=import('lexical').then(function(lx){
  var D=lx.DecoratorNode;
  class HtmlBlockNode extends D{
    static getType(){return 'bizz-html'}
    static clone(n){return new HtmlBlockNode(n.__html,n.__key)}
    constructor(html,key){super(key);this.__html=html||''}
    createDOM(){var d=document.createElement('div');d.className='bizz-lex-block';d.contentEditable='false';d.setAttribute('data-kind',(/^<\\s*([a-z0-9]+)/i.exec(this.__html)||[,'html'])[1].toLowerCase());d.innerHTML=safe(this.__html);return d}
    updateDOM(){return false}
    decorate(){return null}
    isInline(){return false}
    getTextContent(){var t=document.createElement('template');t.innerHTML=this.__html;return t.content.textContent||''}
    exportDOM(){var t=document.createElement('template');t.innerHTML=this.__html;return {element:t.content.firstElementChild||document.createElement('div')}}
    static importDOM(){var c=function(){return {conversion:function(el){return {node:new HtmlBlockNode(el.outerHTML)}},priority:4}};
      return {table:c,figure:c,iframe:c,pre:c,hr:c,video:c,audio:c,embed:c,object:c}}
    exportJSON(){return {type:'bizz-html',version:1,html:this.__html}}
    static importJSON(j){return new HtmlBlockNode(j.html)}
  }
  class ImageNode extends D{
    static getType(){return 'bizz-image'}
    static clone(n){return new ImageNode(n.__src,n.__alt,n.__width,n.__key)}
    constructor(src,alt,width,key){super(key);this.__src=src||'';this.__alt=alt||'';this.__width=width||''}
    createDOM(){var s=document.createElement('span');s.className='bizz-lex-img';s.contentEditable='false';var i=document.createElement('img');if(okUrl(this.__src))i.src=this.__src;i.alt=this.__alt;if(this.__width)i.setAttribute('width',this.__width);i.title=this.__alt?'Description: '+this.__alt+' (double-click to change)':'No description yet: double-click to add one';s.appendChild(i);return s}
    updateDOM(prev,dom){var i=dom.querySelector('img');if(i){if(okUrl(this.__src))i.src=this.__src;i.alt=this.__alt;i.title=this.__alt?'Description: '+this.__alt+' (double-click to change)':'No description yet: double-click to add one'}return false}
    decorate(){return null}
    isInline(){return true}
    getTextContent(){return ''}
    exportDOM(){var i=document.createElement('img');i.setAttribute('src',this.__src);if(this.__alt)i.setAttribute('alt',this.__alt);if(this.__width)i.setAttribute('width',this.__width);return {element:i}}
    static importDOM(){return {img:function(){return {conversion:function(el){return {node:new ImageNode(el.getAttribute('src')||'',el.getAttribute('alt')||'',el.getAttribute('width')||'')}},priority:4}}}}
    exportJSON(){return {type:'bizz-image',version:1,src:this.__src,alt:this.__alt,width:this.__width}}
    static importJSON(j){return new ImageNode(j.src,j.alt,j.width)}
    setAlt(a){this.getWritable().__alt=a}
  }
  window.__bizzLexical={lx:lx,nodes:[HtmlBlockNode,ImageNode],ImageNode:ImageNode};
  return true}).catch(function(e){console.error('[BizzCMS] rich blocks could not load',e);return false});
function patch(){var L=window.__lexical,B=window.__bizzLexical;if(!L||!B||L.__bizz)return;L.__bizz=true;
  var ce=L.createEditor;L.createEditor=function(cfg){cfg=cfg||{};cfg.nodes=(cfg.nodes||[]).concat(B.nodes);return ce(cfg)};
  var gen=L.$generateNodesFromDOM;L.$generateNodesFromDOM=function(ed,dom){var lx=B.lx,out=[],p=null;gen(ed,dom).forEach(function(n){
    var block=(lx.$isElementNode(n)&&!n.isInline())||(lx.$isDecoratorNode(n)&&!n.isInline());
    if(block){p=null;out.push(n)}else{if(!p){p=L.$createParagraphNode();out.push(p)}p.append(n)}});return out}}
function holder(){var h=document.getElementById('bizz-lex-image-pick');if(h)return h;var c=document.createElement('div');c.className='media-field-container';c.style.display='none';c.innerHTML='<input type="hidden" id="bizz-lex-image-pick">';document.body.appendChild(c);return c.querySelector('input')}
function addButtons(){var B=window.__bizzLexical;if(!B)return;
  document.querySelectorAll('.lexical-editor-wrapper[data-lexical-initialized]').forEach(function(w){
    var id=w.getAttribute('data-field-id'),bar=id&&document.getElementById(id+'-toolbar'),el=id&&document.getElementById(id+'-editor'),ed=el&&el._lexicalEditor;
    if(!bar||!ed||bar.querySelector('[data-action="bizz-image"]'))return;
    var b=document.createElement('button');b.type='button';b.className='lexical-toolbar-btn';b.setAttribute('data-action','bizz-image');b.title='Insert image';b.setAttribute('aria-label','Insert image');
    b.innerHTML='<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.1-3.1a2 2 0 0 0-2.8 0L6 21"/></svg>';
    b.addEventListener('mousedown',function(e){e.preventDefault()});
    b.addEventListener('click',function(e){e.preventDefault();var h=holder();h.value='';
      if(typeof window.openMediaSelector!=='function'){var u=prompt('Image address (from Media):','');if(u)insert(ed,u);return}
      window.openMediaSelector('bizz-lex-image-pick');
      var t=setInterval(function(){if(document.getElementById('media-selector-modal'))return;clearInterval(t);var u=h.value.split(',')[0].trim();if(u)insert(ed,u)},300)});
    bar.appendChild(b);
    el.addEventListener('dblclick',function(e){var img=e.target.closest('.bizz-lex-img');if(!img)return;var cur=(img.querySelector('img')||{}).alt||'';var a=prompt('Describe this image (for Google and screen readers):',cur);if(a===null)return;
      ed.update(function(){var n=B.lx.$getNearestNodeFromDOMNode(img);if(n&&n.setAlt)n.setAlt(a.trim())})});
  })}
function insert(ed,url){var B=window.__bizzLexical;if(!okUrl(url))return;var alt=prompt('Describe this image (for Google and screen readers):','')||'';
  ed.update(function(){var lx=B.lx,node=new B.ImageNode(url,alt.trim(),''),sel=lx.$getSelection();
    if(lx.$isRangeSelection(sel))sel.insertNodes([node]);else{var p=lx.$createParagraphNode();p.append(node);lx.$getRoot().append(p)}});ed.focus()}
function wrap(orig){return function(scope){ready.then(function(){patch();orig(scope);addButtons()})}}
if(typeof window.initializeLexicalEditors==='function')window.initializeLexicalEditors=wrap(window.initializeLexicalEditors);
else{var held;Object.defineProperty(window,'initializeLexicalEditors',{configurable:true,get:function(){return held},set:function(f){held=wrap(f)}})}
})();</script>`
