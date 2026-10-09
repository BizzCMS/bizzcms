// Directory plugin: small helpers shared by the directory pages and the company portal.

export { esc, html } from '../../site-accounts'

export function str(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

// The admin media picker may save multiple images as a JSON array, an array, or a comma list.
export function mediaList(value: unknown): string[] {
  let list: unknown[] = []
  if (Array.isArray(value)) list = value
  else if (typeof value === 'string') {
    try { const parsed = JSON.parse(value); list = Array.isArray(parsed) ? parsed : [value] } catch { list = value.split(',') }
  }
  return list.filter((u): u is string => typeof u === 'string').map(u => u.trim()).filter(u => /^(https?:\/\/|\/)/.test(u))
}

export function safeUrl(value?: string): string | undefined {
  return value && /^https?:\/\//i.test(value) ? value : undefined
}

export function safeDecode(value: string): string {
  try { return decodeURIComponent(value) } catch { return value }
}

/** Page numbers to show around the current page; 0 marks a gap (…). */
export function pageWindow(current: number, total: number): number[] {
  const keep = new Set([1, total, current - 1, current, current + 1].filter(n => n >= 1 && n <= total))
  const out: number[] = []
  for (const n of [...keep].sort((a, b) => a - b)) { if (out.length && n - out[out.length - 1] > 1) out.push(0); out.push(n) }
  return out
}

export const truthy = (v: unknown) => [true, 1, 'true', 'on', '1'].includes(v as never)

export function icon(name: 'pin' | 'people' | 'search' | 'grid' | 'list'): string {
  const paths = {
    pin: '<path d="M12 21s-7-6.2-7-11a7 7 0 1 1 14 0c0 4.8-7 11-7 11z"/><circle cx="12" cy="10" r="2.5"/>',
    people: '<circle cx="9" cy="8" r="3"/><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6"/><path d="M16 4.5a3 3 0 0 1 0 6M21 20c0-2.6-1.6-4.8-4-5.6"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
    grid: '<rect x="4" y="4" width="7" height="7" rx="1"/><rect x="13" y="4" width="7" height="7" rx="1"/><rect x="4" y="13" width="7" height="7" rx="1"/><rect x="13" y="13" width="7" height="7" rx="1"/>',
    list: '<path d="M9 6h11M9 12h11M9 18h11"/><circle cx="4.5" cy="6" r="1"/><circle cx="4.5" cy="12" r="1"/><circle cx="4.5" cy="18" r="1"/>'
  }
  return `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name]}</svg>`
}

// SQLite's lower() only folds ASCII: fold accented letters so "dakovo" finds "Đakovo" and "cafe" finds "Café".
const FOLD: [string, string][] = [
  ['Č', 'c'], ['č', 'c'], ['Ć', 'c'], ['ć', 'c'], ['Đ', 'd'], ['đ', 'd'], ['Š', 's'], ['š', 's'], ['Ž', 'z'], ['ž', 'z'],
  ['É', 'e'], ['é', 'e'], ['È', 'e'], ['è', 'e'], ['Á', 'a'], ['á', 'a'], ['Ä', 'a'], ['ä', 'a'], ['Ö', 'o'], ['ö', 'o'], ['Ü', 'u'], ['ü', 'u'],
  ['-', ' ']
]
/** SQL expression: lower(expr) with accents folded, for LIKE searches. */
export const fold = (expr: string) => FOLD.reduce((e, [from, to]) => `replace(${e}, '${from}', '${to}')`, `lower(${expr})`)

/** Progressive enhancement for the filter forms: apply on change; filters collapsed on small screens.
 *  Sites include it once in their layout. */
export function directoryScript(regionParam = 'region', cityParam = 'city'): string {
  return `document.querySelectorAll('form[data-auto]').forEach(function(f){f.addEventListener('change',function(e){
if(e.target.name===${JSON.stringify(regionParam)}&&f.elements[${JSON.stringify(cityParam)}])f.elements[${JSON.stringify(cityParam)}].value='';f.requestSubmit()})});
document.querySelectorAll('[data-auto-submit]').forEach(function(s){s.addEventListener('change',function(){s.form.requestSubmit()})});
if(window.matchMedia('(max-width:900px)').matches)document.querySelectorAll('aside details').forEach(function(d){d.open=false});`
}
