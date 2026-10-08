// Adapt upstream HTML at the application boundary; never patch node_modules or
// replace names inside saved content, JSON APIs or scripts. Upstream SonicJS is credited
// on the main site (/about) and in the repository (README, licence notices); the admin
// shows BizzCMS everywhere it can, including plugin authors (owner decision, 2026-10-08).
// Package names in code examples (@sonicjs-cms/core) stay, they are real import paths.
import metadata from '../package.json'
import { SIDEBAR_ICONS, MOON_ICON, SUN_ICON, pluginIcon, PLUGIN_TITLES } from './icons'
import { REPEAT_PASSWORD_FIELD } from './auth'

export function applyBranding(response: Response, path: string): Response {
  if (!response.headers.get('content-type')?.includes('text/html')) return response
  if (!path.startsWith('/admin') && !path.startsWith('/auth')) return response

  const rewriter = new HTMLRewriter()
    // Light (white) admin by default. Upstream hard-codes class="dark"; drop it and only
    // re-add it when the user switched to dark with the admin's own toggle (localStorage darkMode).
    .on('html', { element(element) {
      const cls = (element.getAttribute('class') ?? '').split(/\s+/).filter(c => c && c !== 'dark').join(' ')
      if (cls) element.setAttribute('class', cls); else element.removeAttribute('class')
    } })
    .on('head', { element(element) {
      element.prepend(`<script>try{if(localStorage.getItem('darkMode')===null)localStorage.setItem('darkMode','false');if(localStorage.getItem('darkMode')==='true')document.documentElement.classList.add('dark')}catch(e){}</script>`, { html: true })
      // BizzCMS admin theme (public/brand/admin.css) and its font.
      element.append('<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap"><link rel="stylesheet" href="/brand/admin.css?v=workspace-20261008">', { html: true })
      element.append(`<style>.bizz-wordmark{color:#172e30}.bizz-wordmark b{font-weight:inherit;color:#0c8987}.dark .bizz-wordmark{color:#f4f4f5}.dark .bizz-wordmark b{color:#c4f56a}${LIGHT_FIXES}${path.startsWith('/auth') ? LIGHT_AUTH : ''}</style>`, { html: true })
    } })
    .on('title', bufferedText(text => text.replace(/SonicJS AI/g, 'BizzCMS')))
    .on('h1, h2, p', bufferedText(text => {
      // Register shows the site name as its title; "Create your account" says what the page is for.
      if (path.startsWith('/auth/register') && /^\s*(BizzCMS|SonicJS AI)\s*$/.test(text)) return text.replace(/BizzCMS|SonicJS AI/, 'Create your account')
      if (text.trim() === 'SonicJS AI') return text.replace('SonicJS AI', 'BizzCMS')
      // Upstream double-escapes this on the permissions page (shows "Roles &amp; Verbs").
      // Replacement text is escaped on output, so a plain '&' renders as '&'.
      // Upstream double-escapes some entities (shows "&amp;" or "&mdash;" literally). Replacement text is
      // escaped on output, so put back the real characters.
      text = text.replace(/&amp;(amp|mdash|ndash|hellip|rsquo|lsquo|ldquo|rdquo|nbsp);/g, (_m: string, e: string) => ({ amp: '&', mdash: '—', ndash: '–', hellip: '…', rsquo: '’', lsquo: '‘', ldquo: '“', rdquo: '”', nbsp: ' ' } as Record<string, string>)[e])
      return text
        .replace('Welcome to your SonicJS AI admin dashboard', 'Welcome to your BizzCMS admin dashboard')
        .replace('A modern headless CMS powered by AI', 'Lightweight content management for business websites.')
        .replace('SonicJS uses code-first collection definitions', 'BizzCMS uses code-first collection definitions')
    }))
    // Plugin screens: upstream plugin names, authors and descriptions (no user content there).
    .on(path.startsWith('/admin/plugins') ? 'h1, h2, h3, h4, p, span, a, td, dd, dt, li, small, strong' : 'bizz-never-matches', bufferedText(text =>
      (PLUGIN_TITLES[text.trim()] ?? text).replace(/SonicJS (Team|Community)/g, 'BizzCMS').replace(/\bSonicJS\b/g, 'BizzCMS')
        .replace(' — on by default for greenfield installs.', '. On by default.')))
    // Version badge next to the logo: some upstream pages show the SonicJS version; always show BizzCMS's.
    .on('span[class*="text-white/80"][class*="bg-white/10"]', {
      element(element) { element.setInnerContent(metadata.version) }
    })
    // Permissions page: upstream double-escapes "&" in a <strong> ("Roles &amp; Verbs").
    .on(path.startsWith('/admin/rbac') ? 'strong' : 'bizz-never-matches', (() => { let buf = ''; return { text(chunk: Text) {
      buf += chunk.text
      if (!chunk.lastInTextNode) { chunk.remove(); return }
      chunk.replace(buf.replace(/&amp;amp;/g, '&amp;'), { html: true }); buf = ''
    } } })())
    .on('svg[viewBox="380 1300 2250 400"]', {
      element(element) {
        element.replace('<span style="display:inline-flex;align-items:center;gap:10px;white-space:nowrap"><img src="/brand/bizzcms.svg" alt="" width="36" height="40" style="object-fit:contain"><span class="bizz-wordmark" style="font-size:22px;font-weight:600;letter-spacing:-.4px">Bizz<b>CMS</b></span></span>', { html: true })
      }
    })
    .on('link[rel="icon"]', {
      element(element) { element.setAttribute('href', '/brand/bizzcms.svg'); element.setAttribute('type', 'image/svg+xml') }
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
    // Docs menu: the OpenAPI link is the raw JSON spec; say so. Developer docs live on GitHub for now.
    .on('.docsDropdown a[href="/api"]', bufferedText(text => text.replace('OpenAPI', 'OpenAPI spec (JSON)')))
    .on('.docsDropdown a[href="https://sonicjs.com"]', { element(el) { el.setAttribute('href', 'https://github.com/BizzCMS/bizzcms#readme'); el.setAttribute('rel', 'noopener') } })
    .on('nav a[href="/admin/settings"]', {
      element(element) { element.after(SIDEBAR_SWITCH, { html: true }) }
    })
    .on('body', {
      element(element) {
        element.setAttribute('data-bizz-surface', path.startsWith('/auth') ? 'auth' : 'admin')
        // Auth pages without upstream layout (invalid reset link / invitation) get the logo; CSS centres them.
        if (path.startsWith('/auth') && !element.getAttribute('class')) element.prepend(AUTH_LOGO, { html: true })
        if (path === '/admin/content' || path === '/admin/content/') element.setAttribute('data-bizz-content', '')
        if (path.startsWith('/admin/settings')) element.setAttribute('data-bizz-settings', '')
        if (path === '/admin/users') element.setAttribute('data-bizz-users', '')
        if (path === '/admin/dashboard' || path === '/admin') element.setAttribute('data-bizz-dashboard', '')
        if (path.startsWith('/admin/media')) element.setAttribute('data-bizz-media', '')
        if (path === '/admin/collections') element.setAttribute('data-bizz-collections', '')
        element.append('<div style="padding:12px;text-align:center;font:12px system-ui;opacity:.7"><a href="/about">About BizzCMS</a> · <a href="https://bizzcms.com">bizzcms.com</a></div>', { html: true })
        element.append(path.startsWith('/auth') ? THEME_SWITCH : SWITCH_SCRIPT, { html: true })
        element.append(ENTITY_FIX, { html: true })
        if (path === '/admin/dashboard' || path === '/admin') element.append(DASHBOARD_FIX, { html: true })
      }
    })
  // Semantic styling hooks keep the shared theme independent of Tailwind's generated CSS.
  // No template code or assets from the commercial frontend are copied into this public repo.
  if (path.startsWith('/admin')) {
    // The upstream dashboard route exists, but beta.28 omits it from its sidebar.
    rewriter
      .on('nav > div > a[href="/admin/content"]', { element(el) { el.setAttribute('href', '/admin/dashboard'); el.setAttribute('aria-label', 'BizzCMS dashboard') } })
      .on('nav > div.flex-1 > div', { element(el) {
        const current = path === '/admin/dashboard' || path === '/admin'
        el.prepend(`<a href="/admin/dashboard" class="bizz-dashboard-link flex w-full items-center gap-3 rounded-lg px-2 py-2.5 text-left text-sm/5 font-medium"${current ? ' data-current="true" aria-current="page"' : ''}><span>${WORKSPACE_ICON}</span><span>Dashboard</span></a>`, { html: true })
      } })
      .on('nav button[aria-label="Toggle plugins submenu"]', { element(el) { el.remove() } })
      .on('nav [data-plugins-submenu]', { element(el) { el.setAttribute('aria-label', 'Plugin pages') } })
    const section = ({ content: 'Content', collections: 'Collections', users: 'Team', rbac: 'Team', plugins: 'Plugins', media: 'Media', settings: 'Settings', 'two-factor': 'Security' } as Record<string, string>)[path.split('/')[2]] ?? 'Overview'
    rewriter.on('main nav[aria-label="Tabs"], main nav[role="tablist"]', { element(el) { el.setAttribute('data-bizz-tabs', '') } })
    rewriter.on('main > div.grow', { element(el) {
      el.setAttribute('data-bizz-panel', '')
      el.before(`<div class="bizz-workspace-bar"><div><span class="bizz-workspace-symbol" aria-hidden="true">${WORKSPACE_ICON}</span><span>Workspace</span><span class="bizz-breadcrumb-divider" aria-hidden="true">/</span><strong>${section}</strong></div><a href="/" target="_blank" rel="noopener">View website <span aria-hidden="true">↗</span></a></div>`, { html: true })
    } })
  }
  if (path === '/admin/users') {
    rewriter
      .on('#user-search-input', { element(el) { el.setAttribute('aria-label', 'Search users') } })
      .on('select[name="role"]', { element(el) { el.setAttribute('aria-label', 'Filter by role') } })
      .on('select[name="status"]', { element(el) { el.setAttribute('aria-label', 'Filter by status') } })
      // Upstream beta.28 hardcodes these four percentage deltas, unrelated to the real counts.
      .on('main dl dd > div.inline-flex', { element(el) { el.remove() } })
  }
  if (path === '/admin/collections') {
    rewriter.on('#collections-search', { element(el) { el.setAttribute('aria-label', 'Search collections') } })
      .on('#clear-search', { element(el) { el.setAttribute('aria-label', 'Clear collection search') } })
      .on('form[onsubmit="performSearch(event)"] > button[type="submit"]', { element(el) {
        el.setAttribute('aria-label', 'Search collections'); el.setAttribute('title', 'Search collections')
        el.setInnerContent('<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/></svg>', { html: true })
      } })
  }
  if (path === '/admin/dashboard/stats') {
    rewriter.on('dl dd > div.inline-flex', { element(el) { el.remove() } })
      .on('h3', bufferedText(text => text.replace('Last 30 days', 'Workspace overview')))
  }
  if (path.startsWith('/admin/media')) {
    rewriter.on('#media-search-input', { element(el) { el.setAttribute('aria-label', 'Search media files') } })
      .on('select[onchange*="view"]', { element(el) { el.setAttribute('aria-label', 'Media view') } })
  }
  if (path === '/admin/content' || path === '/admin/content/') {
    rewriter
      .on('main h1', bufferedText(text => text.replace('Content Management', 'Your content')))
      // HTMLRewriter has no `+` combinator; the replacement only matches this exact sentence.
      .on('main p', bufferedText(text => text.replace('Manage and organize your content items', 'Create, organise and publish. Everything your website needs, in one place.')))
      .on('div.relative.rounded-xl.mb-6', { element(el) { el.setAttribute('data-bizz-filters', '') } })
      .on('select[name="model"]', { element(el) { el.setAttribute('id', 'bizz-model-filter'); el.setAttribute('aria-label', 'Filter by model') } })
      .on('select[name="status"]', { element(el) { el.setAttribute('id', 'bizz-status-filter'); el.setAttribute('aria-label', 'Filter by status') } })
      .on('#content-search-input', { element(el) { el.setAttribute('aria-label', 'Search content'); el.setAttribute('placeholder', 'Search by title or keyword…') } })
      .on('#clear-content-search', { element(el) { el.setAttribute('aria-label', 'Clear search') } })
      .on('#new-content-dropdown > button', { element(el) { el.setAttribute('aria-controls', 'new-content-menu'); el.setAttribute('aria-expanded', 'false') } })
      .on('body', { element(el) { el.append(CONTENT_ACCESSIBILITY, { html: true }) } })
  }
  if (path.startsWith('/admin/settings')) {
    // Upstream's embedded migration script executes before its outer currentTab const.
    rewriter.on('script', bufferedText(text => text.replaceAll("if (currentTab === 'migrations')", "if (location.pathname.endsWith('/migrations'))"), true))
    const labels: Record<string, string> = { siteName: 'Site Name', adminEmail: 'Admin Email', timezone: 'Timezone', siteDescription: 'Site Description', language: 'Language' }
    rewriter.on('#settings-content input[name], #settings-content select[name], #settings-content textarea[name]', { element(el) {
      const label = labels[el.getAttribute('name') ?? '']
      if (label) el.setAttribute('aria-label', label)
    } })
  }
  // Register: BizzCMS logo instead of upstream's lightning icon, a clear title, and "Repeat password".
  if (path === '/auth/register' || path === '/auth/register/') {
    rewriter
      .on('div.mx-auto.flex.h-12.w-12', { element(el) { el.replace(AUTH_LOGO, { html: true }) } })
      .on('input#password', { element(el) { el.after(REPEAT_PASSWORD_FIELD, { html: true }) } })
  }
  // Plugins: a line icon per plugin instead of emoji, readable names for raw ids, tidier texts.
  if (path.startsWith('/admin/plugins')) {
    let card = ''
    rewriter
      .on('.plugin-card', { element(el) { card = el.getAttribute('data-name') ?? '' } })
      .on('.plugin-card div.w-10.h-10', { element(el) { el.setInnerContent(pluginIcon(card), { html: true }); el.setAttribute('class', 'bizz-plugin-tile') } })
      .on('div.w-16.h-16', { element(el) { el.setInnerContent(pluginIcon(path.split('/')[3] ?? ''), { html: true }); el.setAttribute('class', 'bizz-plugin-tile bizz-plugin-tile-lg') } })  }
  // One consistent line-icon set in the sidebar (src/icons.ts).
  for (const [selector, icon] of SIDEBAR_ICONS) rewriter.on(selector, { element(el) { el.replace(icon, { html: true }) } })
  return rewriter.transform(response)
}

const WORKSPACE_ICON = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>'

// Keep the existing dropdown and filter handlers; add labels and keyboard dismissal only.
const CONTENT_ACCESSIBILITY = `<script>(function(){
  document.querySelectorAll('[data-bizz-filters] label').forEach(function(label){
    var control=label.parentElement.querySelector('select,input');
    if(control&&control.id)label.htmlFor=control.id;
  });
  var button=document.querySelector('#new-content-dropdown>button'),menu=document.getElementById('new-content-menu');
  if(!button||!menu)return;
  new MutationObserver(function(){button.setAttribute('aria-expanded',String(!menu.classList.contains('hidden')))}).observe(menu,{attributes:true,attributeFilter:['class']});
  document.addEventListener('keydown',function(event){
    if(event.key==='Escape'&&!menu.classList.contains('hidden')){menu.classList.add('hidden');button.focus()}
  });
})();</script>`

// Some upstream strings are escaped twice and show "&amp;" or "&mdash;" as text. Fix the visible text
// after load (the HTML rewriter sees these split across chunks, so a server-side fix is unreliable).
// Dashboard: upstream draws its chart in cyan (set in JS, so CSS can't reach it) and shows a
// "System ·" placeholder row when there is no activity. Recolour the chart in the theme
// (teal light, lime dark, following the theme switch) and show a plain empty state.
const DASHBOARD_FIX = `<script>(function(){
function paint(){if(!window.Chart||!Chart.instances)return;var d=document.documentElement.classList.contains('dark');
var line=d?'#c4f56a':'#086568',fill=d?'rgba(196,245,106,.10)':'rgba(8,101,104,.08)',grid=d?'rgba(255,255,255,.06)':'rgba(16,47,49,.07)',tick=d?'#9fb3b0':'#5d7472';
Object.values(Chart.instances).forEach(function(c){c.data.datasets.forEach(function(s){s.borderColor=line;s.backgroundColor=fill;s.pointBackgroundColor=line;s.pointBorderColor=d?'#19292c':'#fff'});
['x','y'].forEach(function(k){var a=c.options.scales&&c.options.scales[k];if(!a)return;if(a.grid)a.grid.color=grid;if(a.ticks)a.ticks.color=tick});c.update('none')})}
function empty(){document.querySelectorAll('main li').forEach(function(li){var t=li.querySelector('p');if(t&&t.textContent.trim()==='No recent activity'&&!li.dataset.bizzEmpty){li.dataset.bizzEmpty='1';li.innerHTML='<p class="bizz-empty">No activity yet. Content and user changes will appear here.</p>'}})}
function run(){paint();empty()}
if(document.readyState==='complete')setTimeout(run,0);else window.addEventListener('load',function(){setTimeout(run,0)});
new MutationObserver(paint).observe(document.documentElement,{attributes:true,attributeFilter:['class']});
document.addEventListener('htmx:afterSwap',empty)})()</script>`

const ENTITY_FIX = `<script>(function(){var map={'&amp;':'&','&mdash;':'—','&ndash;':'–','&hellip;':'…','&rsquo;':'’','&lsquo;':'‘','&ldquo;':'“','&rdquo;':'”','&nbsp;':' '};
var re=/&(amp|mdash|ndash|hellip|rsquo|lsquo|ldquo|rdquo|nbsp);/g;function fix(root){var w=document.createTreeWalker(root,NodeFilter.SHOW_TEXT,{acceptNode:function(n){var p=n.parentNode&&n.parentNode.nodeName;return /^(SCRIPT|STYLE|TEXTAREA|CODE|PRE)$/.test(p)?2:(re.test(n.nodeValue)?1:2)}}),n,list=[];re.lastIndex=0;while(n=w.nextNode())list.push(n);list.forEach(function(t){t.nodeValue=t.nodeValue.replace(re,function(m){return map[m]||m})})}
fix(document.body)})();</script>`

const AUTH_LOGO = '<a href="/auth/login" class="bizz-auth-logo"><img src="/brand/bizzcms.svg" alt="" width="36" height="40"><span class="bizz-wordmark">Bizz<b>CMS</b></span></a>'

// Light/dark switcher: a "Dark mode / Light mode" item under Settings in the admin sidebar,
// and a round button on the sign-in pages (no sidebar there). Upstream stores the choice in
// localStorage.darkMode but has no button for it; this uses the same key.
const SUN = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>'
const MOON = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>'
const SWITCH_SCRIPT = `<script>if(!window.__bizzThemeBound){window.__bizzThemeBound=true;document.addEventListener('click',function(e){if(!e.target.closest('#bizz-theme-switch,.bizz-theme-toggle'))return;var d=document.documentElement.classList.toggle('dark');try{localStorage.setItem('darkMode',String(d))}catch(err){}})}</script>`
const SIDEBAR_SWITCH = `<button type="button" class="bizz-theme-toggle mt-0.5 flex w-full items-center gap-3 rounded-lg px-2 py-2.5 text-left text-sm/5 font-medium text-zinc-950 hover:bg-zinc-950/5 dark:text-white dark:hover:bg-white/5">
<span class="shrink-0 text-zinc-500 dark:text-zinc-400"><span class="bizz-moon">${MOON_ICON}</span><span class="bizz-sun">${SUN_ICON}</span></span>
<span class="truncate"><span class="bizz-moon">Dark mode</span><span class="bizz-sun">Light mode</span></span></button>
<style>.bizz-theme-toggle .bizz-sun{display:none}.dark .bizz-theme-toggle .bizz-sun{display:inline}.dark .bizz-theme-toggle .bizz-moon{display:none}.bizz-theme-toggle svg{display:block}</style>`
const THEME_SWITCH = `<button type="button" id="bizz-theme-switch" title="Switch light / dark" aria-label="Switch light or dark mode"
style="position:fixed;right:18px;bottom:18px;z-index:60;width:40px;height:40px;border-radius:999px;display:flex;align-items:center;justify-content:center;cursor:pointer;border:1px solid rgb(9 9 11/.1);background:#fff;color:#123d62;box-shadow:0 4px 14px rgb(9 9 11/.12)">
<span class="bizz-sun" style="display:none">${SUN}</span><span class="bizz-moon">${MOON}</span></button>
<style>.dark #bizz-theme-switch{background:#27272a!important;color:#f4f4f5!important;border-color:rgb(255 255 255/.12)!important}.dark #bizz-theme-switch .bizz-sun{display:inline!important}.dark #bizz-theme-switch .bizz-moon{display:none}</style>
${SWITCH_SCRIPT}`

// Upstream light-mode gaps: the stats bars (dashboard, users) use bg-zinc-800/75 without a dark: prefix.
const LIGHT_FIXES = [
  'html:not(.dark) dl.bg-zinc-800\\/75{background:#fff}',
  // Glass panels: bg-black/20 + white text on a blurred backdrop, dark-only upstream.
  'html:not(.dark) .bg-black\\/20{background:#fff!important;border-color:rgb(9 9 11/.08)!important;box-shadow:0 1px 3px rgb(9 9 11/.08)!important}',
  'html:not(.dark) [class*="backdrop-blur"] .text-white:not([class*="bg-"]),html:not(.dark) [class*="backdrop-blur"].text-white:not([class*="bg-"]){color:#09090b}',
  'html:not(.dark) [class*="backdrop-blur"] .text-gray-300,html:not(.dark) [class*="backdrop-blur"] .text-gray-400{color:#52525b}',
  'html:not(.dark) .border-white\\/10,html:not(.dark) .border-white\\/20{border-color:rgb(9 9 11/.1)}',
  'html:not(.dark) input.bg-white\\/10,html:not(.dark) select.bg-white\\/10,html:not(.dark) textarea.bg-white\\/10{background:#fff;color:#09090b;border-color:#d4d4d8}',
  'html:not(.dark) .placeholder-gray-300::placeholder{color:#a1a1aa}',
  'html:not(.dark) .bg-white\\/10:not(input):not(select):not(textarea){background:rgb(9 9 11/.05)}',
  'html:not(.dark) .bg-white\\/10.text-white,html:not(.dark) .bg-white\\/10 .text-white:not([class*="bg-"]){color:#09090b}'
].join('')

// Upstream auth pages (login, register, reset) are dark-only; map their classes to a light look.
const LIGHT_AUTH = [
  'html:not(.dark) body.bg-zinc-950{background:#f4f4f5}',
  'html:not(.dark) .bg-zinc-900{background:#fff;--tw-ring-color:rgb(9 9 11/.08)}',
  'html:not(.dark) .text-white{color:#09090b}',
  'html:not(.dark) .text-zinc-400{color:#71717a}',
  'html:not(.dark) .hover\\:text-zinc-300:hover{color:#3f3f46}',
  'html:not(.dark) input.bg-zinc-800,html:not(.dark) select.bg-zinc-800,html:not(.dark) textarea.bg-zinc-800{background:#fff;color:#09090b;--tw-ring-color:#d4d4d8}',
  'html:not(.dark) input.bg-zinc-800:focus{--tw-ring-color:#09090b}',
  'html:not(.dark) button.bg-white{background:#09090b;color:#fff}',
  'html:not(.dark) button.bg-white:hover{background:#27272a}',
  'html:not(.dark) .text-cyan-400{color:#0e7490}'
].join('')

// HTMLRewriter can split a text node into chunks. Buffer until the last chunk
// so names are replaced reliably without touching tags or attributes.
function bufferedText(transform: (text: string) => string, rawScript = false): HTMLRewriterElementContentHandlers {
  let buffer = ''
  return { text(chunk) {
    buffer += chunk.text
    if (chunk.lastInTextNode) { chunk.replace(transform(buffer), { html: rawScript }); buffer = '' }
    else chunk.remove()
  } }
}
