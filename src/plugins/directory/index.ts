// BizzCMS Directory plugin: a company directory with category and city pages, company profiles,
// Premium date requests and a portal where companies manage their own profiles.
// A site turns it on in code:
//   setDirectory({ routes, params, taxonomy, text, portal, layout })   once, at startup
//   registerCollections([...siteCollections, ...directoryCollections()])
//   handleDirectory(request, env)          public pages (null for other paths)
//   handleCompanyPortal(request, env, cms)  the company portal (null for other paths)
// See docs/directory.md.
export {
  setDirectory, directorySettings, directoryUrl, alphabetical, categoryUrl, cityUrl, listingUrl, matchRoute, slugify, label, subcategories,
  DEFAULT_TEXT, DEFAULT_PORTAL, DEFAULT_PARAMS, DEFAULT_ROUTES, DEFAULT_TAXONOMY,
  type Category, type DirectoryOptions, type DirectoryText, type PortalSettings, type PageOptions
} from './config'
export { handleDirectory, findListing, listingCardHtml, featuredListings, directoryOverview, directorySitemap, type Card, type Listing } from './directory'
export { handleCompanyPortal } from './portal'
export { directoryCollections } from './collections'
export { directoryPlugin } from './admin'
export { directoryScript, DIRECTORY_CSS, fold } from './util'
