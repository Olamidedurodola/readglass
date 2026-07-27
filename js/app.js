import {
  addPage,
  createBook,
  deleteBook,
  deletePage,
  listBooks,
  listPages,
  renameBook,
  updatePage,
} from "./db.js";
import { ScreenSession, recognizeImage, supportsScreenCapture } from "./ocr.js";
import { createNarrator } from "./speech.js";
import { speakUntilDone } from "./speak.js";
import { isAndroid, isMobile } from "./platform.js";

const THEMES = ["night", "paper", "sepia"];
const FONT_MIN = 1;
const FONT_MAX = 1.7;
const FONT_STEP = 0.1;

const state = {
  view: "library",
  books: [],
  currentBookId: null,
  pages: [],
  readerIndex: 0,
  captureBookId: null,
  pendingImageUrl: null,
  deferredInstall: null,
  fontSize: Number(localStorage.getItem("rg-font") || 1.2),
  theme: localStorage.getItem("rg-theme") || "night",
  autoListen: false,
  autoSession: false,
  autoWaiting: false,
  autoAbort: null,
  autoContinue: null,
  autoResnap: null,
  autoPageCount: 0,
};

const screenSession = new ScreenSession();
screenSession.onEnded = () => {
  hideLiveSession();
  configureCaptureOptions();
};

const els = {
  backBtn: document.getElementById("backBtn"),
  brandMark: document.getElementById("brandMark"),
  themeBtn: document.getElementById("themeBtn"),
  installBtn: document.getElementById("installBtn"),
  libraryView: document.getElementById("libraryView"),
  listenSetupView: document.getElementById("listenSetupView"),
  captureView: document.getElementById("captureView"),
  bookView: document.getElementById("bookView"),
  readerView: document.getElementById("readerView"),
  newBookBtn: document.getElementById("newBookBtn"),
  justListenBtn: document.getElementById("justListenBtn"),
  quickCaptureBtn: document.getElementById("quickCaptureBtn"),
  bookGrid: document.getElementById("bookGrid"),
  libraryEmpty: document.getElementById("libraryEmpty"),
  bookCount: document.getElementById("bookCount"),
  autoListenStatus: document.getElementById("autoListenStatus"),
  autoListenVideo: document.getElementById("autoListenVideo"),
  autoListenPreview: document.getElementById("autoListenPreview"),
  autoSavePages: document.getElementById("autoSavePages"),
  startAutoListenBtn: document.getElementById("startAutoListenBtn"),
  autoResnapBtn: document.getElementById("autoResnapBtn"),
  autoNextPageBtn: document.getElementById("autoNextPageBtn"),
  stopAutoListenBtn: document.getElementById("stopAutoListenBtn"),
  copySelarHelperBtn: document.getElementById("copySelarHelperBtn"),
  selarHelperCopyStatus: document.getElementById("selarHelperCopyStatus"),
  androidSetupCard: document.getElementById("androidSetupCard"),
  desktopSetupCard: document.getElementById("desktopSetupCard"),
  iosNoteCard: document.getElementById("iosNoteCard"),
  copyAndroidBookmarkBtn: document.getElementById("copyAndroidBookmarkBtn"),
  previewAndroidPaneBtn: document.getElementById("previewAndroidPaneBtn"),
  androidBookmarkStatus: document.getElementById("androidBookmarkStatus"),
  autoListenPanel: document.getElementById("autoListenPanel"),
  captureTitle: document.getElementById("captureTitle"),
  captureHint: document.getElementById("captureHint"),
  captureTargets: document.getElementById("captureTargets"),
  screenCaptureBtn: document.getElementById("screenCaptureBtn"),
  pasteCaptureBtn: document.getElementById("pasteCaptureBtn"),
  cameraInput: document.getElementById("cameraInput"),
  fileInput: document.getElementById("fileInput"),
  liveSession: document.getElementById("liveSession"),
  liveVideo: document.getElementById("liveVideo"),
  liveStatus: document.getElementById("liveStatus"),
  snapLiveBtn: document.getElementById("snapLiveBtn"),
  stopLiveBtn: document.getElementById("stopLiveBtn"),
  previewWrap: document.getElementById("previewWrap"),
  previewImage: document.getElementById("previewImage"),
  ocrProgress: document.getElementById("ocrProgress"),
  ocrBar: document.getElementById("ocrBar"),
  ocrStatus: document.getElementById("ocrStatus"),
  textEditor: document.getElementById("textEditor"),
  ocrText: document.getElementById("ocrText"),
  recaptureBtn: document.getElementById("recaptureBtn"),
  savePageBtn: document.getElementById("savePageBtn"),
  saveNextBtn: document.getElementById("saveNextBtn"),
  bookTitleInput: document.getElementById("bookTitleInput"),
  pageCountLabel: document.getElementById("pageCountLabel"),
  pageList: document.getElementById("pageList"),
  exportBtn: document.getElementById("exportBtn"),
  addPageBtn: document.getElementById("addPageBtn"),
  readBookBtn: document.getElementById("readBookBtn"),
  readerProgress: document.getElementById("readerProgress"),
  readerText: document.getElementById("readerText"),
  prevPageBtn: document.getElementById("prevPageBtn"),
  nextPageBtn: document.getElementById("nextPageBtn"),
  fontDownBtn: document.getElementById("fontDownBtn"),
  fontUpBtn: document.getElementById("fontUpBtn"),
  listenBtn: document.getElementById("listenBtn"),
  speechStopBtn: document.getElementById("speechStopBtn"),
  speechSlowerBtn: document.getElementById("speechSlowerBtn"),
  speechFasterBtn: document.getElementById("speechFasterBtn"),
  newBookModal: document.getElementById("newBookModal"),
  newBookForm: document.getElementById("newBookForm"),
  newBookTitle: document.getElementById("newBookTitle"),
};

