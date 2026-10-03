// Adapt upstream HTML at the application boundary; never patch node_modules or
// replace names inside saved content, JSON APIs, scripts, or plugin authorship.
export function applyBranding(response: Response, path: string): Response {
  if (!response.headers.get('content-type')?.includes('text/html')) return response
  if (!path.startsWith('/admin') && !path.startsWith('/auth')) return response

  const rewriter = new HTMLRewriter()
    .on('head', { element(element) {
      element.append(`<style>.bizz-wordmark{color:${path.startsWith('/auth') ? '#f4f4f5' : '#10283d'}}.dark .bizz-wordmark{color:#f4f4f5}</style>`, { html: true })
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
        element.replace('<span style="display:inline-flex;align-items:center;gap:10px;white-space:nowrap"><img src="/brand/bizzcms.png" alt="" width="36" height="40" style="object-fit:contain"><span class="bizz-wordmark" style="font-size:22px;font-weight:700;letter-spacing:-.6px">BizzCMS</span></span>', { html: true })
      }
    })
    .on('link[rel="icon"]', {
      element(element) { element.setAttribute('href', '/brand/bizzcms.png'); element.setAttribute('type', 'image/png') }
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
