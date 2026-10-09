// SEO › AI Discovery: is the site easy for search engines and AI assistants to read, cite and link?
// Site checks are worked out on the server from the SEO settings. Page checks run in the admin's browser: it
// reads the sitemap and fetches each page WITHOUT cookies (so the edge cache answers, not the database) and
// without running JavaScript, which is how AI crawlers see a page (GPTBot, ClaudeBot and others don't run JS).
// Per page: reachable, indexable, canonical, title, description, share image, one h1, valid JSON-LD with the
// fields an article needs, and enough text in the HTML itself. Nothing is stored; run it again any time.
// Not measurable here (by design): citations inside AI answers. AI referrals show in Analytics ("AI Assistant").
import { AI_BOTS, AI_BOTS_VERSION, aiRobotsBlock, type AiPolicy } from './ai-crawlers'

interface SiteFacts {
  policy: AiPolicy; hideFromSearch: boolean; orgName: string; orgLogo: string; sameAs: string
  defaultImage: string; defaultDescription: string; llmsText: string; indexNowEnabled: boolean
}

const e = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!))

/** The AI Discovery tab (HTML for the SEO admin page). */
export function aiDiscoveryTab(s: SiteFacts): string {
  const blocked = AI_BOTS.filter(b => !s.policy[b.purpose]).map(b => b.ua)
  const row = (ok: boolean | 'warn', what: string, detail: string) =>
    `<tr><td><span class="bizz-ai-dot ${ok === true ? 'ok' : ok === 'warn' ? 'warn' : 'bad'}" aria-label="${ok === true ? 'OK' : ok === 'warn' ? 'Check' : 'Problem'}"></span></td><td><strong>${e(what)}</strong></td><td>${detail}</td></tr>`
  const sameAs = s.sameAs.split('\n').map(l => l.trim()).filter(Boolean).length
  const site = [
    row(!s.hideFromSearch, 'Visible to search engines', s.hideFromSearch ? 'The whole site is hidden (SEO › Indexing). Nothing below matters until this is off.' : 'Indexing is on.'),
    row(s.policy.search, 'AI search', s.policy.search ? 'Allowed: AI search engines can index the site and cite it in answers.' : 'Blocked in robots.txt: the site will not be cited by AI search engines.'),
    row(s.policy.agents ? true : 'warn', 'AI assistants', s.policy.agents ? 'Allowed: an assistant can open a page when someone asks about it.' : 'Blocked in robots.txt (these fetchers often ignore it).'),
    row(true, 'AI training', s.policy.training ? 'Allowed: crawlers may use the content to train models.' : `Not allowed: ${e(blocked.filter(u => AI_BOTS.find(b => b.ua === u)?.purpose === 'training').join(', '))}.`),
    row(Boolean(s.orgName), 'Organisation in structured data', s.orgName ? `${e(s.orgName)}${s.orgLogo ? ', with logo' : ', <em>no logo set</em>'}${sameAs ? `, ${sameAs} social profile${sameAs === 1 ? '' : 's'}` : ', <em>no social profiles</em>'}.` : 'No name set (SEO › General): pages cannot say who is behind them.'),
    row(s.orgLogo && sameAs ? true : 'warn', 'Logo and social profiles', 'Help search engines and assistants connect the site to the right company (SEO › General).'),
    row(s.defaultImage ? true : 'warn', 'Default share image', s.defaultImage ? 'Set: pages without their own image still show a picture when shared or cited.' : 'Not set (SEO › General): pages without an image share without a picture.'),
    row(s.defaultDescription ? true : 'warn', 'Default description', s.defaultDescription ? 'Set.' : 'Not set (SEO › General).'),
    row(s.indexNowEnabled ? true : 'warn', 'IndexNow', s.indexNowEnabled ? 'On: Bing and others hear about new and changed pages at once.' : 'Off (SEO › Indexing).'),
    row('warn', 'llms.txt', 'Optional. Some assistants read it; Google does not use it. <span data-ai-llms>Checking…</span>')
  ].join('')
  return `<style>
.bizz-ai-dot{display:inline-block;width:10px;height:10px;border-radius:50%}.bizz-ai-dot.ok{background:#16a34a}.bizz-ai-dot.warn{background:#f59e0b}.bizz-ai-dot.bad{background:#dc2626}
.bizz-ai-bar{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin:12px 0}.bizz-ai-bar progress{width:220px}
.bizz-ai-sum{display:flex;flex-wrap:wrap;gap:16px;margin:8px 0 12px;font-size:14px}.bizz-ai-sum b{font-size:20px;display:block}
.bizz-ai-issues{margin:0;padding-left:18px}.bizz-ai-issues li{margin:2px 0}
</style>
<section class="bizz-seo-group"><h2 class="text-base/7 font-semibold text-zinc-950 dark:text-white">Site</h2>
<table class="bizz-seo-table"><tbody>${site}</tbody></table>
<p class="bizz-seo-note">AI crawler rules: <a href="/admin/seo?tab=indexing">SEO › Indexing › AI crawlers</a> (bot list ${AI_BOTS_VERSION}). Cloudflare's own AI bot settings can block crawlers before they reach the site. Visits from ChatGPT, Perplexity, Gemini and Copilot show in Google Analytics as the "AI Assistant" channel; citations inside AI answers cannot be measured from the site.</p>
</section>
<section class="bizz-seo-group" data-ai-pages><h2 class="text-base/7 font-semibold text-zinc-950 dark:text-white">Pages as AI crawlers see them</h2>
<p class="bizz-seo-note">Reads your sitemap and opens each page the way a crawler does: no cookies, no JavaScript. Served from the cache, so it does not slow the site. Checks: reachable, indexable, canonical, title, description, share image, one main heading, valid structured data (articles: headline, date, image, author or publisher, category and tags) and enough text in the page itself.</p>
<div class="bizz-ai-bar"><label>Pages <select data-ai-limit><option value="50">50</option><option value="200" selected>200</option><option value="1000">1,000</option><option value="0">All</option></select></label>
<button type="button" data-ai-run>Check pages</button><button type="button" data-ai-stop hidden>Stop</button><progress data-ai-progress value="0" max="1" hidden></progress><span data-ai-status class="bizz-seo-note"></span></div>
<div class="bizz-ai-sum" data-ai-sum hidden></div>
<label class="bizz-seo-check" data-ai-onlyl hidden><input type="checkbox" data-ai-only checked><span>Show only pages with something to fix</span></label>
<table class="bizz-seo-table" data-ai-table hidden><thead><tr><th></th><th>Page</th><th>Structured data</th><th>To check</th></tr></thead><tbody></tbody></table>
</section>
<script>${PAGE_SCRIPT}</script>`
}

