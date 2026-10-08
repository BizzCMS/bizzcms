// Image uploads (BizzCMS): big photos are made web-sized in the browser before they are uploaded, so
// nobody fills the site with 10 MB camera files. JPEG, PNG and WebP wider than the maximum are scaled
// down and saved as WebP (transparency kept); smaller ones are only converted when that saves space.
// GIF, SVG and other files are never touched. Works for every upload in the admin (Media library,
// editor, featured image) because the script wraps the browser's upload calls (fetch and XHR).
// Admin › Settings › Images (bizz_settings 'media.settings'): on/off, maximum width, WebP quality.
//   route:  const img = await imageUploadRoute(request, path, db, upstream); if (img) return applyBranding(img, path)
//   pages:  addImageUpload(rewriter, path) inside applyBranding (script on admin pages, Settings tab)

type Fetcher = (request: Request) => Promise<Response>

export interface ImageSettings { resize: boolean; maxWidth: number; quality: number }
const DEFAULTS: ImageSettings = { resize: true, maxWidth: 2000, quality: 82 }
let cache: { at: number; value: ImageSettings } | null = null

export async function imageSettings(db: D1Database): Promise<ImageSettings> {
  if (cache && Date.now() - cache.at < 30_000) return cache.value
  let value = { ...DEFAULTS }
  try {
    const row = await db.prepare("SELECT value FROM bizz_settings WHERE key = 'media.settings'").first<{ value: string }>()
    if (row) value = { ...DEFAULTS, ...JSON.parse(row.value) }
  } catch { /* defaults */ }
  cache = { at: Date.now(), value }
  return value
}

const TAB_OFF = 'flex items-center space-x-2 px-4 py-3 text-sm font-medium transition-colors border-b-2 whitespace-nowrap no-underline border-transparent text-zinc-500 dark:text-zinc-400 hover:text-zinc-950 dark:hover:text-white'
const TAB_ON = 'flex items-center space-x-2 px-4 py-3 text-sm font-medium transition-colors border-b-2 whitespace-nowrap no-underline border-zinc-950 dark:border-white text-zinc-950 dark:text-white'
const TAB_ICON = '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-5-5L5 21"/></svg>'

/** Registers the admin parts on applyBranding's rewriter: the upload script on every admin page and the
 *  Images tab on the settings pages. */
export function addImageUpload(rewriter: HTMLRewriter, path: string): HTMLRewriter {
  if (!path.startsWith('/admin')) return rewriter
  let added = false
  rewriter.on('body', { element: el => { el.append('<script src="/admin/bizz/images/upload.js" defer></script>', { html: true }) } })
  if (path.startsWith('/admin/settings')) rewriter.on('nav[role="tablist"]', { element: el => {
    if (added) return; added = true
    const on = path === '/admin/settings/images'
    el.append(`<a href="/admin/settings/images" data-tab="images" class="${on ? TAB_ON : TAB_OFF}"${on ? ' aria-current="page"' : ''}>${TAB_ICON}<span>Images</span></a>`, { html: true })
  } })
  return rewriter
}

async function me(request: Request, fetcher: Fetcher): Promise<{ role?: string } | null> {
  const cookie = request.headers.get('cookie')
  if (!cookie) return null
  const res = await fetcher(new Request(new URL('/auth/me', request.url), { headers: { cookie } }))
  if (!res.ok) return null
  return ((await res.json().catch(() => null)) as { user?: { role?: string } } | null)?.user ?? null
}