const narrator = createNarrator({
  onEnd: () => {
    if (!state.autoListen) return;
    if (state.readerIndex >= state.pages.length - 1) {
      state.autoListen = false;
      updateListenUi();
      return;
    }
    state.readerIndex += 1;
    renderReader({ keepListening: true });
    try {
      narrator.speak(state.pages[state.readerIndex]?.text || "");
    } catch {
      state.autoListen = false;
      updateListenUi();
    }
  },
  onStateChange: updateListenUi,
});

function updateListenUi(status = {}) {
  const supported = status.supported ?? narrator.isSupported();
  const playing = status.playing ?? narrator.isPlaying();
  const paused = status.paused ?? narrator.isPaused();
  const rate = status.rate ?? narrator.getRate();

  if (!supported) {
    els.listenBtn.disabled = true;
    els.listenBtn.textContent = "No TTS";
    els.speechStopBtn.hidden = true;
    els.speechSlowerBtn.disabled = true;
    els.speechFasterBtn.disabled = true;
    return;
  }

  els.speechSlowerBtn.disabled = false;
  els.speechFasterBtn.disabled = false;
  els.speechStopBtn.hidden = !(playing || paused);
  els.speechSlowerBtn.title = `Slower (${rate.toFixed(1)}x)`;
  els.speechFasterBtn.title = `Faster (${rate.toFixed(1)}x)`;

  if (paused) els.listenBtn.textContent = "Resume";
  else if (playing) els.listenBtn.textContent = "Pause";
  else els.listenBtn.textContent = "Listen";
}

function stopListening() {
  state.autoListen = false;
  narrator.stop();
}

function startListening() {
  try {
    state.autoListen = true;
    narrator.speak(state.pages[state.readerIndex]?.text || "");
  } catch (error) {
    state.autoListen = false;
    updateListenUi();
    alert(error.message || "Could not start narration.");
  }
}

function applyTheme() {
  if (state.theme === "night") document.documentElement.removeAttribute("data-theme");
  else document.documentElement.setAttribute("data-theme", state.theme);
  localStorage.setItem("rg-theme", state.theme);
}

function applyFont() {
  document.documentElement.style.setProperty("--reader-size", `${state.fontSize}rem`);
  localStorage.setItem("rg-font", String(state.fontSize));
}

function showView(view) {
  if (view !== "reader") stopListening();
  if (view !== "capture") stopLiveSession();
  if (view !== "listenSetup") stopAutoListenSession();
  state.view = view;
  els.libraryView.hidden = view !== "library";
  els.listenSetupView.hidden = view !== "listenSetup";
  els.captureView.hidden = view !== "capture";
  els.bookView.hidden = view !== "book";
  els.readerView.hidden = view !== "reader";
  els.backBtn.hidden = view === "library";
  els.brandMark.hidden = view !== "library";
}

function openListenSetup() {
  configureListenSetupForPlatform();
  if (!supportsScreenCapture() || isMobile()) {
    if (els.startAutoListenBtn) els.startAutoListenBtn.disabled = true;
  } else {
    els.startAutoListenBtn.disabled = false;
    if (els.autoListenStatus) els.autoListenStatus.textContent = "Ready when you are.";
  }
  showView("listenSetup");
}

function setAutoStatus(msg) {
  if (els.autoListenStatus) els.autoListenStatus.textContent = msg;
}