/** The robots.txt lines the policy adds, for the Indexing tab preview. */
export function aiPolicyPreview(policy: AiPolicy): string {
  return aiRobotsBlock(policy).join('\n')
}

// Browser side: sitemap → page list → fetch each page (credentials omitted) → checks. Four at a time.
const PAGE_SCRIPT = String.raw`(function(){
var root=document.querySelector('[data-ai-pages]');if(!root)return;
var $=function(s){return root.querySelector(s)};var run=$('[data-ai-run]'),stop=$('[data-ai-stop]'),bar=$('[data-ai-progress]'),status=$('[data-ai-status]'),table=$('[data-ai-table]'),tbody=table.querySelector('tbody'),sum=$('[data-ai-sum]'),only=$('[data-ai-only]');
var esc=function(s){return String(s).replace(/[&<>"]/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]})};
fetch('/llms.txt',{credentials:'omit'}).then(function(r){var el=document.querySelector('[data-ai-llms]');if(el)el.textContent=r.ok?'Present at /llms.txt.':'Not present.'}).catch(function(){});
var stopped=false,results=[];
function locs(xml){return Array.from(new DOMParser().parseFromString(xml,'application/xml').getElementsByTagName('loc')).map(function(n){return n.textContent.trim()})}
async function sitemapUrls(){var top=await fetch('/sitemap.xml',{credentials:'omit'}).then(function(r){return r.text()});var list=locs(top);
 if(/<sitemapindex/.test(top)){var all=[];for(var i=0;i<list.length;i++){all=all.concat(locs(await fetch(new URL(list[i]).pathname,{credentials:'omit'}).then(function(r){return r.text()})))}return all}return list}
function words(doc){var m=doc.querySelector('main')||doc.querySelector('article')||doc.body;if(!m)return 0;var c=m.cloneNode(true);c.querySelectorAll('script,style,nav,header,footer,noscript').forEach(function(n){n.remove()});return (c.textContent||'').trim().split(/\s+/).filter(Boolean).length}
function nodes(j){var out=[];(Array.isArray(j)?j:[j]).forEach(function(x){if(x&&x['@graph'])out=out.concat(x['@graph']);else if(x)out.push(x)});return out}
async function check(u){var issues=[],bad=false,types=[];var path=new URL(u).pathname+new URL(u).search;
 var r;try{r=await fetch(path,{credentials:'omit',redirect:'follow'})}catch(err){return{u:u,bad:true,issues:['Could not be loaded'],types:[]}}
 if(!r.ok){return{u:u,bad:true,issues:['Answers '+r.status],types:[]}}
 if(r.redirected)issues.push('Redirects to '+new URL(r.url).pathname+' (the sitemap should list the final address)');
 var html=await r.text();var doc=new DOMParser().parseFromString(html,'text/html');
 var robots=(doc.querySelector('meta[name="robots"]')||{}).content||'';if(/noindex/i.test(robots)){issues.push('noindex: hidden from search but listed in the sitemap');bad=true}
 var can=(doc.querySelector('link[rel="canonical"]')||{}).href||'';if(!can)issues.push('No canonical address');else if(new URL(can).pathname+new URL(can).search!==new URL(r.url).pathname+new URL(r.url).search)issues.push('Canonical points elsewhere: '+new URL(can).pathname);
 var t=(doc.querySelector('title')||{}).textContent||'';if(!t.trim()){issues.push('No title');bad=true}else if(t.length>70)issues.push('Long title ('+t.length+' characters)');
 var d=(doc.querySelector('meta[name="description"]')||{}).content||'';if(!d)issues.push('No meta description');else if(d.length<50||d.length>170)issues.push('Description '+d.length+' characters (aim for 120–160)');
 if(!doc.querySelector('meta[property="og:image"]'))issues.push('No share image');
 var h1=doc.querySelectorAll('h1').length;if(h1!==1)issues.push(h1+' main headings (h1); one is best');
 var all=[];doc.querySelectorAll('script[type="application/ld+json"]').forEach(function(s){try{all=all.concat(nodes(JSON.parse(s.textContent)))}catch(err){issues.push('Structured data does not parse');bad=true}});
 if(!all.length)issues.push('No structured data');
 all.forEach(function(n){var ty=[].concat(n['@type']||[]).join('/');if(ty)types.push(ty);
  if(/Article|BlogPosting|NewsArticle/.test(ty)){['headline','datePublished','image'].forEach(function(k){if(!n[k])issues.push(ty+' without '+k)});if(!n.author&&!n.publisher)issues.push(ty+' without author or publisher');if(!n.articleSection)issues.push(ty+' without a category (articleSection)');if(!n.keywords)issues.push(ty+' without tags (keywords)');
   if(n.headline&&t&&t.toLowerCase().indexOf(String(n.headline).toLowerCase().slice(0,30))<0&&(doc.querySelector('h1')||{textContent:''}).textContent.toLowerCase().indexOf(String(n.headline).toLowerCase().slice(0,30))<0)issues.push('Headline differs from the visible title')}});
 var w=words(doc);if(w<150)issues.push('Only '+w+' words in the page itself (thin, or the text needs JavaScript)');
 return{u:u,bad:bad,issues:issues,types:Array.from(new Set(types)).filter(function(x){return !/^(WebSite|Organization|ListItem)$/.test(x)})}}
function render(){var ok=results.filter(function(x){return !x.issues.length}).length,warn=results.filter(function(x){return x.issues.length&&!x.bad}).length,badn=results.filter(function(x){return x.bad}).length;
 sum.hidden=false;sum.innerHTML='<span><b>'+results.length+'</b>checked</span><span><b style="color:#16a34a">'+ok+'</b>fine</span><span><b style="color:#f59e0b">'+warn+'</b>to check</span><span><b style="color:#dc2626">'+badn+'</b>problems</span>';
 table.hidden=false;$('[data-ai-onlyl]').hidden=false;var rows=results.filter(function(x){return !only.checked||x.issues.length}).slice(0,1000);
 tbody.innerHTML=rows.map(function(x){var p=new URL(x.u).pathname;return '<tr><td><span class="bizz-ai-dot '+(x.bad?'bad':x.issues.length?'warn':'ok')+'"></span></td><td><a href="'+esc(p)+'" target="_blank" rel="noopener">'+esc(p)+'</a></td><td>'+esc(x.types.join(', ')||'–')+'</td><td>'+(x.issues.length?'<ul class="bizz-ai-issues">'+x.issues.map(function(i){return '<li>'+esc(i)+'</li>'}).join('')+'</ul>':'Fine')+'</td></tr>'}).join('')}
only.addEventListener('change',render);stop.addEventListener('click',function(){stopped=true});
run.addEventListener('click',async function(){stopped=false;results=[];run.disabled=true;stop.hidden=false;status.textContent='Reading the sitemap…';
 try{var urls=await sitemapUrls();var lim=Number($('[data-ai-limit]').value);if(lim)urls=urls.slice(0,lim);bar.hidden=false;bar.max=urls.length;bar.value=0;var q=urls.slice();
  await Promise.all([0,1,2,3].map(async function(){while(q.length&&!stopped){var u=q.shift();results.push(await check(u));bar.value=results.length;status.textContent=results.length+' of '+urls.length;if(results.length%20===0)render()}}));
  render();status.textContent=(stopped?'Stopped after ':'Done: ')+results.length+' pages.'}catch(err){status.textContent='Could not read the sitemap: '+err.message}
 run.disabled=false;stop.hidden=true})})();`
