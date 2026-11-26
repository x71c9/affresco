# Chrome Web Store listing

Values entered by hand in the Chrome Web Store Developer Dashboard.

## Store listing

- Category: Productivity / Tools
- Language: English
- Store icon: `icons/icon-128.png`
- Screenshots (1280x800): `store/screenshots/1-capture.png`,
  `store/screenshots/2-preview.png`, `store/screenshots/3-compare.png`
- Small promo tile (440x280): `store/screenshots/promo-tile-440x280.png`
- Screenshots and promo tile are rendered from `store/screenshots/src` by
  `scripts/store-images`
- Homepage URL: https://github.com/x71c9/affresco
- Support URL: https://github.com/x71c9/affresco/issues

### Description

Same text as `description` in `store/amo-metadata.json`:

```
Full page screenshots of web applications, with sidebars, headers and bottom bars kept once and in their place.

Dashboards, admin panels and settings pages rarely scroll as a document: the content scrolls inside the app, surrounded by fixed bars. Scroll-and-stitch tools repeat those bars over the content in every piece, or capture only what is on screen. Affresco lays the page out at its full height first, then captures it in one pass:

- inner scroll areas are expanded to their full content
- fixed sidebars stretch to the end of the page, headers stay at the top, bottom bars move to the end
- lazy content (charts, panels, images loaded on scroll) is loaded before the capture
- the blank space after the content is trimmed
- the page is restored exactly as it was, scroll position included

After the capture, a preview tab shows the whole page in one view; Copy puts the image in the clipboard, Save PNG downloads it. Copy and Save PNG also work directly from the toolbar popup, without preview. Fixed bars can also be left out of the capture (Hide mode).

Shortcuts: Alt+Shift+S opens the popup, Alt+Shift+P captures and opens the preview. Both can be changed in the browser settings.

The capture never leaves the browser unless copied or saved. No data is collected, nothing is sent anywhere.

Source code: https://github.com/x71c9/affresco
```

## Privacy practices

### Single purpose

```
Takes a full page screenshot of the current tab, shows it in a preview and copies it to the clipboard or saves it as PNG.
```

### Permission justifications

- activeTab:
  `Captures the current tab, only after a click on the toolbar button or a keyboard shortcut of the extension.`
- scripting:
  `Runs the layout script in the current tab after that user action: it expands the inner scroll areas and pins the fixed bars so the whole page fits in one capture, then restores the page.`
- debugger:
  `Calls the browser's own screenshot function (Page.captureScreenshot with captureBeyondViewport) on the current tab, the only extension API that captures a page beyond the visible area in one pass. It is attached after the user action, used for that single command and detached right after; no other debugging command is sent and no page content is read through it.`
- clipboardWrite:
  `Copies the captured image to the clipboard when the user clicks Copy.`
- downloads:
  `Saves the captured image as a PNG file when the user clicks Save PNG.`
- storage:
  `Remembers the fixed elements mode (keep or hide) chosen in the popup, so the keyboard shortcut uses it too.`

### Remote code

No, the extension does not use remote code.

### Data usage

No data collected: leave every category unchecked and certify the three
statements (no sale of data, no use unrelated to the single purpose, no
creditworthiness use).

Privacy policy URL:
https://github.com/x71c9/affresco/blob/master/PRIVACY.md
