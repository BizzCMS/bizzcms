// Adapt upstream HTML at the application boundary; never patch node_modules or
// replace names inside saved content, JSON APIs or scripts. Upstream SonicJS is credited
// on the main site (/about) and in the repository (README, licence notices); the admin
// shows BizzCMS everywhere it can, including plugin authors (owner decision, 2026-10-08).
// Package names in code examples (@sonicjs-cms/core) stay, they are real import paths.
export function applyBranding(response: Response, path: string): Response {
  if (!response.headers.get('content-type')?.includes('text/html')) return response
  if (!path.startsWith('/admin') && !path.startsWith('/auth')) return response

  const rewriter = new HTMLRewriter()
    // Light (white) admin by default. Upstream hard-codes class="dark"; drop it and only
    // re-add it when the user switched to dark with the admin's own toggle (localStorage darkMode).
    .on('html', { element(element) {
      const cls = (element.getAttribute('class') ?? '').split(/\s+/).filter(c => c && c !== 'dark').join(' ')
      if (cls) element.setAttribute('class', cls); else element.removeAttribute('class')
    } })
    .on('head', { element(element) {
      element.prepend(`<script>try{if(localStorage.getItem('darkMode')===null)localStorage.setItem('darkMode','false');if(localStorage.getItem('darkMode')==='true')document.documentElement.classList.add('dark')}catch(e){}</script>`, { html: true })
      element.append(`<style>.bizz-wordmark{color:#123d62}.dark .bizz-wordmark{color:#f4f4f5}${LIGHT_FIXES}${path.startsWith('/auth') ? LIGHT_AUTH : ''}</style>`, { html: true })
    } })
    .on('title', bufferedText(text => text.replace(/SonicJS AI/g, 'BizzCMS')))
    .on('h1, h2, p', bufferedText(text => {
      if (text.trim() === 'SonicJS AI') return text.replace('SonicJS AI', 'BizzCMS')
      return text
        .replace('Welcome to your SonicJS AI admin dashboard', 'Welcome to your BizzCMS admin dashboard')
        .replace('A modern headless CMS powered by AI', 'Lightweight content management for business websites.')
        .replace('SonicJS uses code-first collection definitions', 'BizzCMS uses code-first collection definitions')
    }))
    // Plugin screens: upstream plugin names, authors and descriptions (no user content there).
    .on(path.startsWith('/admin/plugins') ? 'h1, h2, h3, h4, p, span, div, a, td, dd, dt, li, small, strong' : 'bizz-never-matches', bufferedText(text =>
      text.replace(/SonicJS (Team|Community)/g, 'BizzCMS').replace(/\bSonicJS\b/g, 'BizzCMS')))
    .on('svg[viewBox="380 1300 2250 400"]', {
      element(element) {
        element.replace('<span style="display:inline-flex;align-items:center;gap:10px;white-space:nowrap"><img src="/brand/bizzcms.svg" alt="" width="36" height="40" style="object-fit:contain"><span class="bizz-wordmark" style="font-size:22px;font-weight:600;letter-spacing:-.4px">BizzCMS</span></span>', { html: true })
      }
    })
    .on('link[rel="icon"]', {
      element(element) { element.setAttribute('href', '/brand/bizzcms.svg'); element.setAttribute('type', 'image/svg+xml') }
    })
    .on('a[href="https://sonicjs.com"]', {
      element(element) { element.setAttribute('href', 'https://bizzcms.com') }
    })
    .on('input[name="siteName"]', {
      element(element) {
        if (['SonicJS', 'SonicJS AI'].includes(element.getAttribute('value') ?? '')) element.setAttribute('value', 'BizzCMS')
      }
    })
    .on('textarea[name="siteDescription"]', bufferedText(text =>
      text.trim() === 'A modern headless CMS powered by AI'
        ? 'Lightweight content management for business websites.' : text))
    .on('a[href="/admin/settings"]', {
      element(element) { element.after(SIDEBAR_SWITCH, { html: true }) }
    })
    .on('body', {
      element(element) {
        element.append('<div style="padding:12px;text-align:center;font:12px system-ui;opacity:.7"><a href="/about">About BizzCMS</a> · <a href="https://bizzcms.com">bizzcms.com</a></div>', { html: true })
        element.append(path.startsWith('/auth') ? THEME_SWITCH : SWITCH_SCRIPT, { html: true })
      }
    })
  return rewriter.transform(response)
}

