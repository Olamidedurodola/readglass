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
import { captureScreenFrame, recognizeImage } from "./ocr.js";

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
  screenCaptureBtn: document.getElementById("screenCaptureBtn"),
  cameraInput: document.getElementById("cameraInput"),
  fileInput: document.getElementById("fileInput"),
  previewWrap: document.getElementById("previewWrap"),
  previewImage: document.getElementById("previewImage"),
  ocrProgress: document.getElementById("ocrProgress"),
  ocrBar: document.getElementById("ocrBar"),
  ocrStatus: document.getElementById("ocrStatus"),
  textEditor: document.getElementById("textEditor"),
  ocrText: document.getElementById("ocrText"),
  recaptureBtn: document.getElementById("recaptureBtn"),
  savePageBtn: document.getElementById("savePageBtn"),
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
  newBookModal: document.getElementById("newBookModal"),
  newBookForm: document.getElementById("newBookForm"),
  newBookTitle: document.getElementById("newBookTitle"),
};

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

function renderReader() {
  const page = state.pages[state.readerIndex];
  els.readerProgress.textContent = `Page ${state.readerIndex + 1} of ${state.pages.length}`;
  els.readerText.textContent = page?.text || "";
  els.prevPageBtn.disabled = state.readerIndex <= 0;
  els.nextPageBtn.disabled = state.readerIndex >= state.pages.length - 1;
}

function resetCaptureUi() {
  if (state.pendingImageUrl) URL.revokeObjectURL(state.pendingImageUrl);
  state.pendingImageUrl = null;
  els.previewWrap.hidden = true;
  els.ocrProgress.hidden = true;
  els.textEditor.hidden = true;
  els.ocrText.value = "";
  els.ocrBar.style.width = "0%";
  els.previewImage.removeAttribute("src");
}

function openCapture(bookId, title) {
  state.captureBookId = bookId;
  els.captureTitle.textContent = title ? `Capture · ${title}` : "Capture page";
  resetCaptureUi();
  showView("capture");
}

async function runOcr(blobOrFile) {
  resetCaptureUi();
  const url = URL.createObjectURL(blobOrFile);
  state.pendingImageUrl = url;
  els.previewImage.src = url;
  els.previewWrap.hidden = false;
  els.ocrProgress.hidden = false;
  els.ocrStatus.textContent = "Reading text…";
  els.ocrBar.style.width = "4%";

  try {
    const text = await recognizeImage(blobOrFile, (progress) => {
      const pct = Math.max(4, Math.round(progress * 100));
      els.ocrBar.style.width = `${pct}%`;
      els.ocrStatus.textContent = `Reading text… ${pct}%`;
    });
    els.ocrBar.style.width = "100%";
    els.ocrStatus.textContent = text ? "Done. Fix any OCR mistakes below." : "No text found. Try a clearer capture.";
    els.ocrText.value = text;
    els.textEditor.hidden = false;
  } catch (error) {
    els.ocrStatus.textContent = error.message || "OCR failed.";
    alert(error.message || "OCR failed.");
  }
}

async function ensureCaptureBook() {
  if (state.captureBookId) return state.captureBookId;
  const book = await createBook(`Capture ${formatDate(Date.now())}`);
  state.captureBookId = book.id;
  state.currentBookId = book.id;
  return book.id;
}

async function saveCapturedPage() {
  const text = els.ocrText.value.trim();
  if (!text) {
    alert("Add some text before saving.");
    return;
  }
  const bookId = await ensureCaptureBook();
  await addPage(bookId, text);
  resetCaptureUi();
  await refreshLibrary();
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
    openCapture(null, "Quick capture");
  });

  els.screenCaptureBtn.addEventListener("click", async () => {
    try {
      const blob = await captureScreenFrame();
      await runOcr(blob);
    } catch (error) {
      if (error?.name === "NotAllowedError") return;
      alert(error.message || "Screen capture failed.");
    }
  });

  els.cameraInput.addEventListener("change", async () => {
    const file = els.cameraInput.files?.[0];
    els.cameraInput.value = "";
    if (file) await runOcr(file);
  });

  els.fileInput.addEventListener("change", async () => {
    const file = els.fileInput.files?.[0];
    els.fileInput.value = "";
    if (file) await runOcr(file);
  });

  els.recaptureBtn.addEventListener("click", () => resetCaptureUi());
  els.savePageBtn.addEventListener("click", () => saveCapturedPage());

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
    state.readerIndex -= 1;
    renderReader();
  });

  els.nextPageBtn.addEventListener("click", () => {
    if (state.readerIndex >= state.pages.length - 1) return;
    state.readerIndex += 1;
    renderReader();
  });

  els.fontDownBtn.addEventListener("click", () => {
    state.fontSize = Math.max(FONT_MIN, Number((state.fontSize - FONT_STEP).toFixed(1)));
    applyFont();
  });

  els.fontUpBtn.addEventListener("click", () => {
    state.fontSize = Math.min(FONT_MAX, Number((state.fontSize + FONT_STEP).toFixed(1)));
    applyFont();
  });

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
wireEvents();
refreshLibrary();
registerServiceWorker();
showView("library");