/** /admin/bizz/images/upload.js (the script, with the settings) and /admin/settings/images (the page). */
export async function imageUploadRoute(request: Request, path: string, db: D1Database, fetcher: Fetcher): Promise<Response | null> {
  if (path === '/admin/bizz/images/upload.js') {
    const s = await imageSettings(db)
    return new Response(`window.__bizzImages=${JSON.stringify(s)};\n${SCRIPT}`, { headers: { 'content-type': 'text/javascript; charset=utf-8', 'cache-control': 'no-store' } })
  }
  if (path !== '/admin/settings/images') return null
  const url = new URL(request.url)
  const user = await me(request, fetcher)
  if (!user) return Response.redirect(new URL('/auth/login?redirect=/admin/settings/images', url).toString(), 302)
  if (user.role !== 'admin') return new Response('Only administrators can change image settings.', { status: 403 })
  if (request.method === 'POST') {
    const origin = request.headers.get('origin')
    if (origin && origin !== url.origin) return new Response('Forbidden', { status: 403 })
    const f = await request.formData()
    const num = (k: string, d: number, min: number, max: number) => { const n = Math.round(Number(f.get(k))); return Number.isFinite(n) && n ? Math.min(Math.max(n, min), max) : d }
    const value: ImageSettings = { resize: f.get('resize') === 'on', maxWidth: num('maxWidth', DEFAULTS.maxWidth, 400, 6000), quality: num('quality', DEFAULTS.quality, 40, 100) }
    await db.prepare('CREATE TABLE IF NOT EXISTS bizz_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at INTEGER NOT NULL)').run()
    await db.prepare("INSERT INTO bizz_settings (key, value, updated_at) VALUES ('media.settings', ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at").bind(JSON.stringify(value), Date.now()).run()
    cache = null
    return Response.redirect(new URL('/admin/settings/images?saved=1', url).toString(), 303)
  }
  const s = await imageSettings(db)
  const body = `<div class="space-y-6 bizz-api-settings">
    <div><h3 class="text-lg/7 font-semibold text-zinc-950 dark:text-white">Images</h3>
    <p class="mt-1 text-sm/6 text-zinc-500 dark:text-zinc-400">Photos straight from a phone or camera are often 5–10 MB. BizzCMS makes them web-sized in your browser before they are uploaded, so pages stay fast and storage stays small. On public pages every image also gets its size and loads lazily.</p></div>
    ${url.searchParams.has('saved') ? '<p class="bizz-api-saved">Saved. New uploads use these settings.</p>' : ''}
    <form method="post" class="bizz-seo-form">
      <label class="bizz-seo-check"><input type="checkbox" name="resize"${s.resize ? ' checked' : ''}><span><strong>Make big images web-sized when uploading</strong><small>JPEG, PNG and WebP images wider than the maximum are scaled down and saved as WebP (transparency is kept). Smaller images are only converted when that makes them smaller. GIF, SVG and other files are uploaded as they are. Images already in the library are not changed.</small></span></label>
      <label class="bizz-seo-field"><span>Maximum width (pixels)</span><input type="number" name="maxWidth" min="400" max="6000" step="100" value="${s.maxWidth}"><small>2000 is sharp on large and high-resolution screens. Use 1600 for smaller files.</small></label>
      <label class="bizz-seo-field"><span>Quality (40–100)</span><input type="number" name="quality" min="40" max="100" step="1" value="${s.quality}"><small>82 looks the same as the original to the eye at a fraction of the size.</small></label>
      <div><button type="submit" class="bg-zinc-950">Save changes</button></div>
    </form>
  </div>`
  const base = await fetcher(new Request(new URL('/admin/settings/general', url), { headers: request.headers }))
  if (!base.ok || !base.headers.get('content-type')?.includes('text/html')) return base
  return new HTMLRewriter()
    .on('#settings-content', { element: el => { el.setInnerContent(body, { html: true }) } })
    .on('nav[role="tablist"] a[href="/admin/settings/general"]', { element: el => { el.setAttribute('class', TAB_OFF); el.removeAttribute('aria-current') } })
    .on('title', { element: el => { el.setInnerContent('Images - BizzCMS') } })
    .transform(new Response(base.body, base))
}

// The browser part. Plain ES5-style script, no template-literal escapes (it is checked with node --check).
const SCRIPT = String.raw`;(function () {
  var S = window.__bizzImages || {}
  if (!S.resize || !window.createImageBitmap) return
  var TYPES = ['image/jpeg', 'image/png', 'image/webp']
  function shrink(file) {
    if (!(file instanceof File) || TYPES.indexOf(file.type) < 0) return Promise.resolve(file)
    return createImageBitmap(file).then(function (bmp) {
      var scale = bmp.width > S.maxWidth ? S.maxWidth / bmp.width : 1
      var w = Math.round(bmp.width * scale), h = Math.round(bmp.height * scale)
      var canvas = document.createElement('canvas')
      canvas.width = w; canvas.height = h
      canvas.getContext('2d').drawImage(bmp, 0, 0, w, h)
      if (bmp.close) bmp.close()
      return new Promise(function (done) { canvas.toBlob(done, 'image/webp', S.quality / 100) }).then(function (blob) {
        // Keep the original when the browser can't make WebP, or when nothing was resized and WebP isn't smaller.
        if (!blob || blob.type !== 'image/webp' || (scale === 1 && blob.size >= file.size)) return file
        var name = file.name.replace(/\.[^.]+$/, '') + '.webp'
        return new File([blob], name, { type: 'image/webp', lastModified: file.lastModified })
      })
    }).catch(function () { return file })
  }
  function prepare(fd) {
    var jobs = []
    fd.forEach(function (value, key) { if (value instanceof File && TYPES.indexOf(value.type) >= 0) jobs.push([key, value]) })
    if (!jobs.length) return Promise.resolve(fd)
    var out = new FormData()
    var done = []
    fd.forEach(function (value, key) { done.push([key, value]) })
    return Promise.all(done.map(function (p) { return p[1] instanceof File ? shrink(p[1]) : p[1] })).then(function (vals) {
      done.forEach(function (p, i) { if (vals[i] instanceof File) out.append(p[0], vals[i], vals[i].name); else out.append(p[0], vals[i]) })
      return out
    })
  }
  var send = XMLHttpRequest.prototype.send
  XMLHttpRequest.prototype.send = function (body) {
    var xhr = this
    if (!(body instanceof FormData)) return send.call(xhr, body)
    prepare(body).then(function (fd) { send.call(xhr, fd) }, function () { send.call(xhr, body) })
  }
  var origFetch = window.fetch
  window.fetch = function (input, init) {
    if (init && init.body instanceof FormData) {
      return prepare(init.body).then(function (fd) { var copy = {}; for (var k in init) copy[k] = init[k]; copy.body = fd; return origFetch.call(window, input, copy) })
    }
    return origFetch.call(window, input, init)
  }
})()
`
