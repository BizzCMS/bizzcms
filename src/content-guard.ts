// Keeps rich text safe in the editor.
// Upstream's Lexical editor turns the saved HTML into its own document model, which has no images,
// tables, embeds, figures, code blocks or horizontal rules. Such HTML is dropped, or the whole import
// fails and the box stays empty, and the editor then writes its (empty or stripped) HTML back into the
// field that is saved. Imported posts (old websites) hit this all the time.
//   1. In the browser (CONTENT_GUARD_SCRIPT): content with those elements opens in an HTML editor with
//      a preview instead of Lexical; if Lexical loads other content but loses text or images, the field
//      is restored and switched to the HTML editor too. Saving an emptied box asks for confirmation.
//   2. On the server (contentGuardRoute): a save that would replace real text with an empty box is
//      refused unless the editor confirmed it (bizz_confirm_clear), so no browser can blank a post.

const textLength = (html: string) => html.replace(/<[^>]*>/g, ' ').replace(/&#8203;|&#x200b;|&nbsp;|&#160;/gi, ' ').replace(/[​-‍﻿]/g, '').replace(/&[a-z#0-9]+;/gi, 'x').replace(/\s+/g, ' ').trim().length

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
var wrappers=[].slice.call(form.querySelectorAll('.lexical-editor-wrapper'));
function htmlMode(w,hidden,html,msg){
  if(w.getAttribute('data-bizz-html')==='1')return;w.setAttribute('data-bizz-html','1');
  [].slice.call(w.children).forEach(function(c){if(c!==hidden)c.style.display='none'});
  var box=document.createElement('div');box.className='bizz-html-editor';
  box.innerHTML='<p class="bizz-html-note"></p><div class="bizz-html-tabs"><button type="button" data-m="html" class="is-on">HTML</button><button type="button" data-m="preview">Preview</button></div><textarea spellcheck="false"></textarea><iframe class="bizz-html-preview" sandbox="" hidden></iframe>';
  box.querySelector('.bizz-html-note').textContent=msg;
  var ta=box.querySelector('textarea'),pv=box.querySelector('iframe');ta.value=html;hidden.value=html;
  ta.addEventListener('input',function(){hidden.value=ta.value});
  box.querySelector('.bizz-html-tabs').addEventListener('click',function(e){var b=e.target.closest('button[data-m]');if(!b)return;box.querySelectorAll('.bizz-html-tabs button').forEach(function(x){x.classList.toggle('is-on',x===b)});
    var prev=b.getAttribute('data-m')==='preview';ta.hidden=prev;pv.hidden=!prev;if(prev)pv.srcdoc='<!doctype html><meta charset="utf-8"><style>body{font:15px/1.6 system-ui,sans-serif;color:#172e30;margin:16px}img,iframe{max-width:100%;height:auto}table{border-collapse:collapse}td,th{border:1px solid #dfe7e4;padding:4px 8px}pre{background:#f3f5f4;padding:10px;overflow:auto}</style>'+ta.value});
  w.appendChild(box)}
wrappers.forEach(function(w){
  var hidden=w.querySelector('input[type=hidden]');if(!hidden)return;var orig=hidden.value||'';w._bizzOrig=orig;
  if(RICH.test(orig)){w.setAttribute('data-lexical-initialized','true');htmlMode(w,hidden,orig,'This text has images, tables, embeds or code blocks, which the visual editor cannot keep yet, so it opens as HTML. Nothing is lost.');return}
  function check(){setTimeout(function(){var now=hidden.value;if(tlen(orig)>0&&(tlen(now)<tlen(orig)*0.9||tags(now,'a')<tags(orig,'a'))){var ed=w.querySelector('[contenteditable]');try{if(ed&&ed._lexicalEditor)ed._lexicalEditor.setRootElement(null)}catch(e){}
    htmlMode(w,hidden,orig,'The visual editor could not load all of this text, so it opens as HTML. Nothing is lost.')}},400)}
  if(w.hasAttribute('data-lexical-initialized'))check();else new MutationObserver(function(m,o){if(w.hasAttribute('data-lexical-initialized')){o.disconnect();check()}}).observe(w,{attributes:true});
});
form.addEventListener('submit',function(e){
  var emptied=wrappers.filter(function(w){var h=w.querySelector('input[type=hidden]');return h&&tlen(w._bizzOrig)>=20&&tlen(h.value)<20});
  if(!emptied.length)return;
  if(!confirm('The content box is empty, but this item had text. Save anyway and remove the text?')){e.preventDefault();e.stopImmediatePropagation();return}
  var c=form.querySelector('input[name="bizz_confirm_clear"]');if(!c){c=document.createElement('input');c.type='hidden';c.name='bizz_confirm_clear';form.appendChild(c)}c.value='1';
},true);
})();</script>`
