# Plant a seed (Chrome extension)

Save whatever page you're on to the garden. Click the dandelion in Chrome's toolbar (or press
**Option+Shift+G**). The title and link are filled in, and any text you highlighted on the page
becomes a quote in the note. Pick the dandelion and branch, the stage and type, and press **Plant it!**

The entry is saved straight to GitHub, the same way the CMS saves. Netlify rebuilds, and it
blooms in the garden about a minute later.

## Install (once)

1. In Chrome, go to `chrome://extensions`.
2. Turn on **Developer mode** (top right).
3. Click **Load unpacked** and choose this `chrome-extension` folder.
4. Click the puzzle-piece icon in the toolbar and pin **Plant a seed**.
5. The settings page explains how to make a GitHub key: a fine-grained token limited to the
   `digital-garden` repo with **Contents: Read and write** only. Paste it in and press **Save & test**.

The key is stored only in this browser profile on this computer. If it expires, make a new one
and paste it into settings (right-click the toolbar icon → Options).

## Good to know

- **Screenshot**: tick "Add a screenshot" to save what's visible on the page as a photo on the
  entry. The live site serves it resized.
- **Remembers your last dandelion**, so planting a run of related links is quick.
- **New dandelions or branches** you just planted show up in the pickers once the site has rebuilt.
- **Pages Chrome protects** (chrome:// pages, the Web Store) can be saved, but the highlighted
  text can't be read on them.
- **Editing the extension**: after changing files here, press the reload ↻ on its card in
  `chrome://extensions`.
- **Preview without installing**: open `popup.html` through the local preview server and it runs
  in preview mode with a fake page. Nothing is saved.
