// The OpenAPI spec at /api: upstream calls it "SonicJS AI API" with SonicJS contacts. Rebrand the
// spec's info block and pretty-print it so it is readable when opened from the admin Docs menu.
// The paths and schemas are left exactly as upstream serves them.
import metadata from '../package.json'

export async function brandApiSpec(response: Response, path: string): Promise<Response> {
  if (path !== '/api' && path !== '/api/') return response
  if (!response.ok || !response.headers.get('content-type')?.includes('application/json')) return response
  let spec: { openapi?: string; info?: Record<string, unknown> }
  try { spec = await response.clone().json() } catch { return response }
  if (!spec.openapi) return response
  spec.info = {
    ...spec.info,
    title: 'BizzCMS API',
    version: metadata.version,
    description: 'REST API for BizzCMS, lightweight content management for business websites. Built on SonicJS.',
    contact: { name: 'BizzCMS', url: 'https://github.com/BizzCMS/bizzcms' },
    license: { name: 'MIT', url: 'https://github.com/BizzCMS/bizzcms/blob/main/LICENSE' }
  }
  const headers = new Headers(response.headers)
  headers.delete('content-length')
  return new Response(JSON.stringify(spec, null, 2), { status: response.status, headers })
}
