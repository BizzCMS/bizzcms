// Adapt upstream HTML at the application boundary; never patch node_modules or
// replace names inside saved content, JSON APIs, scripts, or plugin authorship.
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
    }))
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
    .on('body', {
      element(element) {
        element.append('<div style="padding:12px;text-align:center;font:12px system-ui;opacity:.7"><a href="/about">About BizzCMS</a> · <a href="https://bizzcms.com">bizzcms.com</a></div>', { html: true })
      }
    })
  return rewriter.transform(response)
}

// Upstream light-mode gaps: the stats bars (dashboard, users) use bg-zinc-800/75 without a dark: prefix.
const LIGHT_FIXES = 'html:not(.dark) dl.bg-zinc-800\\/75{background:#fff}'

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
