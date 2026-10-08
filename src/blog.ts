import { landingPage } from './landing'
import { featuredImage } from './featured-image'

interface Post { title: string; slug: string; data: string; published_at: number }
export const escapeHtml = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!))
const publicPosts = `type_id = 'posts' AND tenant_id = 'default' AND locale = 'default' AND is_published = 1 AND visible = 1 AND deleted_at IS NULL AND (published_at IS NULL OR published_at <= unixepoch()) AND (expires_at IS NULL OR expires_at > unixepoch())`
const unpack = (post: Post): Record<string, unknown> => { try { return JSON.parse(post.data) } catch { return {} } }
const date = (value: number) => new Date(value * 1000).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })

// A small allowlist keeps editor HTML useful without trusting saved scripts or attributes.
export async function safeArticle(html: string): Promise<string> {
  const allowed = new Set(['p', 'h2', 'h3', 'h4', 'ul', 'ol', 'li', 'strong', 'em', 'b', 'i', 'u', 's', 'blockquote', 'a', 'br', 'hr', 'pre', 'code',
    'img', 'figure', 'figcaption', 'table', 'thead', 'tbody', 'tr', 'th', 'td'])
  const dropped = new Set(['script', 'style', 'iframe', 'object', 'embed', 'svg', 'math', 'template'])
  const result = new HTMLRewriter().on('*', { element(el) {
    if (dropped.has(el.tagName)) { el.remove(); return }
    if (!allowed.has(el.tagName)) { el.removeAndKeepContent(); return }
    // Copy first: removing attributes while iterating the live list throws in HTMLRewriter.
    for (const [name, value] of [...el.attributes]) {
      if (el.tagName === 'a' && name === 'href' && /^(https?:\/\/|mailto:|\/(?!\/)|#)/i.test(value.trim())) continue
      // Images: web or site addresses only (no data: or javascript:), plus alt text and size hints.
      if (el.tagName === 'img' && name === 'src' && /^(https:\/\/|\/(?!\/))/i.test(value.trim())) continue
      if (el.tagName === 'img' && (name === 'alt' || name === 'width' || name === 'height')) continue
      if ((el.tagName === 'th' || el.tagName === 'td') && (name === 'colspan' || name === 'rowspan') && /^\d{1,2}$/.test(value)) continue
      el.removeAttribute(name)
    }
  } }).transform(new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8' } }))
  return result.text()
}
function artwork(index: number, big = false): string {
  return `<div class="blog-art art-${index % 2}${big ? ' art-large' : ''}" aria-hidden="true">${index % 2 === 0 ? '<span class="art-label">THE CLOUDFLARE FOUNDATION</span><div class="art-nodes"><span>Workers</span><i>↔</i><span>D1</span><i>↔</i><span>R2</span></div><span class="art-caption">One clear place for every part.</span>' : '<span class="art-label">MAKE SPACE FOR YOUR NEXT IDEA</span><div class="art-paper"><span>YOUR NEXT STORY</span><b>A little structure.<br>A lot of possibility.</b><i></i><i></i><i></i></div>'}</div>`
}
// The post's Featured image when it has one, otherwise the built-in artwork.
function cover(post: Post, data: Record<string, unknown>, index: number, big = false): string {
  const img = featuredImage(data, post.title)
  return img ? `<div class="blog-art${big ? ' art-large' : ''}"><img src="${escapeHtml(img.src)}" alt="${escapeHtml(img.alt)}" loading="lazy" style="width:100%;height:100%;object-fit:cover"></div>` : artwork(index, big)
}
export async function blogResponse(db: D1Database, version: string, pathname: string): Promise<Response> {
  const headers = { 'content-type': 'text/html; charset=utf-8' }
  const route = pathname.replace(/\/$/, '')
  if (route === '/blog') {
    const { results } = await db.prepare(`SELECT title, slug, data, published_at FROM documents WHERE ${publicPosts} ORDER BY published_at DESC, created_at DESC LIMIT 50`).all<Post>()
    const cards = results.map((post, index) => `<a class="blog-card" href="/blog/${encodeURIComponent(post.slug)}">${cover(post, unpack(post), index)}<div class="blog-card-copy"><span class="eyebrow">BIZZCMS JOURNAL <span>·</span> ${escapeHtml(date(post.published_at))}</span><h2>${escapeHtml(post.title)}</h2><p>${escapeHtml(unpack(post).excerpt)}</p><span class="text-link">Read the story ↗</span></div></a>`).join('')
    return new Response(landingPage(version, false, { title: 'Blog | BizzCMS', description: 'Notes on content, websites and the Cloudflare foundation behind BizzCMS.', body: `<section class="blog-heading"><p class="eyebrow"><span class="dot"></span> THE BIZZCMS JOURNAL</p><h1>Ideas for a<br><em>lighter web.</em></h1><p class="intro">Notes on thoughtful content, simpler websites and the technology behind them.</p></section><section class="blog-grid" aria-label="Latest posts">${cards || '<p>Our first stories are on their way. Check back soon.</p>'}</section>` }), { headers })
  }
  let slug: string
  try { slug = decodeURIComponent(route.slice('/blog/'.length)) } catch { slug = '' }
  const post = await db.prepare(`SELECT title, slug, data, published_at FROM documents WHERE ${publicPosts} AND slug = ? LIMIT 1`).bind(slug).first<Post>()
  if (!post) return new Response(landingPage(version, false, { title: 'Post not found | BizzCMS', description: 'This post is not available.', body: '<section class="about"><p class="eyebrow">404 / NOT FOUND</p><h1>This story isn’t here.</h1><p>It may have moved or is no longer published.</p><a class="text-link" href="/blog">Back to the journal →</a></section>' }), { status: 404, headers })
  const data = unpack(post)
  const body = await safeArticle(typeof data.content === 'string' ? data.content : '')
  const index = post.slug === 'a-clearer-home-for-your-content' ? 1 : 0
  return new Response(landingPage(version, false, { title: `${escapeHtml(post.title)} | BizzCMS`, description: escapeHtml(data.excerpt), body: `<article class="blog-article"><header class="article-heading"><a class="text-link" href="/blog">← All stories</a><p class="eyebrow">BIZZCMS JOURNAL <span>·</span> ${escapeHtml(date(post.published_at))}</p><h1>${escapeHtml(post.title)}</h1><p class="intro">${escapeHtml(data.excerpt)}</p><div class="article-author"><img src="/brand/bizzcms.svg" alt="" width="28" height="30"><span>BizzCMS team <small>Made by Ingenium</small></span></div></header>${cover(post, data, index, true)}<div class="article-prose">${body}</div><aside class="article-end"><h2>A lighter home for your content.</h2><p>Explore the workspace behind these stories.</p><a class="button primary" href="/admin">Open BizzCMS <span>↗</span></a></aside></article>` }), { headers })
}