function stopAutoListenSession() {
  state.autoSession = false;
  state.autoWaiting = false;
  if (state.autoAbort) {
    state.autoAbort.abort();
    state.autoAbort = null;
  }
  if (state.autoContinue) {
    state.autoContinue();
    state.autoContinue = null;
  }
  state.autoResnap = null;
  speechSynthesis?.cancel?.();
  screenSession.stop();
  if (els.autoListenVideo) {
    els.autoListenVideo.srcObject = null;
    els.autoListenVideo.hidden = true;
  }
  if (els.autoListenPreview) {
    els.autoListenPreview.removeAttribute("src");
    els.autoListenPreview.hidden = true;
  }
  if (els.startAutoListenBtn) els.startAutoListenBtn.hidden = false;
  if (els.autoNextPageBtn) els.autoNextPageBtn.hidden = true;
  if (els.autoResnapBtn) els.autoResnapBtn.hidden = true;
  if (els.stopAutoListenBtn) els.stopAutoListenBtn.hidden = true;
}

function getSelarHelperLauncher() {
  const url = new URL("./js/selar-helper.js", window.location.href).href;
  return `(()=>{const s=document.createElement('script');s.src='${url}?t='+Date.now();document.documentElement.appendChild(s);})();`;
}

/** Android bookmark: show floating panel immediately, then load helper. Desktop console stays on getSelarHelperLauncher(). */
function getSelarAndroidBookmark() {
  const url = new URL("./js/selar-helper.js", window.location.href).href;
  const code = `(()=>{try{var old=document.getElementById('rg-selar-helper');if(old)old.remove();var box=document.createElement('div');box.id='rg-selar-helper';box.innerHTML='<div style="font-weight:700;margin-bottom:8px;color:#5ec4b2">ReadGlass · Selar</div><p style="margin:0;color:#9aa7b5;font-size:13px;line-height:1.4">Loading floating reader pane…</p>';box.style.cssText='position:fixed!important;z-index:2147483647!important;left:12px!important;top:max(12px,env(safe-area-inset-top))!important;width:min(320px,calc(100vw - 24px))!important;background:#121820!important;color:#e7ecf2!important;border:1px solid rgba(94,196,178,.5)!important;border-radius:16px!important;padding:14px!important;font:14px system-ui,sans-serif!important;box-shadow:0 18px 50px rgba(0,0,0,.55)!important;pointer-events:auto!important';(document.body||document.documentElement).appendChild(box);var s=document.createElement('script');s.src='${url}?t='+Date.now();s.onload=function(){};s.onerror=function(){box.innerHTML='<strong style="color:#5ec4b2">ReadGlass</strong><p style="color:#9aa7b5;font-size:13px;line-height:1.4;margin:8px 0 0">Could not load. Stay on selar.com, check internet, tap the bookmark again.</p>';alert('ReadGlass could not load the reader pane on this page.');};document.documentElement.appendChild(s);}catch(e){alert('ReadGlass error: '+(e&&e.message?e.message:e));}})();`;
  return `javascript:${encodeURIComponent(code)}`;
}

function configureListenSetupForPlatform() {
  const android = isAndroid();
  const ios = /iPhone|iPad|iPod/i.test(navigator.userAgent);

  if (els.androidSetupCard) els.androidSetupCard.hidden = !android;
  if (els.desktopSetupCard) els.desktopSetupCard.hidden = android;
  if (els.iosNoteCard) els.iosNoteCard.hidden = !ios || android;
  if (els.autoListenPanel) els.autoListenPanel.hidden = isMobile();

  if (android && els.autoListenStatus) {
    els.autoListenStatus.textContent = "Use the Android bookmark on your Selar book page.";
  }
}

function previewMobileReaderPane() {
  const existing = document.getElementById("rg-selar-helper");
  if (existing) existing.remove();
  const s = document.createElement("script");
  s.src = new URL("./js/selar-helper.js", window.location.href).href + `?t=${Date.now()}`;
  s.onerror = () => alert("Could not load the reader pane preview.");
  document.documentElement.appendChild(s);
  if (els.androidBookmarkStatus) {
    els.androidBookmarkStatus.hidden = false;
    els.androidBookmarkStatus.textContent =
      "Green panel should appear on this screen. On Selar, use your bookmark to open the same panel over the book.";
  }
}

function waitForNextPageAction() {
  return new Promise((resolve) => {
    state.autoWaiting = true;
    state.autoContinue = () => {
      state.autoWaiting = false;
      state.autoContinue = null;
      resolve("next");
    };
    state.autoResnap = () => {
      state.autoWaiting = false;
      state.autoContinue = null;
      state.autoResnap = null;
      resolve("resnap");
    };
    els.autoNextPageBtn.hidden = false;
    els.autoResnapBtn.hidden = false;
    els.autoNextPageBtn.focus();
  });
}

