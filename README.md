# HIM Robotics — rebranded Next.js site

This is the **customized build**: the `next-app` clone (a 100% fidelity Next.js port of the
captured site — original compiled CSS/JS chunks, webfonts, images and Three.js models) with
its text and branding replaced for **HIM Robotics** (himrobo.com).

`next-app/` remains the pristine, untouched clone. Every customization lives in this folder.

## Run it

```
node server.mjs 3300        # -> http://localhost:3300
# or:  npm run start -- 3300
```

No rebuild is needed after editing `content/` or `vendor/` (both are read at runtime);
only changes under `app/` or to `server.mjs` require `npm run build`.

## What was rebranded

- **Brand** — Mind Robotics / MIND ROBOTICS / Mind Robotics, LLC → HIM Robotics / HIM ROBOTICS / HIM Robotics LLP (titles, meta, copy, footer, aria-labels, legal text)
- **Copy** — hero headline, About ("Who We Are") paragraphs, the data paragraphs and the outro use HIM Robotics marketing copy; the hero sentence keeps the original word-by-word animation structure
- **Services** — the factory-floor section's four items are HIM Robotics' offerings: **Knowledge based consulting, Technology Solutions, Recommender Systems, Labs / Research**, each with a description summarizing its sub-topics (design and manufacturing intelligence; robotics and IoT; risk prediction and anomaly detection; gesture recognition, visual inspection and AI). The titles live in both `content/index.html` and the scene-config chunk (`2tvcy0m4g8gry.js`) so hydration stays consistent
- **Hero wordmark** — the giant letters were SVG artwork, not text: the H was authored and the I/M glyphs re-posed from the originals (svg markup in `content/index.html`, glyph data in the patched chunk, `--index-start` adjusted from 4 to 3)
- **Monogram mark** — the small header/footer "M" mark (left pill + dot + right pill) is now an **H** (left pill + full-width crossbar + right pill) on all four pages; the favicon (a mis-named PNG) became a real SVG with the matching micro-H
- **Logo** — the real himrobo.com lockup (orange "him" + "obotics" + "intelligence . heuristics") visually replaces the header/footer monogram: `public/images/logo.png` (source PNG with its dead margins cropped; pre-crop copy in `tools/_mark-backup/logo-source.png`) is painted as a background over the monogram SVGs by the appended CSS block — markup and RSC payload stay untouched, so hydration is unaffected
- **Giant white marks** — the two scroll-driven "m" constructions (below the hero wordmark, and in the video/Play section) keep their round middle element as a **dot at the centre**: the stems are aligned, and the dot stays at 50% of the stem height at every scroll step (the video mark's dot is still the Play button)
- **Contact** — Pune, India · +91-8975758372 · sales@himrobo.com · himrobo.com (footer + job links); the header **Contact button opens a contact-form dialog** (see below)
- **Primary color** — the cyan/teal accent `#299093` → a deep, calm orange `#e05c00` (first swapped to the logo's exact `#ff6600`, then softened on request to reduce glare; CSS theme var, JS `COLORS` map, hero tag-pill inline styles in markup + RSC payload; same-length replaces so flight T-rows stay aligned). The palette's `#ffbd00` (yellow) and `#ef6156` (red) are intentionally unchanged; the logo image itself keeps its original vivid orange
- **3D models** — the robots' cyan-blue parts are orange too (see `tools/recolor-glb.mjs`):
  - hero arm/hand (`arm.glb`, `hand.glb`): material `blue` baseColorFactor → `[224/255, 92/255, 0]` — the toon pipeline (`resolveMayaColor`) displays it as exactly `#e05c00`
  - service scenes (`pick-and-place.glb`, `sorting.glb`, `fastening.glb`, `connectors.glb`): the `#299093` hex baked into material/node names → `#e05c00` (those scenes resolve each material's color from the hex in its name)
  - originals kept in `tools/_models-backup/`
- **Links** — "Join us" / job links → `mailto:sales@himrobo.com`
- **Contact-form dialog** — the header Contact button opens a form: Name, Email, Mobile,
  Your Company Name, Select Service Required (the four services), Message, an
  "I'm not a robot" checkbox and a "Send Message" button. It replaces the original
  address / phone / email card inside the compiled `DialogContactPanel`
  (`vendor/_next/static/chunks/00vqtpq6zjam1.js`). The panel body is rebuilt from the
  pristine clone by `tools/patch-dialog.cjs`, which syntax-validates the assembled file
  **before** writing (rollback = copy that chunk back from `../next-app/vendor/...`).
  The form is client-side only: it logs the payload to the console and shows a
  thank-you alert — nothing is sent to a server yet.
- **Service details** — the white service card in the 3D "Services we provide" section has an
  orange **right-arrow button** at its bottom-right; it opens a detail dialog for the active
  service with the same tree/outline content as the old himrobo.com "What We Do" modals
  (Design/Manufacturing Intelligence; Robotics + IoT; manufacturing risk, de-skilling and
  anomaly detection; gesture recognition, visual inspection, AI). The diagrams use the old
  site's CSS **tree connectors** (1px `#ccc` parent-drop → horizontal bus → elbows into each
  child chip), rebuilt as a `.himtree` stylesheet injected at runtime. The dialog fades in
  with a panel pop and fades out on close — pure CSS transitions (`@starting-style` +
  `display`/`overlay` allow-discrete), so `close()` is immediate and no timers are involved.
  Implemented in the scene chunk (`2tvcy0m4g8gry.js`) by `tools/patch-services.cjs`: the arrow
  and an always-mounted native `<dialog>` are added as extra children of the card (absolute /
  `display:none`, gated by a post-hydration flag) so the section is **never re-mounted** — a
  root-type change would kill framer-motion's scroll tracking — and the dialog opens
  imperatively via `showModal()` (closes via ✕, Escape or backdrop click).
- **Smooth scrolling** — Lenis **1.3.27** (`npm install lenis`) smooths wheel scrolling on all
  four pages. The built assets live in `vendor/_next/static/lenis/` — served by the custom
  server's filesystem-based `/_next/static/**` route, so no Next build or server restart is
  involved — plus a trimmed `lenis.css` (no `.lenis-stopped{overflow:clip}`: the dialog locks
  wheel scrolling through `stop()`, so opening it does not shift the layout by a scrollbar
  width) and a small bootstrap (manual rAF loop, `window.__lenis` handle, `anchors: true`,
  reduced-motion respected). `tools/add-lenis.mjs` vendors the files and injects the
  `<link>`/`<script>` tags before `</body>` in `content/*.html` (idempotent). Touch devices
  keep native scrolling. While a service dialog is open the dialog effect calls
  `window.__lenis.stop()` (background locked; `start()` on close) and the scrollable dialog
  body carries `data-lenis-prevent`, so nested dialog scrolling stays native.
- **Model preloading** — the scenes mount lazily, so each section used to start its
  `/models/*.glb` downloads only when scrolled into view (measured: `hand.glb` at ~13s into
  a slow scroll-through). `tools/add-preloads.mjs` injects `<link rel="preload" as="fetch"
  crossorigin="anonymous">` for all 7 GLBs before `</body>` in `content/index.html`
  (idempotent, auto-discovers `public/models/*.glb`). All 7 now download at page load
  (start ≈ 15ms) and the app's own fetches are served from the preloaded memory cache
  (no re-download at scroll time), so sections render as soon as their scene mounts.
- **Self-recovery (GPU + server hiccups)** — `public/him-ctx-recovery.js` (injected into the
  home page by `tools/add-ctx-guard.mjs`) watches the 3D scenes. If a live in-view canvas
  loses its WebGL context (this machine's GPU process can be restarted by fullscreen games,
  and three.js never rebuilds a killed context) it reloads the page once the context has not
  come back, restoring the scroll position. It also recovers from failed `/models/*.glb` loads
  (e.g. the local server was restarting while a page was open — the app otherwise crashes
  blank and caches the failure for the session): once the site answers again (checked with a
  HEAD request first) the page reloads itself, at most 3 tries per incident. All auto-reloads
  are rate-limited to one per 90s, and a healthy session never triggers any of it. Before each
  auto-reload the guard POSTs a small diagnostic report (page state, WebGL probes, model fetch
  statuses) to `/__diag-report`, stored in `_diag-incoming/`. A manual probe of the same state
  is available at `http://localhost:3000/diag.html` (WebGL / canvas / console report, same
  destination).

## Rebrand tooling

```
npm run rebrand:dry     # show what would change
npm run rebrand         # apply tools/rebrand.config.json (idempotent, safe to re-run)
```

Rules live in `tools/rebrand.config.json`. Three things the tooling takes care of:

1. **RSC flight T-rows** — long strings travel as `<id>:T<hex-byte-length>,<text>` rows.
   An edit inside one must re-sync its hex length or hydration breaks with a flight
   parser error. `tools/rebrand.mjs` re-syncs automatically after every run.
2. **Wordmark artwork** — patched once by `tools/patch-wordmark.mjs`; pre-patch
   backups are kept in `tools/_wordmark-backup/`.
3. **CSS utilities** — the captured Tailwind v4 stylesheet is JIT-compiled (only
   originally-used classes exist). The two utilities needed by the giant mark dots
   (`mt-[6.4%]` hero, `mt-[24%]` video) were
   appended, unlayered, at the end of
   `vendor/_next/static/chunks/37fpd4kkizi5r.css` so they win the cascade. The same
   block also carries the logo swap (background-image + hidden paths + cropped aspect
   ratio, with a small-screen width cap).

The `.glb` models are binary and not covered by the config; they are patched
deterministically (and idempotently) by `tools/recolor-glb.mjs`, which rewrites the
JSON chunk in place (BIN chunk stays byte-identical).

## Verify

```
node tools/verify-custom.mjs http://localhost:3300
```

40 checks across home / contact dialog / services detail overlay / privacy / terms / 404:
titles, hero copy, wordmark + monogram + logo structure, favicon, contact-form fields +
service dropdown, service-detail arrow (inside card bottom-right) + animated dialog + tree
diagram connectors, Lenis smooth scrolling active, model GLB preloading, legacy-brand
absence, console + hydration errors. Screenshots land in `tools/verify-shots/`.

Helper tools:

```
node tools/fix-flight-rows.mjs [--apply]   # flight-stream health for all 4 pages; repairs stale T-row lengths
node tools/check-assets.mjs                # every /_next/static ref a page uses resolves (200)
node tools/probe-terms.mjs <url> [...]     # load pages and dump full console / network / exception log
node tools/test-rebrand-glue.mjs           # non-mutating check of the rebrand T-row re-sync hookup
node tools/count-mark.mjs                  # monogram dot-vs-crossbar counts on every page
node tools/probe-marks.mjs <url>           # measure + screenshot both giant white marks (stems + centre dot) across scroll
node tools/probe-pong-bottom.mjs <url>     # video mark in the pinned bottom / Play-invite state (1600px viewport)
node tools/measure-logo.mjs <url> [w] [h]  # header/footer logo slots: rect, computed size, background per viewport
node tools/recolor-glb.mjs [--apply]       # GLB color patch: hero factors + service-scene name hexes (dry-run default)
node tools/inspect-glb.mjs [dir]           # GLB layout/materials/images/teal-info dump
node tools/scan-glb-colors.mjs [dir]       # scan GLB COLOR_0 vertex colors (dominant + suspicious colors)
node tools/patch-dialog.cjs                # rebuild the contact-form dialog inside the chunk (validates before writing)
node tools/patch-services.cjs [--dry]      # rebuild the service-detail overlay (arrow + per-service dialog) in the scene chunk
node tools/check-chunks.cjs                # compile-check every vendor JS file (catches any broken chunk)
node tools/smoke-contact.mjs [url]         # 3D render + dialog open/submit/close smoke test (writes _smoke-*.png)
node tools/smoke-services-detail.mjs [url] # per-service arrow→dialog smoke (all 4 services + ✕/Escape/backdrop close)
node tools/add-lenis.mjs [--dry]           # vendor Lenis 1.3.27 assets + inject the tags into all 4 pages (idempotent)
node tools/add-preloads.mjs [--dry]        # inject model GLB preloads into content/index.html (idempotent, auto-discovers models)
node tools/add-ctx-guard.mjs [--dry]       # inject the WebGL / model-load self-recovery script into the home page (idempotent)
node tools/smoke-lenis.mjs [url]           # smooth-wheel glide + dialog scroll lock smoke (8 checks, short viewport)
node tools/shot.mjs <url> <png> [w] [h] [waitMs] [scrollY]  # one-shot headless screenshot (optional scroll)
node tools/probe-favicon.mjs <file.png>    # decode a PNG to pixel stats (dominant colors + ink bbox)
```

## Known leftovers

- The Terms' governing-law clauses still name Delaware / California; localization to
  India was intentionally not applied (legal wording).
- Analytics / consent scripts (Cookiebot, GTM) stay stubbed via `public/noop.js` — no
  cookie banner is ever rendered.
- `?_rsc=` requests answer 404 **by design**, so the original client router falls back
  to full-page navigation (this is what keeps Privacy / Terms links working); this shows
  up as benign resource 404s in the console.
- The reference site himrobo.com served an expired TLS certificate on capture; its
  assets were fetched with certificate verification disabled.
