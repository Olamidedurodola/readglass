# ReadGlass

Personal PWA that turns screen captures and photos into readable text pages. Everything stays on your device.

## Features

- Capture from **screen share** (desktop), **camera**, or **screenshot upload**
- On-device OCR with [Tesseract.js](https://tesseract.projectnaptha.com/)
- Library of books/pages stored in IndexedDB
- Clean reader with font size + night / paper / sepia themes
- **Listen** mode (browser text-to-speech) with speed control and auto-advance
- Installable as a Progressive Web App

## Use it

1. Open the app on your phone or desktop
2. Create a book (or use Quick capture)
3. Capture the page you’re reading
4. Fix any OCR mistakes, then save
5. Read offline from your library

On iPhone: Safari → Share → **Add to Home Screen**.

## Local preview

Serve the folder over HTTPS or localhost (required for camera / screen capture):

```bash
npx --yes serve .
```

Then open the printed URL.

## Deploy

This repo is set up for **GitHub Pages** from the `main` branch root.