async function captureAndRecognize(n) {
  setAutoStatus(`Page ${n}: capturing what’s on Selar…`);
  const blob = await screenSession.snap({ settleMs: 700, crop: true });
  if (els.autoListenPreview) {
    if (state.pendingImageUrl) URL.revokeObjectURL(state.pendingImageUrl);
    state.pendingImageUrl = URL.createObjectURL(blob);
    els.autoListenPreview.src = state.pendingImageUrl;
    els.autoListenPreview.hidden = false;
  }
  setAutoStatus(`Page ${n}: reading text from that preview…`);
  const text = await recognizeImage(blob, (progress) => {
    setAutoStatus(`Page ${n}: reading text… ${Math.round(progress * 100)}%`);
  });
  return text;
}

async function runAutoListenSession() {
  if (!supportsScreenCapture()) {
    alert("Screen-share Auto Listen only works on a computer with Chrome.");
    return;
  }

  stopAutoListenSession();
  state.autoSession = true;
  state.autoPageCount = 0;
  state.autoAbort = new AbortController();

  els.startAutoListenBtn.hidden = true;
  els.stopAutoListenBtn.hidden = false;
  els.autoNextPageBtn.hidden = true;
  els.autoResnapBtn.hidden = true;
  setAutoStatus("Choose the Selar Chrome TAB (not whole screen, not ReadGlass)…");

  try {
    const video = await screenSession.start();
    els.autoListenVideo.hidden = false;
    els.autoListenVideo.srcObject = video.srcObject;
    await new Promise((r) => setTimeout(r, 800));
  } catch (error) {
    stopAutoListenSession();
    if (error?.name === "NotAllowedError") {
      setAutoStatus("Sharing cancelled. Tap Start Auto Listen to try again.");
      return;
    }
    setAutoStatus(error.message || "Could not share screen.");
    alert(error.message || "Could not share screen.");
    return;
  }

  let bookId = null;
  if (els.autoSavePages?.checked) {
    bookId = (await createBook(`Selar ${formatDate(Date.now())}`)).id;
    state.captureBookId = bookId;
    state.currentBookId = bookId;
  }

  while (state.autoSession && screenSession.active) {
    state.autoPageCount += 1;
    const n = state.autoPageCount;
    els.autoNextPageBtn.hidden = true;
    els.autoResnapBtn.hidden = true;

    let text = "";
    try {
      text = await captureAndRecognize(n);
    } catch (error) {
      if (!state.autoSession) break;
      setAutoStatus(error.message || "Could not read this page.");
      const action = await waitForNextPageAction();
      if (action === "resnap") {
        state.autoPageCount -= 1;
      }
      continue;
    }

    if (!state.autoSession) break;

    if (!text) {
      setAutoStatus(`Page ${n}: no text in preview. Resnap or flip to a text page.`);
      const action = await waitForNextPageAction();
      if (action === "resnap") state.autoPageCount -= 1;
      continue;
    }

    // Show a short excerpt so user can verify it's the right page.
    const excerpt = text.slice(0, 90).replace(/\s+/g, " ");
    setAutoStatus(`Page ${n} looks like: “${excerpt}…” — listening now`);

    if (bookId) {
      try {
        await addPage(bookId, text);
      } catch {
        /* keep listening */
      }
    }

    const result = await speakUntilDone(text, {
      rate: narrator.getRate(),
      signal: state.autoAbort.signal,
    });
    if (!state.autoSession || result?.aborted) break;

    setAutoStatus(
      `Page ${n} done. Click > on Selar, then Next page (or Space). Wrong page? Resnap.`
    );
    const action = await waitForNextPageAction();
    if (action === "resnap") {
      state.autoPageCount -= 1;
    }
  }

  const finishedPages = state.autoPageCount;
  stopAutoListenSession();
  setAutoStatus(
    finishedPages
      ? `Stopped after ${finishedPages} page${finishedPages === 1 ? "" : "s"}.`
      : "Ready when you are."
  );
  if (bookId) await refreshLibrary();
}

function formatDate(ts) {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(ts);
}

async function refreshLibrary() {
  state.books = await listBooks();
  const count = state.books.length;
  els.bookCount.textContent = count ? `${count} book${count === 1 ? "" : "s"}` : "";
  els.libraryEmpty.hidden = count > 0;
  els.bookGrid.innerHTML = "";

  for (const book of state.books) {
    const pages = await listPages(book.id);
    const card = document.createElement("article");
    card.className = "book-card";
    card.innerHTML = `
      <strong></strong>
      <span></span>
      <div class="book-card-actions">
        <button class="btn btn-primary" data-open type="button">Open</button>
        <button class="btn btn-ghost" data-read type="button">Read</button>
        <button class="btn btn-ghost" data-delete type="button">Delete</button>
      </div>
    `;
    card.querySelector("strong").textContent = book.title;
    card.querySelector("span").textContent = `${pages.length} page${pages.length === 1 ? "" : "s"} · ${formatDate(book.updatedAt)}`;
    card.querySelector("[data-open]").addEventListener("click", () => openBook(book.id));
    card.querySelector("[data-read]").addEventListener("click", () => openReader(book.id, 0));
    card.querySelector("[data-delete]").addEventListener("click", async () => {
      if (!confirm(`Delete “${book.title}”?`)) return;
      await deleteBook(book.id);
      await refreshLibrary();
    });
    els.bookGrid.appendChild(card);
  }
}

