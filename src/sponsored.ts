// Posts › Sponsored: paid or partner posts. A sponsored post stays in the normal blog list, shows a
// "Sponsored" label (plus "Sponsored by <name>", linked when a link is set), and every outbound link in
// its body gets rel="sponsored noopener", which Google requires for paid links, so editors never have to
// add it. "Latest posts" teasers (for example a home-page block) leave sponsored posts out by default:
// add NOT_SPONSORED to their WHERE clause.
export interface Sponsor { name: string; url: string }

/** SQL condition for documents.data: true for posts that are not sponsored. */
export const NOT_SPONSORED = `COALESCE(json_extract(data, '$.sponsored'), 0) NOT IN (1, 'true')`

const escape = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!))

/** The sponsor of a post, or null when the post is not sponsored. */
export function sponsorOf(data: Record<string, unknown>): Sponsor | null {
  if (data.sponsored !== true && data.sponsored !== 'true' && data.sponsored !== 1) return null
  const name = typeof data.sponsoredBy === 'string' ? data.sponsoredBy.trim() : ''
  const url = typeof data.sponsoredUrl === 'string' ? data.sponsoredUrl.trim() : ''
  return { name, url: /^https?:\/\/[^\s"'<>]+$/i.test(url) ? url : '' }
}

// Label texts; a site in another language sets its own once, e.g. setSponsoredLabels({ tag: 'Sponzorirano', by: 'Sponzor:' }).
const LABELS = { tag: 'Sponsored', by: 'Sponsored by' }
export function setSponsoredLabels(labels: Partial<typeof LABELS>): void { Object.assign(LABELS, labels) }

/** Small "Sponsored" label for lists and post headers. */
export function sponsoredTag(className = 'bizz-sponsored-tag'): string {
  return `<span class="${escape(className)}">${escape(LABELS.tag)}</span>`
}

/** "Sponsored by <name>" (linked when the post has a sponsor link); just "Sponsored" without a name. */
export function sponsoredLine(sponsor: Sponsor, className = 'bizz-sponsored'): string {
  if (!sponsor.name) return `<p class="${escape(className)}">${escape(LABELS.tag)}</p>`
  const name = sponsor.url ? `<a href="${escape(sponsor.url)}" rel="sponsored noopener" target="_blank">${escape(sponsor.name)}</a>` : escape(sponsor.name)
  return `<p class="${escape(className)}">${escape(LABELS.by)} ${name}</p>`
}

/** Adds rel="sponsored noopener" to every link that leaves the site (keeps any other rel values). */
export async function markSponsoredLinks(html: string, siteHost: string): Promise<string> {
  const host = siteHost.replace(/^www\./, '').toLowerCase()
  return new HTMLRewriter().on('a[href]', { element(el) {
    let target: URL
    try { target = new URL(el.getAttribute('href') ?? '') } catch { return }
    if (!/^https?:$/.test(target.protocol) || target.hostname.replace(/^www\./, '').toLowerCase() === host) return
    const rel = new Set((el.getAttribute('rel') ?? '').split(/\s+/).filter(Boolean))
    rel.add('sponsored'); rel.add('noopener')
    el.setAttribute('rel', [...rel].join(' '))
  } }).transform(new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8' } })).text()
}
