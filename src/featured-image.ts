// Posts › Featured image: picked from the Media library in the post editor (stored as the file's URL),
// with an optional description for screen readers. Sites show it on blog lists, the post page and as
// the social share image. Only site paths and https addresses are used, never data: or javascript:.
export interface FeaturedImage { src: string; alt: string }

export function featuredImage(data: Record<string, unknown>, fallbackAlt = ''): FeaturedImage | null {
  const src = typeof data.featuredImage === 'string' ? data.featuredImage.trim() : ''
  if (!/^(https:\/\/|\/(?!\/))[^\s"'<>]+$/i.test(src)) return null
  const alt = typeof data.featuredImageAlt === 'string' && data.featuredImageAlt.trim() ? data.featuredImageAlt.trim() : fallbackAlt
  return { src, alt }
}
