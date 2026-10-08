# Images

BizzCMS keeps images light without anyone having to think about it.

## Uploads are made web-sized

Photos straight from a phone or camera are often 5–10 MB and 4,000+ pixels wide. When you upload in the admin (Media library, editor, featured image), BizzCMS resizes them **in your browser, before the upload**:

- JPEG, PNG and WebP images wider than the maximum width are scaled down and saved as **WebP** (transparency is kept).
- Smaller images are only converted when WebP is smaller than the original.
- GIF (animations), SVG and other files are uploaded as they are.
- Images already in the library are not changed.

Example: a 4000 × 3000 JPEG of 910 KB arrives as a 2000 × 1500 WebP of 82 KB.

**Settings › Images** (administrators):

| Setting | Default | |
|---|---|---|
| Make big images web-sized when uploading | on | Switch it off to upload originals. |
| Maximum width (pixels) | 2000 | 400–6000. 1600 gives smaller files. |
| Quality | 82 | 40–100 (WebP quality). |

## Public pages load images fast

Every Media library image on a public page gets:

- its real **width and height**, so the page doesn't jump while images load (Google's layout shift score). Sizes are read once from the file and kept in KV;
- `decoding="async"` when it loads lazily;
- `fetchpriority="high"` for the first image that isn't lazy (the top image of a post or project), so it arrives first.

## For site code

- `src/image-upload.ts`: `imageUploadRoute(request, path, db, upstream)` serves the settings page and the admin upload script; `addImageUpload(rewriter, path)` in `applyBranding` adds the script and the Images tab.
- `src/image-hints.ts`: wrap the public page handler with `withImageHints(request, response, env.MEDIA_BUCKET, env.CACHE_KV)`. A zero-specificity `height:auto` rule keeps sized images in proportion; any rule of the site's own CSS still wins.
