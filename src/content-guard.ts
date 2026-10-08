// Keeps rich text safe in the editor.
// Upstream's Lexical editor turns the saved HTML into its own document model, which has no images,
// tables, embeds, figures, code blocks or horizontal rules. Such HTML is dropped, or the whole import
// fails and the box stays empty, and the editor then writes its (empty or stripped) HTML back into the
// field that is saved. Imported posts (old websites) hit this all the time.
//   1. In the browser (CONTENT_GUARD_SCRIPT): every rich text field gets a Visual | HTML | Preview switch.
//      Content with those elements opens in HTML (Visual is refused for it) instead of Lexical; if Lexical loads other content but loses text or images, the field
//      is restored and switched to the HTML editor too. Saving an emptied box asks for confirmation.
//   2. On the server (contentGuardRoute): a save that would replace real text with an empty box is
//      refused unless the editor confirmed it (bizz_confirm_clear), so no browser can blank a post.

const textLength = (html: string) => html.replace(/<[^>]*>/g, ' ').replace(/&#8203;|&#x200b;|&nbsp;|&#160;/gi, ' ').replace(/[\u200B-\u200D\uFEFF]/g, '').replace(/&[a-z#0-9]+;/gi, 'x').replace(/\s+/g, ' ').trim().length

/** Refuses a content save that would empty a field holding real text (PUT /admin/content/:id). */
export async function contentGuardRoute(request: Request, path: string, db: D1Database): Promise<Response | null> {
  const m = path.match(/^\/admin\/content\/([^/]+)$/)
  if (!m || (request.method !== 'PUT' && request.method !== 'POST') || m[1] === 'new') return null
  const type = request.headers.get('content-type') ?? ''
  if (!type.includes('multipart/form-data') && !type.includes('application/x-www-form-urlencoded')) return null
  const form = await request.clone().formData().catch(() => null)
  if (!form || form.get('bizz_confirm_clear') === '1') return null
  const fields = ['content', 'body'].filter(f => form.has(f) && textLength(String(form.get(f) ?? '')) < 20)
  if (!fields.length) return null
  const row = await db.prepare(`SELECT data FROM documents WHERE (root_id = ? OR id = ?) AND is_current_draft = 1 AND deleted_at IS NULL LIMIT 1`).bind(m[1], m[1]).first<{ data: string }>()
  if (!row) return null
  let data: Record<string, unknown> = {}; try { data = JSON.parse(row.data) } catch { return null }
  const lost = fields.filter(f => textLength(String(data[f] ?? '')) >= 20)
  if (!lost.length) return null
  return new Response(`<div class="bizz-guard-error" role="alert"><strong>Not saved.</strong> The ${lost.join(' and ')} box is empty, but this item has text. Nothing was changed. Reload the page to get the text back; if you really want to remove it, clear the box and confirm when asked.</div>`,
    { status: 200, headers: { 'content-type': 'text/html; charset=utf-8', 'HX-Retarget': '#form-messages', 'HX-Reswap': 'innerHTML' } })
}

export const CONTENT_GUARD_SCRIPT = `<script>(function(){
var form=document.getElementById('content-form');if(!form)return;
var ZW=new RegExp('[\\u200B-\\u200D\\uFEFF]','g');
function tlen(h){var d=document.createElement('div');d.innerHTML=h||'';return (d.textContent||'').replace(ZW,'').replace(/\\s+/g,' ').trim().length}
function tags(h,t){var d=document.createElement('div');d.innerHTML=h||'';return d.getElementsByTagName(t).length}
var RICH=/<(img|table|iframe|figure|pre|hr|video|audio|embed|object|div|section)\\b/i;
var RICH_NOTE='This text has images, tables, embeds or code blocks, which the visual editor cannot keep yet, so it opens as HTML. Nothing is lost.';
var wrappers=[].slice.call(form.querySelectorAll('.lexical-editor-wrapper'));
// Every rich text field gets a Visual | HTML | Preview switch. HTML edits the saved HTML directly;
// Visual is only offered when the HTML has nothing the visual editor would drop.
function setup(w,hidden,startHtml,note){
  if(w._bizz)return w._bizz;
  var bar=document.createElement('div');bar.className='bizz-html-tabs';
  bar.innerHTML='<button type="button" data-m="visual">Visual</button><button type="button" data-m="html">HTML</button><button type="button" data-m="preview">Preview</button>';
  var box=document.createElement('div');box.className='bizz-html-editor';box.hidden=true;
  box.innerHTML='<p class="bizz-html-note" hidden></p><textarea spellcheck="false" aria-label="HTML"></textarea><iframe class="bizz-html-preview" sandbox="" title="Preview" hidden></iframe>';
  w.parentNode.insertBefore(bar,w);w.parentNode.insertBefore(box,w.nextSibling);
  var ta=box.querySelector('textarea'),pv=box.querySelector('iframe'),nt=box.querySelector('.bizz-html-note');
  ta.addEventListener('input',function(){hidden.value=ta.value});
  function inst(){var ed=w.querySelector('[contenteditable]');return ed&&ed._lexicalEditor}
  function say(t){nt.textContent=t||'';nt.hidden=!t}
  function show(m){bar.querySelectorAll('button').forEach(function(b){b.classList.toggle('is-on',b.getAttribute('data-m')===m)});
    var visual=m==='visual';[].slice.call(w.children).forEach(function(c){if(c!==hidden)c.style.display=visual?'':'none'});box.hidden=visual;ta.hidden=m!=='html';pv.hidden=m!=='preview';
    if(m==='preview')pv.srcdoc='<!doctype html><meta charset="utf-8"><style>body{font:15px/1.6 system-ui,sans-serif;color:#172e30;margin:16px}img,iframe{max-width:100%;height:auto}table{border-collapse:collapse}td,th{border:1px solid #dfe7e4;padding:4px 8px}pre{background:#f3f5f4;padding:10px;overflow:auto}</style>'+hidden.value}
  var api={mode:'visual',go:function(m){
    if(m==='visual'){var e=inst(),L=window.__lexical,html=hidden.value;
      if(RICH.test(html)){say(RICH_NOTE);return}
      if(!e||!L||!L.$generateNodesFromDOM){say('The visual editor is not available for this field.');return}
      if(api.mode!=='visual'){var before=html;try{e.update(function(){var dom=new DOMParser().parseFromString(html,'text/html');var nodes=L.$generateNodesFromDOM(e,dom);var root=L.$getRoot();root.clear();root.append.apply(root,nodes)})}catch(x){say('This HTML cannot be shown in the visual editor.');return}
        setTimeout(function(){if(tlen(hidden.value)<tlen(before)*0.9||tags(hidden.value,'a')<tags(before,'a')){hidden.value=before;ta.value=before;api.mode='html';show('html');say('The visual editor would lose part of this HTML, so it stays in HTML.')}},300)}
      say('');api.mode='visual';show('visual');return}
    ta.value=hidden.value;api.mode=m;show(m)}};
  bar.addEventListener('click',function(e){var b=e.target.closest('button[data-m]');if(b)api.go(b.getAttribute('data-m'))});
  w._bizz=api;
  if(startHtml){api.mode='html';ta.value=hidden.value;show('html');say(note)}else show('visual');
  return api}
wrappers.forEach(function(w){
  var hidden=w.querySelector('input[type=hidden]');if(!hidden)return;var orig=hidden.value||'';w._bizzOrig=orig;
  if(RICH.test(orig)){w.setAttribute('data-lexical-initialized','true');setup(w,hidden,true,RICH_NOTE);return}
  function ready(){setup(w,hidden,false);setTimeout(function(){var now=hidden.value;if(tlen(orig)>0&&(tlen(now)<tlen(orig)*0.9||tags(now,'a')<tags(orig,'a'))){hidden.value=orig;var a=setup(w,hidden,false);a.mode='visual';a.go('html');var n=w.nextSibling&&w.nextSibling.querySelector&&w.nextSibling.querySelector('.bizz-html-note');if(n){n.textContent='The visual editor could not load all of this text, so it opens as HTML. Nothing is lost.';n.hidden=false}}},400)}
  if(w.hasAttribute('data-lexical-initialized'))ready();else{new MutationObserver(function(m,o){if(w.hasAttribute('data-lexical-initialized')){o.disconnect();ready()}}).observe(w,{attributes:true});
    setTimeout(function(){if(!w.hasAttribute('data-lexical-initialized')){w.setAttribute('data-lexical-initialized','true');setup(w,hidden,true,'The visual editor did not load, so this opens as HTML.')}},8000)}
});
form.addEventListener('submit',function(e){
  var emptied=wrappers.filter(function(w){var h=w.querySelector('input[type=hidden]');return h&&tlen(w._bizzOrig)>=20&&tlen(h.value)<20});
  if(!emptied.length)return;
  if(!confirm('The content box is empty, but this item had text. Save anyway and remove the text?')){e.preventDefault();e.stopImmediatePropagation();return}
  var c=form.querySelector('input[name="bizz_confirm_clear"]');if(!c){c=document.createElement('input');c.type='hidden';c.name='bizz_confirm_clear';form.appendChild(c)}c.value='1';
},true);
})();</script>`
