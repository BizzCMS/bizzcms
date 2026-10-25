// Lookup indexes for the queries BizzCMS sites run on every page (published lists, slug and page-path
// lookups, the error and not-found logs). The engine's own indexes start with tenant_id, which the sites'
// "type_id = ? AND is_published = 1" queries don't use, so without these D1 reads whole tables and can hit
// its CPU limit under load. Created once per isolate (IF NOT EXISTS: a no-op after the first time, < 50 ms
// on a 6,000-document database). The expressions match the sites' queries exactly; keep the names.

import { schemaOnce } from './schema-once'

const INDEXES = [
  'CREATE INDEX IF NOT EXISTS idx_site_live ON documents(type_id, is_published, published_at)',
  'CREATE INDEX IF NOT EXISTS idx_site_slug ON documents(type_id, lower(slug))',
  "CREATE INDEX IF NOT EXISTS idx_site_page_path ON documents(json_extract(data, '$.path'))",
  'CREATE INDEX IF NOT EXISTS idx_documents_updated_at ON documents(updated_at)',
  // Old-address lookups (/news/post/<old id>, directory profiles): the sites compare the bare json_extract, the
  // directory plugin compares CAST(... AS INTEGER); an expression index only helps the form it was built from.
  "CREATE INDEX IF NOT EXISTS idx_site_legacy_id ON documents(json_extract(data, '$.legacyId'))",
  "CREATE INDEX IF NOT EXISTS idx_site_legacy_id_int ON documents(CAST(json_extract(data, '$.legacyId') AS INTEGER))",
  // Blog | News sections: the exact COALESCE expression of src/sections.ts and src/plugins/seo.ts, newest first
  // (same definition as the sites' sql/indexes.sql, so running either one first gives the same index).
  "CREATE INDEX IF NOT EXISTS idx_site_section ON documents(type_id, is_published, COALESCE(NULLIF(json_extract(data, '$.section'), ''), 'blog'), published_at)",
  'CREATE INDEX IF NOT EXISTS idx_error_log_at ON bizz_error_log(at)',
  'CREATE INDEX IF NOT EXISTS idx_error_log_reference ON bizz_error_log(reference)',
  'CREATE INDEX IF NOT EXISTS idx_not_found_last_seen ON bizz_not_found(last_seen)'
]

let done = false

/** Creates the indexes once per isolate. A table that doesn't exist yet (no error logged so far) is
 *  retried by the next isolate. */
export async function ensureSiteIndexes(db: D1Database): Promise<void> {
  if (done) return
  done = true
  // Once per deploy too (src/schema-once.ts): a missing table throws, so the step is not remembered.
  await schemaOnce('site_indexes', async () => {
    let missing = false
    for (const sql of INDEXES) await db.prepare(sql).run().catch(() => { missing = true })
    if (missing) throw new Error('index table missing')
  }).catch(() => { done = false })
}