async function openBook(bookId) {
  state.currentBookId = bookId;
  const book = state.books.find((b) => b.id === bookId) || (await listBooks()).find((b) => b.id === bookId);
  state.pages = await listPages(bookId);
  els.bookTitleInput.value = book?.title || "Untitled";
  els.pageCountLabel.textContent = `${state.pages.length} page${state.pages.length === 1 ? "" : "s"}`;
  els.pageList.innerHTML = "";

  state.pages.forEach((page, index) => {
    const item = document.createElement("article");
    item.className = "page-item";
    item.innerHTML = `
      <header>
        <span>Page ${index + 1}</span>
        <span>${formatDate(page.createdAt)}</span>
      </header>
      <p></p>
      <div class="page-actions">
        <button class="btn btn-ghost" data-edit type="button">Edit</button>
        <button class="btn btn-ghost" data-read type="button">Read</button>
        <button class="btn btn-ghost" data-delete type="button">Delete</button>
      </div>
    `;
    item.querySelector("p").textContent = page.text || "(empty page)";
    item.querySelector("[data-read]").addEventListener("click", () => openReader(bookId, index));
    item.querySelector("[data-edit]").addEventListener("click", async () => {
      const next = prompt("Edit page text", page.text);
      if (next == null) return;
      await updatePage(page.id, next);
      await openBook(bookId);
    });
    item.querySelector("[data-delete]").addEventListener("click", async () => {
      if (!confirm(`Delete page ${index + 1}?`)) return;
      await deletePage(page.id);
      await openBook(bookId);
    });
    els.pageList.appendChild(item);
  });

  showView("book");
}

async function openReader(bookId, index = 0) {
  state.currentBookId = bookId;
  state.pages = await listPages(bookId);
  if (!state.pages.length) {
    alert("Add at least one page before reading.");
    await openBook(bookId);
    return;
  }
  state.readerIndex = Math.min(Math.max(index, 0), state.pages.length - 1);
  renderReader();
  showView("reader");
}

function renderReader({ keepListening = false } = {}) {
  if (!keepListening) stopListening();
  const page = state.pages[state.readerIndex];
  els.readerProgress.textContent = `Page ${state.readerIndex + 1} of ${state.pages.length}`;
  els.readerText.textContent = page?.text || "";
  els.prevPageBtn.disabled = state.readerIndex <= 0;
  els.nextPageBtn.disabled = state.readerIndex >= state.pages.length - 1;
  updateListenUi();
}

function resetCaptureUi({ keepLive = false } = {}) {
  if (state.pendingImageUrl) URL.revokeObjectURL(state.pendingImageUrl);
  state.pendingImageUrl = null;
  els.previewWrap.hidden = true;
  els.ocrProgress.hidden = true;
  els.textEditor.hidden = true;
  els.saveNextBtn.hidden = true;
  els.ocrText.value = "";
  els.ocrBar.style.width = "0%";
  els.previewImage.removeAttribute("src");
  if (!keepLive) {
    stopLiveSession();
    if (els.captureTargets) els.captureTargets.hidden = false;
  }
}

function hideLiveSession() {
  if (els.liveSession) els.liveSession.hidden = true;
  if (els.liveVideo) els.liveVideo.srcObject = null;
  if (els.captureTargets) els.captureTargets.hidden = false;
}

function stopLiveSession() {
  screenSession.stop();
  hideLiveSession();
}

function showLiveSession(videoEl) {
  els.captureTargets.hidden = true;
  els.liveSession.hidden = false;
  els.liveVideo.srcObject = videoEl.srcObject;
  els.liveStatus.textContent = "Connected — open Selar, then Snap page";
  els.previewWrap.hidden = true;
  els.textEditor.hidden = true;
}

function configureCaptureOptions() {
  const canScreen = supportsScreenCapture();
  els.screenCaptureBtn.hidden = !canScreen;
  const desktopNote = document.getElementById("desktopGuideNote");
  if (desktopNote) desktopNote.hidden = !canScreen;
  if (els.captureHint) {
    els.captureHint.textContent = canScreen
      ? "Phone: add screenshots from your browser. Computer: Live screen also works."
      : "Screenshot Selar in your browser, then tap Add screenshot.";
  }
}

