const DB_NAME = "readglass";
const DB_VERSION = 1;
const BOOKS = "books";
const PAGES = "pages";

function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(BOOKS)) {
        db.createObjectStore(BOOKS, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(PAGES)) {
        const pages = db.createObjectStore(PAGES, { keyPath: "id" });
        pages.createIndex("byBook", "bookId", { unique: false });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function txDone(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error("Transaction aborted"));
  });
}

function uuid() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export async function listBooks() {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(BOOKS, "readonly");
    const req = tx.objectStore(BOOKS).getAll();
    req.onsuccess = () => {
      const books = req.result.sort((a, b) => b.updatedAt - a.updatedAt);
      resolve(books);
    };
    req.onerror = () => reject(req.error);
  });
}

export async function getBook(id) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(BOOKS, "readonly");
    const req = tx.objectStore(BOOKS).get(id);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}

export async function saveBook(book) {
  const db = await openDb();
  const tx = db.transaction(BOOKS, "readwrite");
  tx.objectStore(BOOKS).put(book);
  await txDone(tx);
  return book;
}

export async function createBook(title) {
  const now = Date.now();
  const book = {
    id: uuid(),
    title: title.trim() || "Untitled",
    createdAt: now,
    updatedAt: now,
  };
  return saveBook(book);
}

export async function renameBook(id, title) {
  const book = await getBook(id);
  if (!book) throw new Error("Book not found");
  book.title = title.trim() || "Untitled";
  book.updatedAt = Date.now();
  return saveBook(book);
}

export async function deleteBook(id) {
  const db = await openDb();
  const pages = await listPages(id);
  const tx = db.transaction([BOOKS, PAGES], "readwrite");
  tx.objectStore(BOOKS).delete(id);
  const pageStore = tx.objectStore(PAGES);
  for (const page of pages) pageStore.delete(page.id);
  await txDone(tx);
}

export async function listPages(bookId) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(PAGES, "readonly");
    const index = tx.objectStore(PAGES).index("byBook");
    const req = index.getAll(bookId);
    req.onsuccess = () => {
      const pages = req.result.sort((a, b) => a.order - b.order);
      resolve(pages);
    };
    req.onerror = () => reject(req.error);
  });
}

export async function addPage(bookId, text) {
  const pages = await listPages(bookId);
  const now = Date.now();
  const page = {
    id: uuid(),
    bookId,
    text: text.trim(),
    order: pages.length,
    createdAt: now,
  };
  const db = await openDb();
  const tx = db.transaction([PAGES, BOOKS], "readwrite");
  tx.objectStore(PAGES).put(page);
  const bookReq = tx.objectStore(BOOKS).get(bookId);
  await new Promise((resolve, reject) => {
    bookReq.onsuccess = () => {
      const book = bookReq.result;
      if (book) {
        book.updatedAt = now;
        tx.objectStore(BOOKS).put(book);
      }
      resolve();
    };
    bookReq.onerror = () => reject(bookReq.error);
  });
  await txDone(tx);
  return page;
}

export async function updatePage(id, text) {
  const db = await openDb();
  const tx = db.transaction([PAGES, BOOKS], "readwrite");
  const pageStore = tx.objectStore(PAGES);
  const page = await new Promise((resolve, reject) => {
    const req = pageStore.get(id);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
  if (!page) throw new Error("Page not found");
  page.text = text.trim();
  pageStore.put(page);
  const bookReq = tx.objectStore(BOOKS).get(page.bookId);
  await new Promise((resolve, reject) => {
    bookReq.onsuccess = () => {
      const book = bookReq.result;
      if (book) {
        book.updatedAt = Date.now();
        tx.objectStore(BOOKS).put(book);
      }
      resolve();
    };
    bookReq.onerror = () => reject(bookReq.error);
  });
  await txDone(tx);
  return page;
}

export async function deletePage(id) {
  const db = await openDb();
  const page = await new Promise((resolve, reject) => {
    const tx = db.transaction(PAGES, "readonly");
    const req = tx.objectStore(PAGES).get(id);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
  if (!page) return;

  const remaining = (await listPages(page.bookId)).filter((p) => p.id !== id);
  const write = db.transaction([PAGES, BOOKS], "readwrite");
  write.objectStore(PAGES).delete(id);
  remaining.forEach((p, index) => {
    p.order = index;
    write.objectStore(PAGES).put(p);
  });
  const bookReq = write.objectStore(BOOKS).get(page.bookId);
  await new Promise((resolve, reject) => {
    bookReq.onsuccess = () => {
      const book = bookReq.result;
      if (book) {
        book.updatedAt = Date.now();
        write.objectStore(BOOKS).put(book);
      }
      resolve();
    };
    bookReq.onerror = () => reject(bookReq.error);
  });
  await txDone(write);
}
