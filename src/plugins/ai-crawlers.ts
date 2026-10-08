// AI crawlers by purpose, and the robots.txt block for the site's AI policy (SEO › Indexing › AI crawlers).
// Three separate choices, because the big operators now run one bot per purpose:
//   search   – bots that index pages so they can be cited in AI search answers (OAI-SearchBot, Claude-SearchBot…)
//   agents   – fetchers that open a page because a person asked an assistant about it (ChatGPT-User, Claude-User…)
//   training – crawlers that collect text to train models (GPTBot, ClaudeBot, CCBot, Google-Extended…)
// Defaults: search on, agents on, training off. Nobody is opted into training without choosing it.
// robots.txt is a request, not a lock: user-initiated agents often ignore it and some scrapers always do. Blocking
// Google-Extended does NOT remove a site from Google's AI Overviews (those use Googlebot).
// Keep the list up to date with each release (sources: each operator's crawler docs, listed per entry).

export type AiPurpose = 'search' | 'agents' | 'training'

export interface AiBot { ua: string; operator: string; purpose: AiPurpose; docs?: string }

/** Version of the list below; bump it when bots are added or moved. */
export const AI_BOTS_VERSION = '2026-10-09'

export const AI_BOTS: AiBot[] = [
  // OpenAI — https://developers.openai.com/api/docs/bots
  { ua: 'GPTBot', operator: 'OpenAI', purpose: 'training', docs: 'https://developers.openai.com/api/docs/bots' },
  { ua: 'OAI-SearchBot', operator: 'OpenAI', purpose: 'search', docs: 'https://developers.openai.com/api/docs/bots' },
  { ua: 'ChatGPT-User', operator: 'OpenAI', purpose: 'agents', docs: 'https://developers.openai.com/api/docs/bots' },
  // Anthropic — https://support.claude.com/en/articles/8896518
  { ua: 'ClaudeBot', operator: 'Anthropic', purpose: 'training', docs: 'https://support.claude.com/en/articles/8896518' },
  { ua: 'anthropic-ai', operator: 'Anthropic', purpose: 'training' },
  { ua: 'Claude-SearchBot', operator: 'Anthropic', purpose: 'search', docs: 'https://support.claude.com/en/articles/8896518' },
  { ua: 'Claude-User', operator: 'Anthropic', purpose: 'agents', docs: 'https://support.claude.com/en/articles/8896518' },
  // Google — Google-Extended covers Gemini training and grounding, not Search or AI Overviews (Googlebot)
  { ua: 'Google-Extended', operator: 'Google', purpose: 'training', docs: 'https://developers.google.com/search/docs/crawling-indexing/google-common-crawlers' },
  // Perplexity — https://docs.perplexity.ai/docs/resources/perplexity-crawlers.md
  { ua: 'PerplexityBot', operator: 'Perplexity', purpose: 'search', docs: 'https://docs.perplexity.ai/docs/resources/perplexity-crawlers.md' },
  { ua: 'Perplexity-User', operator: 'Perplexity', purpose: 'agents', docs: 'https://docs.perplexity.ai/docs/resources/perplexity-crawlers.md' },
  // Apple — Applebot-Extended is a training opt-out token only; Applebot (search) is not touched
  { ua: 'Applebot-Extended', operator: 'Apple', purpose: 'training', docs: 'https://support.apple.com/HT204683' },
  // Meta — https://developers.facebook.com/docs/sharing/webmasters/web-crawlers/
  { ua: 'meta-externalagent', operator: 'Meta', purpose: 'training', docs: 'https://developers.facebook.com/docs/sharing/webmasters/web-crawlers/' },
  { ua: 'meta-webindexer', operator: 'Meta', purpose: 'search', docs: 'https://developers.facebook.com/docs/sharing/webmasters/web-crawlers/' },
  { ua: 'meta-externalfetcher', operator: 'Meta', purpose: 'agents', docs: 'https://developers.facebook.com/docs/sharing/webmasters/web-crawlers/' },
  // Amazon — https://developer.amazon.com/amazonbot
  { ua: 'Amazonbot', operator: 'Amazon', purpose: 'training', docs: 'https://developer.amazon.com/amazonbot' },
  { ua: 'Amzn-SearchBot', operator: 'Amazon', purpose: 'search', docs: 'https://developer.amazon.com/amazonbot' },
  { ua: 'Amzn-User', operator: 'Amazon', purpose: 'agents', docs: 'https://developer.amazon.com/amazonbot' },
  // Others that only collect training data
  { ua: 'CCBot', operator: 'Common Crawl', purpose: 'training' },
  { ua: 'Bytespider', operator: 'ByteDance', purpose: 'training' }
]

export interface AiPolicy { search: boolean; agents: boolean; training: boolean }
export const AI_POLICY_DEFAULTS: AiPolicy = { search: true, agents: true, training: false }

/** The AI part of robots.txt: one group per blocked bot, between BEGIN/END markers so it never mixes with the
 *  site's own lines. Empty when every purpose is allowed. */
export function aiRobotsBlock(policy: AiPolicy): string[] {
  const blocked = AI_BOTS.filter(b => !policy[b.purpose])
  if (!blocked.length) return []
  return [`# BEGIN BizzCMS AI policy (${AI_BOTS_VERSION})`, ...blocked.flatMap(b => [`User-agent: ${b.ua}`, 'Disallow: /', '']), '# END BizzCMS AI policy', '']
}

/** Content Signals line for the "User-agent: *" group (contentsignals.org): search, AI answers and training. */
export function contentSignal(policy: AiPolicy): string {
  const yn = (v: boolean) => (v ? 'yes' : 'no')
  return `Content-Signal: search=yes, ai-input=${yn(policy.search || policy.agents)}, ai-train=${yn(policy.training)}`
}

/** Which purpose a user agent string belongs to (for the AI Discovery reports), or null. */
export function aiPurposeOf(userAgent: string): AiBot | null {
  const ua = userAgent.toLowerCase()
  return AI_BOTS.find(b => ua.includes(b.ua.toLowerCase())) ?? null
}
