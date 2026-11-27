<div align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)"
      srcset="https://raw.githubusercontent.com/x71c9/affresco/HEAD/.github/logo-dark.svg">
    <source media="(prefers-color-scheme: light)"
      srcset="https://raw.githubusercontent.com/x71c9/affresco/HEAD/.github/logo-light.svg">
    <img alt="Affresco logo" width="160"
      src="https://raw.githubusercontent.com/x71c9/affresco/HEAD/.github/logo-light.svg">
  </picture>
</div>

# affresco

Browser extension that captures a full page screenshot, shows it in a preview
tab and copies it to the clipboard or saves it as PNG.

Built for application layouts, where the page does not scroll as a document:
the content lives in an inner scroll container, surrounded by fixed sidebars,
headers and bottom bars (dashboards, admin panels, settings pages). On these
pages, scroll-and-stitch tools repeat the fixed elements over the content or
capture only the visible part. Affresco lays the page out at its full height
first, then captures it in one pass.

Built for Firefox and Chromium-based browsers (Chromium, Chrome, Brave) from a
single code base, with no dependencies at runtime.

https://github.com/user-attachments/assets/a6bb66c9-60e3-44d6-a4eb-1691b3cc5e20

## Install

| Browser | Store |
| ------- | ----- |
| Firefox | addons.mozilla.org (link added after the first review) |
| Chromium, Chrome, Brave | Chrome Web Store (link added after the first review) |

Packages of every version are also attached to the
[GitHub releases](https://github.com/x71c9/affresco/releases).

## Usage

The toolbar button opens a popup with the fixed elements mode and three
actions:

- **Preview**: captures the page and opens a preview tab next to it. The
  preview fits the whole capture in the window or shows it at actual size
  (button or click on the image), and offers Copy (`Ctrl+C`) and Save PNG
  (`Ctrl+S`).
- **Copy** and **Save PNG**: capture and copy or save directly, without
  preview.

| Mode | Fixed sidebars, headers and bars |
| ---- | -------------------------------- |
| Keep | Kept once, in place: headers at the top, sidebars stretched to the end of the page, bottom bars at the end |
| Hide | Left out of the capture |

| Shortcut | Action |
| -------- | ------ |
| `Alt+Shift+S` | Opens the popup |
| `Alt+Shift+P` | Captures with the last used mode and opens the preview |

Shortcuts can be changed in `chrome://extensions/shortcuts` (Chromium) and in
`about:addons` > gear menu > Manage Extension Shortcuts (Firefox).

The preview keeps the last 5 captures in the extension storage, so a preview
tab survives a reload. Captures never leave the browser unless copied or saved.

## How it works

Before the capture, a script injected into the current tab:

1. scrolls the window and every large scroll container to the top;
2. records the position of every `position: fixed` element;
3. expands scroll containers and their ancestors (`overflow: visible`,
   `height: auto`), so the document takes the full content height;
4. turns `position: sticky` elements into static ones, hides tooltips and
   removes the focus from the active element;
5. scrolls through the page so lazy content (IntersectionObserver,
   `loading="lazy"`) is requested, then waits until no network request
   completes for 700 ms (at most 6 s);
6. computes the content height from the lowest element that paints (text,
   media, controls, boxes with background or border), ignoring wrappers as tall
   as the page, and trims the blank area below it;
7. keeps fixed elements as absolutely positioned boxes (keep mode) or hides
   them (hide mode);
8. stretches narrow side columns sized to the viewport to the end of the page.

The page is then captured and every change is reverted, scroll positions
included.

| Browser | Capture method |
| ------- | -------------- |
| Chromium | `Page.captureScreenshot` with `captureBeyondViewport`, through the `debugger` API |
| Firefox | `tabs.captureTab` with a page rectangle, in 4000 px pieces stitched on a canvas |
| Fallback | scrolls the prepared page one viewport at a time and stitches `tabs.captureVisibleTab` shots |

### Permissions

| Permission | Use |
| ---------- | --- |
| `activeTab`, `scripting` | Prepare and capture the current tab, only after a click on the toolbar button or a shortcut |
| `debugger` (Chromium only) | Call the browser screenshot function on the current tab; attached for one capture and detached right after. Chromium shows the "started debugging this browser" bar meanwhile |
| `clipboardWrite` | Copy the capture to the clipboard |
| `downloads` | Save the capture as PNG |
| `storage` | Remember the fixed elements mode |

See [PRIVACY.md](PRIVACY.md): no data is collected.

## Limits

- Captures are downscaled to stay below 16384 px (Chromium) or 32000 px
  (Firefox) on the longest side.
- Content still loading after the 6 s wait is captured in its loading state.
- Virtualized lists (rows rendered only while visible) show only the rendered
  rows.
- On Chromium the viewport grows to the page size during the capture: elements
  sized in `vh` units may come out taller.
- Pages where browsers block extensions (`chrome://`, `about:`, the extension
  stores) cannot be captured.

## Development

```bash
npm ci
npm run build            # dist/chromium, dist/firefox
npm test                 # build, page script test, end-to-end preview test
npm run lint             # web-ext lint of the Firefox build
npm run start:firefox    # or start:chromium
```

The tests run headless Chromium over the DevTools protocol; `CHROMIUM` selects
the binary (default `chromium`). Branded Google Chrome ignores
`--load-extension`, so the end-to-end test needs Chromium or Chrome for
Testing.

| Command | Output |
| ------- | ------ |
| `npm run icons` | Logo (`.github/logo-*.svg`) and icons (`icons/`), from `scripts/geometry.mjs`; the 16 px icon is drawn on the pixel grid |
| `scripts/store-images` | Store screenshots and promo tile (`store/screenshots/`) |
| `scripts/package` | Release packages (`artifacts/`) |

See [CONTRIBUTING.md](CONTRIBUTING.md) for pull requests and releases.

## License

[MIT](LICENSE)