async function pasteImageFromClipboard() {
  if (!navigator.clipboard?.read) {
    throw new Error("Clipboard paste isn’t available here. Use Chrome screenshot instead.");
  }
  const items = await navigator.clipboard.read();
  for (const item of items) {
    const type = item.types.find((t) => t.startsWith("image/"));
    if (!type) continue;
    const blob = await item.getType(type);
    return blob;
  }
  throw new Error("No image on the clipboard. Screenshot Selar in Chrome, copy it, then Paste.");
}

function openCapture(bookId, title) {
  state.captureBookId = bookId;
  els.captureTitle.textContent = title ? `Capture · ${title}` : "Read screen";
  configureCaptureOptions();
  resetCaptureUi();
  showView("capture");
}

async function startLiveScreen() {
  try {
    els.liveStatus.textContent = "Choose the Selar Chrome tab…";
    const video = await screenSession.start();
    showLiveSession(video);
  } catch (error) {
    stopLiveSession();
    if (error?.name === "NotAllowedError") return;
    alert(error.message || "Could not start live screen.");
  }
}

async function snapLiveScreen() {
  try {
    els.snapLiveBtn.disabled = true;
    els.liveStatus.textContent = "Snapping…";
    const blob = await screenSession.snap();
    await runOcr(blob, { fromLive: true });
    els.liveStatus.textContent = "Snapped — edit text, then Save & next";
  } catch (error) {
    els.liveStatus.textContent = "Snap failed";
    alert(error.message || "Snap failed.");
  } finally {
    els.snapLiveBtn.disabled = false;
  }
}

async function runOcr(blobOrFile, { fromLive = false } = {}) {
  if (state.pendingImageUrl) URL.revokeObjectURL(state.pendingImageUrl);
  state.pendingImageUrl = null;
  els.ocrText.value = "";
  els.textEditor.hidden = true;
  els.saveNextBtn.hidden = !fromLive;

  const url = URL.createObjectURL(blobOrFile);
  state.pendingImageUrl = url;
  els.previewImage.src = url;
  els.previewWrap.hidden = false;
  els.ocrProgress.hidden = false;
  els.ocrStatus.textContent = "Reading text…";
  els.ocrBar.style.width = "4%";

  if (fromLive) {
    els.liveSession.hidden = false;
  } else {
    stopLiveSession();
  }

  try {
    const text = await recognizeImage(blobOrFile, (progress) => {
      const pct = Math.max(4, Math.round(progress * 100));
      els.ocrBar.style.width = `${pct}%`;
      els.ocrStatus.textContent = `Reading text… ${pct}%`;
    });
    els.ocrBar.style.width = "100%";
    els.ocrStatus.textContent = text
      ? "Done. Fix any OCR mistakes below."
      : "No text found. Try a clearer Chrome screenshot.";
    els.ocrText.value = text;
    els.textEditor.hidden = false;
    els.saveNextBtn.hidden = !screenSession.active;
  } catch (error) {
    els.ocrStatus.textContent = error.message || "OCR failed.";
    alert(error.message || "OCR failed.");
  }
}

async function ensureCaptureBook() {
  if (state.captureBookId) return state.captureBookId;
  const book = await createBook(`Selar ${formatDate(Date.now())}`);
  state.captureBookId = book.id;
  state.currentBookId = book.id;
  return book.id;
}

async function saveCapturedPage({ continueLive = false } = {}) {
  const text = els.ocrText.value.trim();
  if (!text) {
    alert("Add some text before saving.");
    return;
  }
  const bookId = await ensureCaptureBook();
  await addPage(bookId, text);
  await refreshLibrary();

  if (continueLive && screenSession.active) {
    if (state.pendingImageUrl) URL.revokeObjectURL(state.pendingImageUrl);
    state.pendingImageUrl = null;
    els.previewWrap.hidden = true;
    els.ocrProgress.hidden = true;
    els.textEditor.hidden = true;
    els.saveNextBtn.hidden = true;
    els.ocrText.value = "";
    els.liveSession.hidden = false;
    els.liveStatus.textContent = "Saved — flip the page in Selar, then Snap";
    return;
  }

  resetCaptureUi();
  await openBook(bookId);
}

