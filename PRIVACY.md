# Privacy policy

Affresco collects no data.

- The page is read and captured only when the toolbar button, the popup or a
  keyboard shortcut is used, and only in the current tab.
- Captures stay on the local machine: the preview keeps the last 5 in the
  browser storage of the extension (IndexedDB), and a capture leaves it only
  when it is copied to the clipboard or saved as a file.
- The only setting stored is the fixed elements mode (keep or hide).
- Nothing is sent to the author or to any third party.
- No analytics, tracking, advertising or remote code.

On Chromium, the capture uses the `debugger` permission to call the browser's
own screenshot function (`Page.captureScreenshot`) on the current tab. It is
attached for the duration of one capture and detached right after; no other
debugging command is used.
