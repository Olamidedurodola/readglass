# ReadGlass

Personal PWA that turns screen captures and photos into readable text pages. Everything stays on your device.

## Features

- Capture from **screen share** (desktop), **camera**, or **screenshot upload**
- On-device OCR with [Tesseract.js](https://tesseract.projectnaptha.com/)
- Library of books/pages stored in IndexedDB
- Clean reader with font size + night / paper / sepia themes
- **Listen** mode (browser text-to-speech) with speed control and auto-advance
- Installable as a Progressive Web App

## Use it with Stelar

1. Open Stelar in **Chrome (website)** — the Stelar app blocks screenshots.
2. **Computer:** Read screen → **Live screen** → share the Stelar tab → **Snap page** for each page → **Save & next**.
3. **Phone:** In Chrome, take a screenshot → **Chrome screenshot** (or Paste) in ReadGlass.
4. Read or **Listen** from your library.

## Local preview

Serve the folder over HTTPS or localhost (required for camera / screen capture):

```bash
npx --yes serve .
```

Then open the printed URL.

## Deploy

This repo is set up for **GitHub Pages** from the `main` branch root.
