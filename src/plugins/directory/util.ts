// Directory plugin: small helpers shared by the directory pages and the company portal.

export { esc, html } from '../../site-accounts'

export function str(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

// The admin media picker may save multiple images as a JSON array, an array, or a comma list.
export function mediaList(value: unknown): string[] {
  let list: unknown[] = []
  if (Array.isArray(value)) list = value
  else if (typeof value === 'string') {
    try { const parsed = JSON.parse(value); list = Array.isArray(parsed) ? parsed : [value] } catch { list = value.split(',') }
  }
  return list.filter((u): u is string => typeof u === 'string').map(u => u.trim()).filter(u => /^(https?:\/\/|\/)/.test(u))
}

export function safeUrl(value?: string): string | undefined {
  return value && /^https?:\/\//i.test(value) ? value : undefined
}

export function safeDecode(value: string): string {
  try { return decodeURIComponent(value) } catch { return value }
}

/** Page numbers to show around the current page; 0 marks a gap (…). */
export function pageWindow(current: number, total: number): number[] {
  const keep = new Set([1, total, current - 1, current, current + 1].filter(n => n >= 1 && n <= total))
  const out: number[] = []
  for (const n of [...keep].sort((a, b) => a - b)) { if (out.length && n - out[out.length - 1] > 1) out.push(0); out.push(n) }
  return out
}

export const truthy = (v: unknown) => [true, 1, 'true', 'on', '1'].includes(v as never)

export function icon(name: 'pin' | 'people' | 'search' | 'grid' | 'list'): string {
  const paths = {
    pin: '<path d="M12 21s-7-6.2-7-11a7 7 0 1 1 14 0c0 4.8-7 11-7 11z"/><circle cx="12" cy="10" r="2.5"/>',
    people: '<circle cx="9" cy="8" r="3"/><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6"/><path d="M16 4.5a3 3 0 0 1 0 6M21 20c0-2.6-1.6-4.8-4-5.6"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
    grid: '<rect x="4" y="4" width="7" height="7" rx="1"/><rect x="13" y="4" width="7" height="7" rx="1"/><rect x="4" y="13" width="7" height="7" rx="1"/><rect x="13" y="13" width="7" height="7" rx="1"/>',
    list: '<path d="M9 6h11M9 12h11M9 18h11"/><circle cx="4.5" cy="6" r="1"/><circle cx="4.5" cy="12" r="1"/><circle cx="4.5" cy="18" r="1"/>'
  }
  return `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name]}</svg>`
}

// SQLite's lower() only folds ASCII: fold accented letters so "dakovo" finds "Đakovo" and "cafe" finds "Café".
const FOLD: [string, string][] = [
  ['Č', 'c'], ['č', 'c'], ['Ć', 'c'], ['ć', 'c'], ['Đ', 'd'], ['đ', 'd'], ['Š', 's'], ['š', 's'], ['Ž', 'z'], ['ž', 'z'],
  ['É', 'e'], ['é', 'e'], ['È', 'e'], ['è', 'e'], ['Á', 'a'], ['á', 'a'], ['Ä', 'a'], ['ä', 'a'], ['Ö', 'o'], ['ö', 'o'], ['Ü', 'u'], ['ü', 'u'],
  ['-', ' ']
]
/** SQL expression: lower(expr) with accents folded, for LIKE searches. */
export const fold = (expr: string) => FOLD.reduce((e, [from, to]) => `replace(${e}, '${from}', '${to}')`, `lower(${expr})`)

/** Progressive enhancement for the filter forms: apply on change; filters collapsed on small screens.
 *  Sites include it once in their layout. */
export function directoryScript(regionParam = 'region', cityParam = 'city'): string {
  // GET forms never send empty fields (no ?grad=&q= in addresses); the server also redirects those to clean ones.
  return `document.addEventListener('submit',function(e){var f=e.target;if(!f||(f.getAttribute('method')||'get').toLowerCase()!=='get')return;var off=[];[].forEach.call(f.elements,function(el){if(el.name&&!el.disabled&&el.type!=='submit'&&String(el.value).trim()===''&&((el.type!=='checkbox'&&el.type!=='radio')||el.checked)){el.disabled=true;off.push(el)}});setTimeout(function(){off.forEach(function(el){el.disabled=false})},0)});
document.querySelectorAll('form[data-auto]').forEach(function(f){f.addEventListener('change',function(e){
if(e.target.name===${JSON.stringify(regionParam)}&&f.elements[${JSON.stringify(cityParam)}])f.elements[${JSON.stringify(cityParam)}].value='';f.requestSubmit()})});
document.querySelectorAll('[data-dual]').forEach(function(d){var a=d.querySelectorAll('input'),lo=+d.getAttribute('data-lo'),hi=+d.getAttribute('data-hi'),out=d.parentNode.querySelector('[data-pr-out]');
function show(){var x=+a[0].value,y=+a[1].value;if(out){var L=out.getAttribute('data-locale');out.textContent=out.getAttribute('data-from')+' '+x.toLocaleString(L)+' € – '+out.getAttribute('data-to')+' '+y.toLocaleString(L)+' €'}}
[].forEach.call(a,function(inp,i){inp.addEventListener('input',function(){if(+a[0].value>+a[1].value){if(i===0)a[0].value=a[1].value;else a[1].value=a[0].value}show()});
inp.addEventListener('change',function(){a[0].disabled=+a[0].value<=lo;a[1].disabled=+a[1].value>=hi})})});
(function(){var d=document.querySelector('dialog[data-request]');if(!d||!d.showModal)return;var id=d.id;
function open(){if(d.hasAttribute('data-needs-login')&&!/(^|;\\s*)signed_in=1/.test(document.cookie)){var l=d.querySelector('[data-req-login]'),f=d.querySelector('[data-req-form]');if(l&&f&&!d.querySelector('.req-thanks')){l.hidden=false;f.hidden=true}}if(!d.open)d.showModal()}
document.addEventListener('click',function(e){var a=e.target.closest&&e.target.closest('[data-open-request],a[href="#'+id+'"]');if(a){e.preventDefault();open()}});
d.addEventListener('click',function(e){if(e.target===d||e.target.closest('[data-close]'))d.close()});
if(d.hasAttribute('data-open')||location.hash==='#'+id||new URLSearchParams(location.search).get(id)==='1')open()})();
document.querySelectorAll('[data-auto-submit]').forEach(function(s){s.addEventListener('change',function(){s.form.requestSubmit()})});
if(window.matchMedia('(max-width:900px)').matches)document.querySelectorAll('aside details').forEach(function(d){d.open=false});
document.querySelectorAll('input[data-suggest]').forEach(function(inp){var box=document.createElement('ul');box.className='dir-suggest';box.hidden=true;box.setAttribute('role','listbox');
inp.setAttribute('autocomplete','off');var wrap=inp.parentNode;if(getComputedStyle(wrap).position==='static')wrap.style.position='relative';wrap.appendChild(box);var t=null,items=[],sel=-1,last='';
function esc(s){return String(s).replace(/[&<>"]/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]})}
function draw(){box.innerHTML=items.map(function(it,i){return '<li role="option" data-i="'+i+'"'+(i===sel?' class="on"':'')+'><span class="k">'+(it.kind==='city'?'📍':'★')+'</span><span class="l">'+esc(it.label)+'</span><span class="m">'+esc(it.kind==='city'?(it.count||''):(it.city||''))+'</span></li>'}).join('');box.hidden=!items.length}
inp.addEventListener('input',function(){clearTimeout(t);var v=inp.value.trim();if(v.length<2){items=[];draw();return}t=setTimeout(function(){if(v===last)return;last=v;fetch(inp.getAttribute('data-suggest')+'?suggest='+encodeURIComponent(v)).then(function(r){return r.json()}).then(function(d){if(inp.value.trim()!==v)return;items=d||[];sel=-1;draw()}).catch(function(){})},150)});
inp.addEventListener('keydown',function(e){if(box.hidden)return;if(e.key==='ArrowDown'){sel=Math.min(items.length-1,sel+1);draw();e.preventDefault()}else if(e.key==='ArrowUp'){sel=Math.max(-1,sel-1);draw();e.preventDefault()}else if(e.key==='Enter'&&sel>=0){e.preventDefault();location.href=items[sel].url}else if(e.key==='Escape'){items=[];draw()}});
box.addEventListener('mousedown',function(e){var li=e.target.closest('li');if(li){e.preventDefault();location.href=items[+li.getAttribute('data-i')].url}});
inp.addEventListener('blur',function(){setTimeout(function(){box.hidden=true},150)});inp.addEventListener('focus',function(){if(items.length)box.hidden=false})});`
}

/** Styles for the search suggestions (sites can override .dir-suggest). */
export const DIRECTORY_CSS = `.req-dialog{width:min(560px,calc(100% - 32px));max-height:calc(100% - 32px);border:0;border-radius:12px;padding:28px;box-shadow:0 30px 80px -20px rgba(0,0,0,.45)}
.req-dialog::backdrop{background:rgba(30,26,24,.55)}.req-dialog h2{margin-top:0;padding-right:32px}.req-close{position:absolute;top:12px;right:12px;width:36px;height:36px;border-radius:50%;border:0;background:transparent;font-size:24px;line-height:1;cursor:pointer;color:inherit;padding:0}
.req-dialog .request{display:grid;grid-template-columns:1fr 1fr;gap:12px}.req-dialog .request .full,.req-dialog .request button{grid-column:1/-1}@media(max-width:560px){.req-dialog .request{grid-template-columns:1fr}.req-dialog{padding:22px 18px}}
.req-login .actions{display:flex;gap:10px;flex-wrap:wrap}
.dual{position:relative;height:28px;margin:4px 2px 0}.dual::before{content:"";position:absolute;left:0;right:0;top:12px;height:4px;border-radius:2px;background:var(--border,#e6ddd8)}
.dual input{position:absolute;left:0;top:0;width:100%;height:28px;margin:0;background:none;-webkit-appearance:none;appearance:none;pointer-events:none;border:0;padding:0;min-height:0;box-shadow:none}
.dual input::-webkit-slider-thumb{-webkit-appearance:none;pointer-events:auto;width:20px;height:20px;border-radius:50%;background:#fff;border:2px solid var(--accent,#b8323f);cursor:pointer;box-shadow:0 1px 4px rgba(0,0,0,.2)}
.dual input::-moz-range-thumb{pointer-events:auto;width:18px;height:18px;border-radius:50%;background:#fff;border:2px solid var(--accent,#b8323f);cursor:pointer}
.dual input::-webkit-slider-runnable-track{background:none}.dual input::-moz-range-track{background:none}.pr-out{font-size:14px;margin:2px 0 6px}
.dir-share{margin:28px 0}
.dir-suggest{position:absolute;left:0;right:0;top:calc(100% + 6px);z-index:50;margin:0;padding:6px;list-style:none;background:#fff;border:1px solid rgba(0,0,0,.12);border-radius:12px;box-shadow:0 12px 32px rgba(0,0,0,.14);max-height:360px;overflow:auto;text-align:left}
.dir-suggest li{display:grid;grid-template-columns:22px 1fr auto;gap:8px;align-items:center;padding:9px 10px;border-radius:8px;cursor:pointer;font-size:15px;color:#222}
.dir-suggest li.on,.dir-suggest li:hover{background:rgba(0,0,0,.06)}.dir-suggest .k{font-size:13px;opacity:.75}.dir-suggest .m{font-size:12px;color:#888}`
