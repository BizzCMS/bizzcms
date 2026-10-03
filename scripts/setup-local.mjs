import { randomBytes, randomUUID, pbkdf2Sync } from 'node:crypto'
import { existsSync, mkdirSync, writeFileSync, readFileSync, appendFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

// Always use this repository's local emulator. Never provision remote resources.
process.chdir(fileURLToPath(new URL('..', import.meta.url)))
process.env.WRANGLER_SEND_METRICS = 'false'

if (!existsSync('.dev.vars')) {
  writeFileSync('.dev.vars', `BETTER_AUTH_SECRET="${randomBytes(32).toString('hex')}"\n`)
}
if (!/^JWT_SECRET=/m.test(readFileSync('.dev.vars', 'utf8'))) {
  appendFileSync('.dev.vars', `\nJWT_SECRET="${randomBytes(32).toString('hex')}"\n`)
}

const migration = spawnSync(process.execPath, [
  'node_modules/wrangler/bin/wrangler.js', 'd1', 'migrations', 'apply', 'DB', '--local'
], { stdio: 'inherit', env: { ...process.env, CI: 'true' } })
if (migration.error) throw migration.error
if (migration.status !== 0) process.exit(migration.status ?? 1)

const { getPlatformProxy } = await import('wrangler')
const { bootstrapDocumentTypes, RbacService } = await import('@sonicjs-cms/core')
const { env, dispose } = await getPlatformProxy()
try {
  const email = 'admin@bizzcms.local'
  const existing = await env.DB.prepare('SELECT id FROM auth_user WHERE email = ?').bind(email).first()
  let userId = existing?.id
  if (!existing) {
    const password = randomBytes(18).toString('base64url')
    const salt = randomBytes(16)
    const hash = pbkdf2Sync(password, salt, 100000, 32, 'sha256').toString('hex')
    const passwordHash = `pbkdf2:100000:${salt.toString('hex')}:${hash}`
    userId = randomUUID()
    const now = Date.now()
    // Write credentials before inserting the account so a partial failure cannot lose them.
    mkdirSync('private', { recursive: true })
    writeFileSync('private/local-admin.txt', `Local BizzCMS only\nURL: http://127.0.0.1:8787/auth/login\nEmail: ${email}\nPassword: ${password}\n`)
    await env.DB.batch([
      env.DB.prepare('INSERT INTO auth_user (id, email, first_name, last_name, role, is_active, created_at, updated_at, name) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
        .bind(userId, email, 'BizzCMS', 'Admin', 'admin', 1, now, now, 'BizzCMS Admin'),
      env.DB.prepare('INSERT INTO auth_account (id, user_id, account_id, provider_id, password, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
        .bind(randomUUID(), userId, userId, 'credential', passwordHash, now, now)
    ])
    console.log('Created local administrator. Credentials: private/local-admin.txt')
  } else {
    console.log('Local administrator already exists; password and content unchanged.')
  }
  await bootstrapDocumentTypes(env.DB)
  const rbac = new RbacService(env.DB)
  await rbac.ensureSystemRbacSeed()
  await rbac.addUserRoleByName(userId, 'admin')
  console.log('Local setup complete. Run npm run dev and open http://127.0.0.1:8787/admin')
} finally {
  await dispose()
}
