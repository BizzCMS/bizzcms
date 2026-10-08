// SonicJS seeds a "Welcome to SonicJS" blog post on startup, and seeds it again (for example
// after a SonicJS upgrade) whenever no post with the slug 'welcome-to-sonicjs' exists.
// BizzCMS turns that post into "Welcome to BizzCMS" and leaves a deleted placeholder with
// the old slug, so upstream never brings its own version back. Idempotent and cheap: once
// done, an isolate skips it.

const OLD_SLUG = 'welcome-to-sonicjs'
const NEW_SLUG = 'welcome-to-bizzcms'
const TITLE = 'Welcome to BizzCMS'
const CONTENT = '<p>Welcome to BizzCMS. This first post shows that your blog is ready. Edit it or delete it, then write your own.</p>'

let done = false

export async function ensureBizzWelcome(db: D1Database): Promise<void> {
  if (done) return
  const live = await db.prepare(
    `SELECT id, data FROM documents WHERE type_id = 'blog_post' AND slug = ? AND deleted_at IS NULL AND title LIKE '%SonicJS%'`
  ).bind(OLD_SLUG).all<{ id: string; data: string }>()
  for (const row of live.results) {
    const data = safeJson(row.data)
    Object.assign(data, { title: TITLE, slug: NEW_SLUG, content: CONTENT, excerpt: 'Welcome to BizzCMS.' })
    if ('author' in data) data.author = 'BizzCMS'
    if ('tags' in data) data.tags = 'welcome,bizzcms'
    await db.prepare(`UPDATE documents SET title = ?, slug = ?, data = ? WHERE id = ?`)
      .bind(TITLE, NEW_SLUG, JSON.stringify(data), row.id).run()
  }
  // Placeholder so upstream's "does the welcome post exist?" check stays satisfied.
  const placeholder = await db.prepare(
    `SELECT id FROM documents WHERE type_id = 'blog_post' AND slug = ? AND is_current_draft = 1 LIMIT 1`
  ).bind(OLD_SLUG).first()
  if (!placeholder) {
    const typeExists = await db.prepare(`SELECT id FROM document_types WHERE id = 'blog_post' LIMIT 1`).first()
    if (!typeExists) return // upstream has not seeded its types yet; try again on a later request
    const now = Math.floor(Date.now() / 1000)
    const id = 'bizzcms-welcome-placeholder'
    await db.prepare(
      `INSERT OR IGNORE INTO documents (id, root_id, version_number, type_id, tenant_id, locale, slug, title, data,
         sort_order, visible, is_current_draft, is_published, status, created_at, updated_at, deleted_at)
       VALUES (?, ?, 1, 'blog_post', 'default', 'default', ?, 'Upstream welcome post (replaced by BizzCMS)', '{}', 0, 0, 1, 0, 'draft', ?, ?, ?)`
    ).bind(id, id, OLD_SLUG, now, now, now).run()
  }
  done = true
}

function safeJson(value: string): Record<string, unknown> {
  try { return (typeof value === 'string' ? JSON.parse(value) : value) ?? {} } catch { return {} }
}
