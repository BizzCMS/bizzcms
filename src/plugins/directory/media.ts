// Directory plugin: a company's photos and YouTube videos on its profile.
// - Mosaic at the top (the cover large, up to four more beside it) with a "show all" button.
// - Gallery section: photos in their natural proportions (columns, no cropping) and video tiles.
// - Full-screen viewer for everything: arrows, keyboard (← → Esc), swipe, counter, thumbnail strip.
//   Videos play in the viewer from youtube-nocookie.com, loaded only when opened (no YouTube cookies before).
// No external scripts. Sites can restyle everything through the .dm-* classes.
import { esc } from './util'

export interface MediaItem { kind: 'photo' | 'video'; src: string; thumb: string; id?: string }

/** YouTube video id from a watch / youtu.be / shorts / embed link (null for anything else). */
export function youtubeId(url: string): string | null {
  const m = String(url).trim().match(/^(?:https?:\/\/)?(?:www\.|m\.)?(?:youtube\.com\/(?:watch\?(?:.*&)?v=|shorts\/|embed\/|live\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/)
  return m ? m[1] : null
}

/** The videos field (one link per line, or a list) → unique YouTube ids. */
export function videoIds(value: unknown): string[] {
  const list = Array.isArray(value) ? value.map(String) : String(value ?? '').split(/[\n,\s]+/)
  return [...new Set(list.map(youtubeId).filter((v): v is string => !!v))].slice(0, 12)
}

export function mediaItems(cover: string | undefined, gallery: string[], videos: string[]): MediaItem[] {
  const photos = [...new Set([cover, ...gallery].filter((s): s is string => !!s))]
  return [
    ...photos.map(src => ({ kind: 'photo' as const, src, thumb: src })),
    ...videos.map(id => ({ kind: 'video' as const, src: `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0`, thumb: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`, id }))
  ]
}

export interface MediaText {
  showAll: (n: number) => string; photos: string; videos: string; video: string
  close: string; previous: string; next: string; photoAlt: (title: string, n: number) => string
}

const PLAY = '<svg viewBox="0 0 68 48" width="56" height="40" aria-hidden="true"><path d="M66.5 7.7a8.5 8.5 0 0 0-6-6C55.2.3 34 .3 34 .3S12.8.3 7.5 1.7a8.5 8.5 0 0 0-6 6C.1 13 .1 24 .1 24s0 11 1.4 16.3a8.5 8.5 0 0 0 6 6C12.8 47.7 34 47.7 34 47.7s21.2 0 26.5-1.4a8.5 8.5 0 0 0 6-6C67.9 35 67.9 24 67.9 24s0-11-1.4-16.3z" fill="#e00"/><path d="M45 24 27 14v20z" fill="#fff"/></svg>'

function tile(it: MediaItem, i: number, title: string, t: MediaText, cls: string): string {
  const label = it.kind === 'video' ? `${t.video} ${i + 1}` : t.photoAlt(title, i + 1)
  return `<button type="button" class="${cls}${it.kind === 'video' ? ' dm-isvideo' : ''}" data-dm="${i}" aria-label="${esc(label)}"><img src="${esc(it.thumb)}" alt="${esc(label)}" loading="${i < 5 ? 'eager' : 'lazy'}">${it.kind === 'video' ? `<span class="dm-play">${PLAY}</span>` : ''}</button>`
}

/** Mosaic for the top of the profile (empty string when there is no media). */
export function mediaHero(items: MediaItem[], title: string, t: MediaText): string {
  if (!items.length) return ''
  const shown = items.slice(0, 5)
  return `<div class="dm-hero dm-n${shown.length}">${shown.map((it, i) => tile(it, i, title, t, `dm-tile${i === 0 ? ' dm-main' : ''}`)).join('')}
    ${items.length > 1 ? `<button type="button" class="dm-all" data-dm="0">${esc(t.showAll(items.length))}</button>` : ''}</div>`
}

/** Gallery section (photos in columns, videos as tiles); empty when there is at most the cover. */
export function mediaGallery(items: MediaItem[], title: string, t: MediaText, heading: string): string {
  if (items.length < 2) return ''
  const videos = items.map((it, i) => [it, i] as const).filter(([it]) => it.kind === 'video')
  const photos = items.map((it, i) => [it, i] as const).filter(([it]) => it.kind === 'photo')
  return `<section class="dm-gallery" id="galerija"><h2>${esc(heading)}</h2>
    ${videos.length ? `<div class="dm-videos">${videos.map(([it, i]) => tile(it, i, title, t, 'dm-vtile')).join('')}</div>` : ''}
    ${photos.length > 1 ? `<div class="dm-cols">${photos.map(([it, i]) => tile(it, i, title, t, 'dm-ctile')).join('')}</div>` : ''}</section>`
}

/** The viewer (one per page) with its styles and script. */
export function mediaViewer(items: MediaItem[], title: string, t: MediaText): string {
  if (!items.length) return ''
  const data = JSON.stringify(items.map(it => ({ k: it.kind, s: it.src, t: it.thumb }))).replace(/</g, '\\u003c')
  return `<div class="dm-box" hidden role="dialog" aria-modal="true" aria-label="${esc(title)}">
  <div class="dm-bar"><span class="dm-count"></span><button type="button" class="dm-x" aria-label="${esc(t.close)}">×</button></div>
  <button type="button" class="dm-prev" aria-label="${esc(t.previous)}">‹</button><div class="dm-stage"></div><button type="button" class="dm-next" aria-label="${esc(t.next)}">›</button>
  <div class="dm-strip"></div></div>
<style>${CSS}</style>
<script>(function(){var M=${data},box=document.querySelector('.dm-box');if(!box)return;var st=box.querySelector('.dm-stage'),ct=box.querySelector('.dm-count'),sp=box.querySelector('.dm-strip'),cur=0,last=null,x0=null;
sp.innerHTML=M.map(function(m,i){return '<button type="button" data-i="'+i+'"'+(m.k==='video'?' class="v"':'')+'><img src="'+m.t+'" alt="" loading="lazy"></button>'}).join('');
function show(i){cur=(i+M.length)%M.length;var m=M[cur];st.innerHTML=m.k==='video'?'<iframe src="'+m.s+'" title="${esc(t.video)}" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen></iframe>':'<img src="'+m.s+'" alt="">';
ct.textContent=(cur+1)+' / '+M.length;[].forEach.call(sp.children,function(b,j){b.classList.toggle('on',j===cur)});var on=sp.children[cur];if(on&&on.scrollIntoView)on.scrollIntoView({block:'nearest',inline:'center'});
if(M.length>1){[cur+1,cur-1].forEach(function(j){var n=M[(j+M.length)%M.length];if(n.k==='photo'){var im=new Image();im.src=n.s}})}}
function open(i){last=document.activeElement;box.hidden=false;document.documentElement.classList.add('dm-lock');show(i);box.querySelector('.dm-x').focus()}
function close(){box.hidden=true;st.innerHTML='';document.documentElement.classList.remove('dm-lock');if(last&&last.focus)last.focus()}
document.addEventListener('click',function(e){var b=e.target.closest&&e.target.closest('[data-dm]');if(b){e.preventDefault();open(+b.getAttribute('data-dm'))}});
box.querySelector('.dm-x').onclick=close;box.querySelector('.dm-prev').onclick=function(){show(cur-1)};box.querySelector('.dm-next').onclick=function(){show(cur+1)};
sp.addEventListener('click',function(e){var b=e.target.closest('button');if(b)show(+b.getAttribute('data-i'))});
box.addEventListener('click',function(e){if(e.target===box||e.target===st)close()});
document.addEventListener('keydown',function(e){if(box.hidden)return;if(e.key==='Escape')close();else if(e.key==='ArrowRight')show(cur+1);else if(e.key==='ArrowLeft')show(cur-1)});
st.addEventListener('touchstart',function(e){x0=e.touches[0].clientX},{passive:true});st.addEventListener('touchend',function(e){if(x0===null)return;var d=e.changedTouches[0].clientX-x0;x0=null;if(Math.abs(d)>50)show(cur+(d<0?1:-1))});
if(M.length<2){box.querySelector('.dm-prev').hidden=box.querySelector('.dm-next').hidden=sp.hidden=true}})();</script>`
}

const CSS = `.dm-hero{position:relative;display:grid;gap:8px;grid-template-columns:2fr 1fr 1fr;grid-template-rows:220px 220px;border-radius:var(--radius-lg,16px);overflow:hidden;margin:6px 0 4px}
.dm-hero.dm-n1{grid-template-columns:1fr;grid-template-rows:auto}.dm-hero.dm-n1 .dm-main img{max-height:460px;aspect-ratio:auto;object-fit:contain;background:var(--surface-2,#f4f0ec)}
.dm-hero.dm-n2{grid-template-columns:2fr 1fr;grid-template-rows:440px}.dm-hero.dm-n3{grid-template-columns:2fr 1fr}.dm-hero.dm-n3 .dm-main{grid-row:1/3}
.dm-hero.dm-n4 .dm-main,.dm-hero.dm-n5 .dm-main{grid-row:1/3}.dm-hero.dm-n4{grid-template-columns:2fr 1fr 1fr}.dm-hero.dm-n4 .dm-tile:nth-child(4){grid-column:2/4}
.dm-tile,.dm-ctile,.dm-vtile{position:relative;display:block;border:0;padding:0;margin:0;background:#eee;cursor:zoom-in;overflow:hidden}
.dm-tile img{width:100%;height:100%;object-fit:cover;display:block;transition:transform .5s ease,filter .3s}.dm-tile:hover img{transform:scale(1.03);filter:brightness(.92)}
.dm-isvideo{cursor:pointer}.dm-play{position:absolute;inset:0;display:grid;place-items:center;transition:transform .2s}.dm-isvideo:hover .dm-play{transform:scale(1.08)}
.dm-all{position:absolute;right:14px;bottom:14px;border:1px solid rgba(0,0,0,.15);background:#fff;color:#222;border-radius:999px;padding:9px 16px;font:600 14px/1 system-ui,sans-serif;cursor:pointer;box-shadow:0 4px 14px rgba(0,0,0,.12)}
.dm-gallery{margin-top:36px}.dm-videos{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:12px;margin-bottom:12px}
.dm-vtile{border-radius:12px;aspect-ratio:16/9}.dm-vtile img{width:100%;height:100%;object-fit:cover;display:block}
.dm-cols{columns:3 200px;column-gap:12px}.dm-ctile{width:100%;margin:0 0 12px;break-inside:avoid;border-radius:12px}.dm-ctile img{width:100%;height:auto;display:block;transition:transform .5s ease}.dm-ctile:hover img{transform:scale(1.03)}
.dm-lock,.dm-lock body{overflow:hidden}
.dm-box{position:fixed;inset:0;z-index:10000;background:rgba(12,10,11,.94);display:grid;grid-template-rows:auto 1fr auto;grid-template-columns:64px 1fr 64px;color:#fff}.dm-box[hidden]{display:none}
.dm-bar{grid-column:1/-1;display:flex;justify-content:space-between;align-items:center;padding:12px 16px;font:600 14px system-ui,sans-serif}
.dm-x,.dm-prev,.dm-next{background:none;border:0;color:#fff;font:300 44px/1 system-ui,sans-serif;cursor:pointer;opacity:.85}.dm-x:hover,.dm-prev:hover,.dm-next:hover{opacity:1}
.dm-x{font-size:38px;width:44px;height:44px}.dm-prev,.dm-next{align-self:center;height:80px}
.dm-stage{display:grid;place-items:center;min-height:0;min-width:0;padding:4px}.dm-stage img{max-width:100%;max-height:calc(100vh - 170px);object-fit:contain;border-radius:4px;user-select:none}
.dm-stage iframe{width:min(100%,calc((100vh - 170px) * 16 / 9));aspect-ratio:16/9;border:0;border-radius:6px;background:#000}
.dm-strip{grid-column:1/-1;display:flex;gap:6px;overflow-x:auto;padding:10px 16px 14px;justify-content:safe center}.dm-strip button{flex:none;border:2px solid transparent;padding:0;border-radius:6px;overflow:hidden;opacity:.55;background:none;cursor:pointer;width:72px;height:52px}
.dm-strip button.on{opacity:1;border-color:#fff}.dm-strip button.v{position:relative}.dm-strip button.v::after{content:'▶';position:absolute;inset:0;display:grid;place-items:center;font-size:16px;text-shadow:0 1px 4px #000}.dm-strip img{width:100%;height:100%;object-fit:cover;display:block}
@media (max-width:760px){.dm-hero,.dm-hero.dm-n2,.dm-hero.dm-n3,.dm-hero.dm-n4,.dm-hero.dm-n5{grid-template-columns:1fr;grid-template-rows:260px}.dm-hero .dm-tile:not(.dm-main){display:none}.dm-hero .dm-main{grid-row:auto}
.dm-box{grid-template-columns:0 1fr 0}.dm-prev,.dm-next{display:none}.dm-stage img{max-height:calc(100vh - 150px)}}`
