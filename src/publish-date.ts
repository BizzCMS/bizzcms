// Keep a post's dates when it is saved or published again. Saving a published item makes the engine write a
// new version row (saveDraft) with created_at = now and no published_at, then publish() sets published_at =
// now. Editing an old post therefore moved it to the top of the blog, the RSS feed and the Content list,
// changed its visible date and datePublished, and told Google it was new. Now:
// - the new version row copies created_at and published_at from the version it replaces (version_of_id,
//   parameter ?5 of the engine's INSERT);
// - publish() keeps an existing published_at; only the first publish sets it to now.
//   cms.fetch(request, envKeepPublishDate(env), ctx)   (composes with envForSection / envForContentSort)

const ENGINE = "UPDATE documents SET is_published = 1, status = 'published', published_at = ?, updated_at = ?, updated_by = ? WHERE id = ?"
const KEEP = "UPDATE documents SET is_published = 1, status = 'published', published_at = COALESCE(published_at, (SELECT MIN(p.published_at) FROM documents p WHERE p.root_id = documents.root_id AND p.id <> documents.id AND p.published_at IS NOT NULL), ?), updated_at = ?, updated_by = ? WHERE id = ?"

// Engine INSERT of a new version: after "1,0,'draft'," come 21 placeholders; #8 is published_at, #20 created_at.
const VERSION_VALUES = /1,0,'draft',((?:\?,){20}\?)/
function keepVersionDates(sql: string): string {
  if (!sql.includes('INSERT INTO documents') || !sql.includes('version_of_id') || !sql.includes('COALESCE(MAX(version_number), 0) + 1')) return sql
  const m = sql.match(VERSION_VALUES)
  if (!m) return sql
  const parts = m[1].split(',')
  parts[7] = 'COALESCE(?, (SELECT published_at FROM documents WHERE id = ?5))'
  parts[19] = 'COALESCE((SELECT created_at FROM documents WHERE id = ?5), ?)'
  return sql.replace(m[0], `1,0,'draft',${parts.join(',')}`)
}

export function envKeepPublishDate<E>(env: E): E {
  const db = (env as unknown as { DB?: D1Database }).DB
  if (!db) return env
  const keep = new Proxy(db, {
    get(target, prop) {
      if (prop === 'prepare') return (sql: string) => target.prepare(keepVersionDates(sql.includes(ENGINE) ? sql.replace(ENGINE, KEEP) : sql))
      const value = Reflect.get(target, prop, target)
      return typeof value === 'function' ? value.bind(target) : value
    }
  })
  return { ...(env as object), DB: keep } as E
}