function exportBook() {
  if (!state.pages.length) {
    alert("Nothing to export yet.");
    return;
  }
  const book = state.books.find((b) => b.id === state.currentBookId);
  const title = book?.title || "readglass-export";
  const body = state.pages
    .map((page, i) => `--- Page ${i + 1} ---\n\n${page.text}`)
    .join("\n\n\n");
  const blob = new Blob([`${title}\n\n${body}\n`], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${title.replace(/[^\w\-]+/g, "-").toLowerCase() || "readglass"}.txt`;
  a.click();
  URL.revokeObjectURL(url);
}

function wireEvents() {
  els.backBtn.addEventListener("click", async () => {
    if (state.view === "reader" || state.view === "capture" || state.view === "listenSetup") {
      if ((state.view === "reader" || state.view === "capture") && (state.currentBookId || state.captureBookId)) {
        await refreshLibrary();
        await openBook(state.currentBookId || state.captureBookId);
        return;
      }
    }
    if (state.view === "book") {
      await refreshLibrary();
      showView("library");
      return;
    }
    await refreshLibrary();
    showView("library");
  });

  els.themeBtn.addEventListener("click", () => {
    const idx = THEMES.indexOf(state.theme);
    state.theme = THEMES[(idx + 1) % THEMES.length];
    applyTheme();
  });

  els.justListenBtn?.addEventListener("click", () => openListenSetup());

  els.startAutoListenBtn?.addEventListener("click", () => {
    runAutoListenSession();
  });

  els.autoNextPageBtn?.addEventListener("click", () => {
    if (state.autoContinue) state.autoContinue();
  });

  els.autoResnapBtn?.addEventListener("click", () => {
    if (state.autoResnap) state.autoResnap();
    else if (state.autoContinue) state.autoContinue();
  });

  els.stopAutoListenBtn?.addEventListener("click", () => {
    stopAutoListenSession();
    setAutoStatus("Stopped. Tap Start Auto Listen to begin again.");
  });

  els.copySelarHelperBtn?.addEventListener("click", async () => {
    const line = getSelarHelperLauncher();
    try {
      await navigator.clipboard.writeText(line);
      els.selarHelperCopyStatus.hidden = false;
      els.selarHelperCopyStatus.textContent =
        "Copied. On Selar: F12 → Console → paste → Enter. Then tap Start on the green panel.";
    } catch {
      els.selarHelperCopyStatus.hidden = false;
      els.selarHelperCopyStatus.textContent = "Could not copy automatically:";
      prompt("Paste this into the Selar Console:", line);
    }
  });

  els.copyAndroidBookmarkBtn?.addEventListener("click", async () => {
    const line = getSelarAndroidBookmark();
    try {
      await navigator.clipboard.writeText(line);
      els.androidBookmarkStatus.hidden = false;
      els.androidBookmarkStatus.textContent =
        "Copied. Edit your Selar bookmark URL, paste this whole text, save, then open that bookmark on the book page.";
    } catch {
      els.androidBookmarkStatus.hidden = false;
      prompt("Paste this as your bookmark URL on Selar:", line);
    }
  });

  els.previewAndroidPaneBtn?.addEventListener("click", () => {
    previewMobileReaderPane();
  });

  window.addEventListener("keydown", (event) => {
    if (state.view !== "listenSetup" || !state.autoWaiting) return;
    if (event.code === "Space" || event.code === "Enter") {
      event.preventDefault();
      if (state.autoContinue) state.autoContinue();
    }
  });

  els.newBookBtn?.addEventListener("click", () => {
    els.newBookTitle.value = "";
    els.newBookModal.showModal();
    els.newBookTitle.focus();
  });

  els.newBookForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const submitter = event.submitter;
    const value = submitter?.value || "create";
    if (value === "cancel") {
      els.newBookModal.close();
      return;
    }
    const title = els.newBookTitle.value.trim() || "Untitled";
    const book = await createBook(title);
    els.newBookModal.close();
    await refreshLibrary();
    openCapture(book.id, book.title);
  });

  els.quickCaptureBtn.addEventListener("click", () => {
    state.currentBookId = null;
    openCapture(null, "Read screen");
  });

  els.screenCaptureBtn.addEventListener("click", () => startLiveScreen());
  els.snapLiveBtn.addEventListener("click", () => snapLiveScreen());
  els.stopLiveBtn.addEventListener("click", () => {
    stopLiveSession();
    configureCaptureOptions();
  });

  els.pasteCaptureBtn.addEventListener("click", async () => {
    try {
      const blob = await pasteImageFromClipboard();
      await runOcr(blob);
    } catch (error) {
      if (error?.name === "NotAllowedError") {
        alert("Allow clipboard access, or use Chrome screenshot instead.");
        return;
      }
      alert(error.message || "Paste failed.");
    }
  });

  // Paste image with Cmd/Ctrl+V while on capture view
  window.addEventListener("paste", async (event) => {
    if (state.view !== "capture") return;
    const items = event.clipboardData?.items;
    if (!items) return;
    for (const item of items) {
      if (!item.type.startsWith("image/")) continue;
      event.preventDefault();
      const file = item.getAsFile();
      if (file) await runOcr(file);
      return;
    }
  });

  els.cameraInput.addEventListener("change", async () => {
    const file = els.cameraInput.files?.[0];
    els.cameraInput.value = "";
    if (file) await runOcr(file);
  });

  els.fileInput.addEventListener("change", async () => {
    const files = [...(els.fileInput.files || [])];
    els.fileInput.value = "";
    if (!files.length) return;

    // One screenshot: OCR now. Several: OCR + save each, then open the book.
    if (files.length === 1) {
      await runOcr(files[0]);
      return;
    }

    const bookId = await ensureCaptureBook();
    for (let i = 0; i < files.length; i += 1) {
      els.previewWrap.hidden = false;
      els.ocrProgress.hidden = false;
      els.textEditor.hidden = true;
      const url = URL.createObjectURL(files[i]);
      if (state.pendingImageUrl) URL.revokeObjectURL(state.pendingImageUrl);
      state.pendingImageUrl = url;
      els.previewImage.src = url;
      els.ocrStatus.textContent = `Reading screenshot ${i + 1} of ${files.length}…`;
      els.ocrBar.style.width = "8%";
      try {
        const text = await recognizeImage(files[i], (progress) => {
          const pct = Math.max(8, Math.round(progress * 100));
          els.ocrBar.style.width = `${pct}%`;
        });
        if (text) await addPage(bookId, text);
      } catch (error) {
        alert(error.message || `Could not read screenshot ${i + 1}.`);
      }
    }
    resetCaptureUi();
    await refreshLibrary();
    await openBook(bookId);
  });

  els.recaptureBtn.addEventListener("click", () => {
    if (screenSession.active) {
      resetCaptureUi({ keepLive: true });
      showLiveSession(screenSession.video);
      return;
    }
    resetCaptureUi();
  });
  els.savePageBtn.addEventListener("click", () => saveCapturedPage({ continueLive: false }));
  els.saveNextBtn.addEventListener("click", () => saveCapturedPage({ continueLive: true }));

  els.addPageBtn.addEventListener("click", () => {
    const book = state.books.find((b) => b.id === state.currentBookId);
    openCapture(state.currentBookId, book?.title);
  });

  els.readBookBtn.addEventListener("click", () => openReader(state.currentBookId, 0));
  els.exportBtn.addEventListener("click", exportBook);

  let renameTimer;
  els.bookTitleInput.addEventListener("input", () => {
    clearTimeout(renameTimer);
    renameTimer = setTimeout(async () => {
      if (!state.currentBookId) return;
      await renameBook(state.currentBookId, els.bookTitleInput.value);
      await refreshLibrary();
    }, 400);
  });

  els.prevPageBtn.addEventListener("click", () => {
    if (state.readerIndex <= 0) return;
    const wasListening = narrator.isPlaying() || narrator.isPaused() || state.autoListen;
    state.readerIndex -= 1;
    renderReader();
    if (wasListening) startListening();
  });

  els.nextPageBtn.addEventListener("click", () => {
    if (state.readerIndex >= state.pages.length - 1) return;
    const wasListening = narrator.isPlaying() || narrator.isPaused() || state.autoListen;
    state.readerIndex += 1;
    renderReader();
    if (wasListening) startListening();
  });

  els.fontDownBtn.addEventListener("click", () => {
    state.fontSize = Math.max(FONT_MIN, Number((state.fontSize - FONT_STEP).toFixed(1)));
    applyFont();
  });

  els.fontUpBtn.addEventListener("click", () => {
    state.fontSize = Math.min(FONT_MAX, Number((state.fontSize + FONT_STEP).toFixed(1)));
    applyFont();
  });

  els.listenBtn.addEventListener("click", () => {
    if (!narrator.isSupported()) {
      alert("Text-to-speech is not available in this browser.");
      return;
    }
    if (narrator.isPaused()) {
      state.autoListen = true;
      narrator.resume();
      return;
    }
    if (narrator.isPlaying()) {
      narrator.pause();
      return;
    }
    startListening();
  });

  els.speechStopBtn.addEventListener("click", () => stopListening());
  els.speechSlowerBtn.addEventListener("click", () => narrator.slower());
  els.speechFasterBtn.addEventListener("click", () => narrator.faster());

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    state.deferredInstall = event;
    els.installBtn.hidden = false;
  });

  els.installBtn.addEventListener("click", async () => {
    if (!state.deferredInstall) return;
    state.deferredInstall.prompt();
    await state.deferredInstall.userChoice;
    state.deferredInstall = null;
    els.installBtn.hidden = true;
  });
}

async function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  try {
    await navigator.serviceWorker.register("./sw.js");
  } catch {
    // Ignore SW failures on file:// or restricted hosts.
  }
}

applyTheme();
applyFont();
updateListenUi();
configureListenSetupForPlatform();
wireEvents();
refreshLibrary();
registerServiceWorker();
if (location.hash === "#listen") openListenSetup();
else showView("library");
