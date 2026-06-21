# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Local Preview

No build step. Serve from the project root:

```bash
python -m http.server 8000
# then open http://localhost:8000
```

Do not open HTML files directly via `file://` — CSS and JS use `<base href>` for path resolution, which requires a server or at minimum the base tag to be respected. Direct file opening works for the root `index.html` but breaks navigation links.

## Architecture

Pure static site: HTML + one CSS file + one JS file. No framework, no bundler, no package.json.

```
index.html                  ← homepage
about/index.html            ← team page
about/milestones.html       ← company history
solutions/index.html        ← products & services
solutions/demo.html         ← demo showcase (links to sub-demos)
solutions/demo/             ← individual demo pages go here
solutions/blog/index.html   ← blog listing
css/main.css                ← all styles (single file)
js/main.js                  ← all logic: i18n, nav/footer injection, animations
netlify/functions/          ← serverless API proxies (to be added)
netlify.toml                ← publishes from root, trailing-slash redirects
```

## i18n System

All user-visible text lives in the `T` object at the top of `js/main.js`, structured as `T.ja`, `T.zh`, `T.en`. HTML elements carry a `data-i18n="key"` attribute; `applyTranslations()` fills them at runtime. To add or change text, edit only the `T` object — never hardcode strings in HTML.

## Shared Nav and Footer

Navigation and footer are **not in the HTML files**. They are defined as template literals `NAV_HTML` and `FOOTER_HTML` in `js/main.js` and injected into `#nav-placeholder` / `#footer-placeholder` on `DOMContentLoaded`. All nav links must be updated in `js/main.js`, not in individual HTML files.

## Adding a New Page

1. Create the HTML file with `<base href="[relative path to root]">` in `<head>` — e.g. `<base href="../">` for one level deep, `<base href="../../">` for two levels.
2. Link CSS as `<link rel="stylesheet" href="css/main.css">` and JS as `<script src="js/main.js"></script>` (no leading `/` — the base tag resolves them).
3. Add a `data-page-title="your_key"` attribute to `<body>` and add the title string to `T.ja`, `T.zh`, `T.en` in `js/main.js`.
4. Add the page link to `NAV_HTML` and `FOOTER_HTML` in `js/main.js`.

## CSS Design Tokens

All colors, fonts, and spacing are CSS custom properties in the `:root` block at the top of `css/main.css`. Accent color is `--c-accent: #1D3D2D` (dark green). Font stacks: `--f-serif` for headings, `--f-sans` for body, `--f-mono` for labels/tags.

## Backend (Cloudflare Pages Functions)

Server-side API key proxies live in `functions/api/` and are served at `/api/<name>` (e.g. `/api/translate`, `/api/proofread`, `/api/deepgram-token`). Secrets (`QWEN_API_KEY`, `DEEPGRAM_API_KEY`) are configured as Cloudflare Pages environment variables, never in frontend code. Changing an env var requires a redeploy to take effect.

The legacy `netlify/` directory and `netlify.toml` are dead leftovers from before the Cloudflare migration — do not use them.

### Auth on all API routes

`functions/api/_middleware.js` runs before every `/api/*` route and requires a valid Firebase ID token (`Authorization: Bearer <token>`); anonymous requests get 401. The frontend attaches the token via an `apiFetch` helper. On pages where the Firebase auth module is a separate `<script type="module">` from the main logic script, the token is bridged through `window.sdfGetToken` (see translation/lifestory/analysis); single-module pages (proofreader) call `auth.currentUser.getIdToken()` directly.

## Deployment

Static site auto-deployed via Cloudflare Pages. Push to GitHub `main` → a synced fork builds on the connected Cloudflare account → `senridf.com`. Pushes do not go live instantly; the sync + build must run. The bid-scraper workflow is guarded with `if: github.repository == '...'` so only the source repo runs it (synced copies skip it). See `docs/TOOLS.md` for per-tool details.
