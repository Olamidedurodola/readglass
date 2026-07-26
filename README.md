# ReadGlass

Personal PWA that turns screen captures and photos into readable text pages. Everything stays on your device.

## Features

- Capture from **screen share** (desktop), **camera**, or **screenshot upload**
- On-device OCR with [Tesseract.js](https://tesseract.projectnaptha.com/)
- Library of books/pages stored in IndexedDB
- Clean reader with font size + night / paper / sepia themes
- **Listen** mode (browser text-to-speech) with speed control and auto-advance
- Installable as a Progressive Web App

## Use it with long books (no screenshots)

1. Open ReadGlass → **Just listen**
2. Install the **Listen page** bookmark
3. Open Stelar in the browser, open a chapter, tap the bookmark → **Listen**
4. Keep **Auto next** on to continue through chapters

Or paste chapter text into ReadGlass and tap **Listen now**.

## Local preview

Serve the folder over HTTPS or localhost (required for camera / screen capture):

```bash
npx --yes serve .
```

Then open the printed URL.

## Deploy

This repo is set up for **GitHub Pages** from the `main` branch root.
