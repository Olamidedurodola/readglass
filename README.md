# ReadGlass

Personal reader for Selar books you already own.

## Desktop (Chrome) — unchanged

1. Open your book on selar.com
2. Open https://olamidedurodola.github.io/readglass/ → **Auto Listen** → **Copy helper line**
3. Selar tab: **F12 → Console** → paste → Enter → **Start**

## Android floating bubble (like Tracker Voice)

A website **cannot** float over Chrome. Use the Android app:

```bash
cd mobile
flutter pub get
flutter build apk --release
```

Install `mobile/build/app/outputs/flutter-apk/app-release.apk` on your phone.

1. Open **ReadGlass** → turn on **Floating bubble** → allow overlay permission
2. Open Selar in Chrome
3. Tap **Listen** on the green bubble
4. Allow screen capture (first time)
5. Flip page → tap Listen again

## Local web preview

```bash
npx --yes serve .
```
