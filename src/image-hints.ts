// Image hints for public pages (BizzCMS): every Media library image (/files/…) gets its real width and
// height, so the page doesn't jump while images load (Google's layout shift score), lazy images decode off
// the main thread, and the first image that isn't lazy (the top image of a post or project) is fetched
// first (fetchpriority="high"). Sizes are read from the first bytes of the file in R2 (WebP, PNG, JPEG,
// GIF) and kept in KV, so each image is measured once. A zero-specificity rule keeps height:auto for
// sized images, which any rule of the site still overrides (cards with object-fit, fixed logo heights).
//   return withImageHints(request, response, env.MEDIA_BUCKET, env.CACHE_KV)   (admin, sign-in and API pass through)

const CSS = '<style>:where(img[width][height]){height:auto}</style>'
const memo = new Map<string, string>()

/** "w h" for a file key, or '' when unknown. */
async function dims(key: string, bucket: R2Bucket, kv?: KVNamespace): Promise<string> {
  if (memo.has(key)) return memo.get(key)!
  let v = (await kv?.get(`bizz:img:${key}`).catch(() => null)) ?? null
  if (v === null) {
    const obj = await bucket.get(key, { range: { offset: 0, length: 65536 } }).catch(() => null)
    const size = obj ? sizeOf(new Uint8Array(await obj.arrayBuffer())) : null
    v = size ? `${size[0]} ${size[1]}` : ''
    if (obj) await kv?.put(`bizz:img:${key}`, v).catch(() => null)
  }
  if (memo.size > 5000) memo.clear()
  memo.set(key, v)
  return v
}

/** Width and height from the start of an image file, or null. */
export function sizeOf(b: Uint8Array): [number, number] | null {
  const u16 = (i: number) => b[i] | (b[i + 1] << 8), u24 = (i: number) => b[i] | (b[i + 1] << 8) | (b[i + 2] << 16)
  const be16 = (i: number) => (b[i] << 8) | b[i + 1], be32 = (i: number) => ((b[i] << 24) | (b[i + 1] << 16) | (b[i + 2] << 8) | b[i + 3]) >>> 0
  const ascii = (i: number, n: number) => String.fromCharCode(...b.subarray(i, i + n))
  if (b.length < 30) return null
  if (ascii(0, 4) === 'RIFF' && ascii(8, 4) === 'WEBP') {
    const chunk = ascii(12, 4)
    if (chunk === 'VP8X') return [u24(24) + 1, u24(27) + 1]
    if (chunk === 'VP8 ') return [u16(26) & 0x3fff, u16(28) & 0x3fff]
    if (chunk === 'VP8L') { const n = b[21] | (b[22] << 8) | (b[23] << 16) | (b[24] << 24); return [(n & 0x3fff) + 1, ((n >> 14) & 0x3fff) + 1] }
    return null
  }
  if (b[0] === 0x89 && ascii(1, 3) === 'PNG') return [be32(16), be32(20)]
  if (ascii(0, 3) === 'GIF') return [u16(6), u16(8)]
  if (b[0] === 0xff && b[1] === 0xd8) {
    let i = 2
    while (i + 9 < b.length) {
      if (b[i] !== 0xff) { i++; continue }
      const m = b[i + 1]
      if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return [be16(i + 7), be16(i + 5)]
      i += 2 + be16(i + 2)
    }
  }
  return null
}

/** Adds the hints to a public HTML page; anything else passes through. */
export function withImageHints(request: Request, response: Response, bucket?: R2Bucket, kv?: KVNamespace): Response {
  if (!bucket || /^\/(admin|auth|api)(\/|$)/.test(new URL(request.url).pathname) || !response.headers.get('content-type')?.includes('text/html')) return response
  let first = true
  return new HTMLRewriter()
    .on('head', { element: el => { el.prepend(CSS, { html: true }) } })
    .on('img', {
      async element(el) {
        const lazy = el.getAttribute('loading') === 'lazy'
        if (lazy && !el.hasAttribute('decoding')) el.setAttribute('decoding', 'async')
        const src = el.getAttribute('src') ?? ''
        const m = src.match(/^(?:https?:\/\/[^/]+)?\/files\/([^?#"]+)/)
        if (!m) return
        if (!lazy && first && !el.hasAttribute('fetchpriority')) { el.setAttribute('fetchpriority', 'high'); first = false }
        if (el.hasAttribute('width') || el.hasAttribute('height')) return
        const d = await dims(decodeURIComponent(m[1]), bucket, kv)
        if (!d) return
        const [w, h] = d.split(' ')
        el.setAttribute('width', w); el.setAttribute('height', h)
      }
    })
    .transform(response)
}