// Light/dark switcher: a "Dark mode / Light mode" item under Settings in the admin sidebar,
// and a round button on the sign-in pages (no sidebar there). Upstream stores the choice in
// localStorage.darkMode but has no button for it; this uses the same key.
const SUN = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>'
const MOON = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>'
const SWITCH_SCRIPT = `<script>document.addEventListener('click',function(e){if(!e.target.closest('#bizz-theme-switch,.bizz-theme-toggle'))return;var d=document.documentElement.classList.toggle('dark');try{localStorage.setItem('darkMode',String(d))}catch(err){}})</script>`
const SIDEBAR_SWITCH = `<button type="button" class="bizz-theme-toggle mt-0.5 flex w-full items-center gap-3 rounded-lg px-2 py-2.5 text-left text-sm/5 font-medium text-zinc-950 hover:bg-zinc-950/5 dark:text-white dark:hover:bg-white/5">
<span class="shrink-0 text-zinc-500 dark:text-zinc-400"><span class="bizz-moon">${MOON.replace('width="18" height="18"', 'width="20" height="20"')}</span><span class="bizz-sun">${SUN.replace('width="18" height="18"', 'width="20" height="20"')}</span></span>
<span class="truncate"><span class="bizz-moon">Dark mode</span><span class="bizz-sun">Light mode</span></span></button>
<style>.bizz-theme-toggle .bizz-sun{display:none}.dark .bizz-theme-toggle .bizz-sun{display:inline}.dark .bizz-theme-toggle .bizz-moon{display:none}.bizz-theme-toggle svg{display:block}</style>`
const THEME_SWITCH = `<button type="button" id="bizz-theme-switch" title="Switch light / dark" aria-label="Switch light or dark mode"
style="position:fixed;right:18px;bottom:18px;z-index:60;width:40px;height:40px;border-radius:999px;display:flex;align-items:center;justify-content:center;cursor:pointer;border:1px solid rgb(9 9 11/.1);background:#fff;color:#123d62;box-shadow:0 4px 14px rgb(9 9 11/.12)">
<span class="bizz-sun" style="display:none">${SUN}</span><span class="bizz-moon">${MOON}</span></button>
<style>.dark #bizz-theme-switch{background:#27272a!important;color:#f4f4f5!important;border-color:rgb(255 255 255/.12)!important}.dark #bizz-theme-switch .bizz-sun{display:inline!important}.dark #bizz-theme-switch .bizz-moon{display:none}</style>
${SWITCH_SCRIPT}`

// Upstream light-mode gaps: the stats bars (dashboard, users) use bg-zinc-800/75 without a dark: prefix.
const LIGHT_FIXES = [
  'html:not(.dark) dl.bg-zinc-800\\/75{background:#fff}',
  // Glass panels: bg-black/20 + white text on a blurred backdrop, dark-only upstream.
  'html:not(.dark) .bg-black\\/20{background:#fff!important;border-color:rgb(9 9 11/.08)!important;box-shadow:0 1px 3px rgb(9 9 11/.08)!important}',
  'html:not(.dark) [class*="backdrop-blur"] .text-white:not([class*="bg-"]),html:not(.dark) [class*="backdrop-blur"].text-white:not([class*="bg-"]){color:#09090b}',
  'html:not(.dark) [class*="backdrop-blur"] .text-gray-300,html:not(.dark) [class*="backdrop-blur"] .text-gray-400{color:#52525b}',
  'html:not(.dark) .border-white\\/10,html:not(.dark) .border-white\\/20{border-color:rgb(9 9 11/.1)}',
  'html:not(.dark) input.bg-white\\/10,html:not(.dark) select.bg-white\\/10,html:not(.dark) textarea.bg-white\\/10{background:#fff;color:#09090b;border-color:#d4d4d8}',
  'html:not(.dark) .placeholder-gray-300::placeholder{color:#a1a1aa}',
  'html:not(.dark) .bg-white\\/10:not(input):not(select):not(textarea){background:rgb(9 9 11/.05)}',
  'html:not(.dark) .bg-white\\/10.text-white,html:not(.dark) .bg-white\\/10 .text-white:not([class*="bg-"]){color:#09090b}'
].join('')

// Upstream auth pages (login, register, reset) are dark-only; map their classes to a light look.
const LIGHT_AUTH = [
  'html:not(.dark) body.bg-zinc-950{background:#f4f4f5}',
  'html:not(.dark) .bg-zinc-900{background:#fff;--tw-ring-color:rgb(9 9 11/.08)}',
  'html:not(.dark) .text-white{color:#09090b}',
  'html:not(.dark) .text-zinc-400{color:#71717a}',
  'html:not(.dark) .hover\\:text-zinc-300:hover{color:#3f3f46}',
  'html:not(.dark) input.bg-zinc-800,html:not(.dark) select.bg-zinc-800,html:not(.dark) textarea.bg-zinc-800{background:#fff;color:#09090b;--tw-ring-color:#d4d4d8}',
  'html:not(.dark) input.bg-zinc-800:focus{--tw-ring-color:#09090b}',
  'html:not(.dark) button.bg-white{background:#09090b;color:#fff}',
  'html:not(.dark) button.bg-white:hover{background:#27272a}',
  'html:not(.dark) .text-cyan-400{color:#0e7490}'
].join('')

// HTMLRewriter can split a text node into chunks. Buffer until the last chunk
// so names are replaced reliably without touching tags or attributes.
function bufferedText(transform: (text: string) => string): HTMLRewriterElementContentHandlers {
  let buffer = ''
  return { text(chunk) {
    buffer += chunk.text
    if (chunk.lastInTextNode) { chunk.replace(transform(buffer)); buffer = '' }
    else chunk.remove()
  } }
}
