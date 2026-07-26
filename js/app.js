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
  captureView: document.getElementById("captureView"),
  bookView: document.getElementById("bookView"),
  readerView: document.getElementById("readerView"),
  newBookBtn: document.getElementById("newBookBtn"),
  quickCaptureBtn: document.getElementById("quickCaptureBtn"),
  bookGrid: document.getElementById("bookGrid"),
  libraryEmpty: document.getElementById("libraryEmpty"),
  bookCount: document.getElementById("bookCount"),
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
  state.view = view;
  els.libraryView.hidden = view !== "library";
  els.captureView.hidden = view !== "capture";
  els.bookView.hidden = view !== "book";
  els.readerView.hidden = view !== "reader";
  els.backBtn.hidden = view === "library";
  els.brandMark.hidden = view !== "library";
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
  els.liveStatus.textContent = "Connected — open Stelar, then Snap page";
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
      : "Screenshot Stelar in your browser, then tap Add screenshot.";
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
  throw new Error("No image on the clipboard. Screenshot Stelar in Chrome, copy it, then Paste.");
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
    els.liveStatus.textContent = "Choose the Stelar Chrome tab…";
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
  const book = await createBook(`Stelar ${formatDate(Date.now())}`);
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
    els.liveStatus.textContent = "Saved — flip the page in Stelar, then Snap";
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
    if (state.view === "reader" || state.view === "capture") {
      if (state.currentBookId || state.captureBookId) {
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

  els.newBookBtn.addEventListener("click", () => {
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
configureCaptureOptions();
wireEvents();
refreshLibrary();
registerServiceWorker();
showView("library");
