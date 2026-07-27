/**
 * ReadGlass Selar Helper
 * Runs ON selar.com — reads the visible page image, speaks it, then flips.
 * Load via console on the book page (see ReadGlass Auto Listen instructions).
 */
(() => {
  if (window.__rgSelarHelper?.running) {
    window.__rgSelarHelper.stop();
    return;
  }

  const CDN = "https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js";
  const state = {
    running: false,
    paused: false,
    rate: Number(localStorage.getItem("rg-selar-rate") || 1) || 1,
    page: 0,
  };

  function ui() {
    let panel = document.getElementById("rg-selar-helper");
    if (panel) return panel;
    panel = document.createElement("div");
    panel.id = "rg-selar-helper";
    panel.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;gap:8px">
        <strong>ReadGlass · Selar</strong>
        <button type="button" data-x style="border:0;background:0;color:#e7ecf2;font-size:20px;cursor:pointer">×</button>
      </div>
      <p data-s style="margin:8px 0;color:#9aa7b5;font-size:12px;line-height:1.4;min-height:3.2em">Ready</p>
      <div style="display:flex;gap:6px;flex-wrap:wrap">
        <button type="button" data-m>−</button>
        <button type="button" data-go style="flex:1;background:#5ec4b2;color:#06221d;border:0;font-weight:700">Start</button>
        <button type="button" data-f>+</button>
        <button type="button" data-stop>Stop</button>
      </div>
      <label style="display:flex;gap:8px;margin-top:10px;font-size:12px;color:#9aa7b5">
        <input type="checkbox" data-auto checked /> Auto flip after each page
      </label>
    `;
    Object.assign(panel.style, {
      position: "fixed",
      zIndex: "2147483647",
      right: "12px",
      left: "auto",
      bottom: "12px",
      width: "min(320px, calc(100vw - 24px))",
      background: "#121820",
      color: "#e7ecf2",
      borderRadius: "16px",
      padding: "12px",
      font: "14px/1.4 system-ui,sans-serif",
      boxShadow: "0 18px 50px rgba(0,0,0,.45)",
    });
    panel.querySelectorAll("button").forEach((b) => {
      if (b.dataset.go) return;
      Object.assign(b.style, {
        border: "1px solid rgba(255,255,255,.14)",
        background: "#1a222d",
        color: "#e7ecf2",
        borderRadius: "999px",
        padding: "8px 12px",
        cursor: "pointer",
      });
    });
    document.documentElement.appendChild(panel);
    panel.querySelector("[data-x]").onclick = () => stop(true);
    panel.querySelector("[data-stop]").onclick = () => stop(false);
    panel.querySelector("[data-go]").onclick = () => {
      if (state.running) {
        state.paused = !state.paused;
        status(state.paused ? "Paused" : "Resumed");
        panel.querySelector("[data-go]").textContent = state.paused ? "Resume" : "Pause";
        return;
      }
      start();
    };
    panel.querySelector("[data-m]").onclick = () => {
      state.rate = Math.max(0.7, Number((state.rate - 0.1).toFixed(1)));
      localStorage.setItem("rg-selar-rate", String(state.rate));
      status(`Speed ${state.rate.toFixed(1)}x`);
    };
    panel.querySelector("[data-f]").onclick = () => {
      state.rate = Math.min(1.6, Number((state.rate + 0.1).toFixed(1)));
      localStorage.setItem("rg-selar-rate", String(state.rate));
      status(`Speed ${state.rate.toFixed(1)}x`);
    };
    return panel;
  }

  function status(msg) {
    const el = document.querySelector("#rg-selar-helper [data-s]");
    if (el) el.textContent = msg;
  }

  function autoFlipOn() {
    return Boolean(document.querySelector("#rg-selar-helper [data-auto]")?.checked);
  }

  function loadTesseract() {
    if (window.Tesseract) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = CDN;
      s.onload = () => resolve();
      s.onerror = () => reject(new Error("Could not load OCR engine"));
      document.documentElement.appendChild(s);
    });
  }

  function visibleScore(el) {
    const r = el.getBoundingClientRect();
    if (r.width < 80 || r.height < 80) return 0;
    if (r.bottom < 0 || r.right < 0 || r.top > innerHeight || r.left > innerWidth) return 0;
    return r.width * r.height;
  }

  function elementToCanvas(el) {
    const canvas = document.createElement("canvas");
    if (el.tagName === "CANVAS") {
      canvas.width = el.width || el.clientWidth;
      canvas.height = el.height || el.clientHeight;
      canvas.getContext("2d").drawImage(el, 0, 0);
    } else {
      const w = el.naturalWidth || el.width || el.clientWidth;
      const h = el.naturalHeight || el.height || el.clientHeight;
      canvas.width = w;
      canvas.height = h;
      try {
        canvas.getContext("2d").drawImage(el, 0, 0, w, h);
      } catch {
        return null;
      }
    }

    const cw = canvas.width;
    const ch = canvas.height;
    const x = Math.floor(cw * 0.04);
    const y = Math.floor(ch * 0.03);
    const w = Math.floor(cw * 0.92);
    const h = Math.floor(ch * 0.88);
    const cropped = document.createElement("canvas");
    cropped.width = w;
    cropped.height = h;
    cropped.getContext("2d").drawImage(canvas, x, y, w, h, 0, 0, w, h);
    return cropped;
  }

  function findVisiblePages() {
    const candidates = [...document.querySelectorAll("canvas, img")].filter((el) => {
      if (el.closest("#rg-selar-helper")) return false;
      const r = el.getBoundingClientRect();
      if (r.width < 120 || r.height < 200) return false;
      if (r.bottom < 40 || r.top > innerHeight - 40) return false;
      if (r.right < 0 || r.left > innerWidth) return false;
      const area = r.width * r.height;
      if (area < 40000) return false;
      return true;
    });

    candidates.sort((a, b) => a.getBoundingClientRect().left - b.getBoundingClientRect().left);

    const pages = [];
    for (const el of candidates) {
      const r = el.getBoundingClientRect();
      const dup = pages.some((p) => {
        const pr = p.getBoundingClientRect();
        const overlapX = Math.min(r.right, pr.right) - Math.max(r.left, pr.left);
        const overlapY = Math.min(r.bottom, pr.bottom) - Math.max(r.top, pr.top);
        return overlapX > r.width * 0.5 && overlapY > r.height * 0.5;
      });
      if (!dup) pages.push(el);
    }

    if (!pages.length) return [];

    const heights = pages.map((p) => p.getBoundingClientRect().height);
    const medianH = heights.sort((a, b) => a - b)[Math.floor(heights.length / 2)];

    return pages.filter((p) => {
      const h = p.getBoundingClientRect().height;
      return h >= medianH * 0.65;
    });
  }

  function combineCanvases(canvases) {
    if (!canvases.length) return null;
    if (canvases.length === 1) return canvases[0];
    const gap = 8;
    const totalW = canvases.reduce((sum, c, i) => sum + c.width + (i ? gap : 0), 0);
    const maxH = Math.max(...canvases.map((c) => c.height));
    const combined = document.createElement("canvas");
    combined.width = totalW;
    combined.height = maxH;
    const ctx = combined.getContext("2d");
    let x = 0;
    for (const c of canvases) {
      const y = Math.floor((maxH - c.height) / 2);
      ctx.drawImage(c, x, y);
      x += c.width + gap;
    }
    return combined;
  }

  function pageSideLabel(index, total) {
    if (total === 1) return "page";
    if (index === 0) return "left";
    if (index === 1) return "right";
    return `page ${index + 1}`;
  }

  async function ocrEachPage(pageEls, onProgress) {
    const results = [];
    for (let i = 0; i < pageEls.length; i += 1) {
      const side = pageSideLabel(i, pageEls.length);
      onProgress?.(`reading ${side} page…`, i, pageEls.length);
      const canvas = elementToCanvas(pageEls[i]);
      if (!canvas) continue;
      try {
        const text = await ocrCanvas(canvas);
        if (text) results.push({ side, text });
      } catch {
        /* try next page */
      }
    }
    return results;
  }

  function spreadCount() {
    return findVisiblePages().length;
  }

  function pageFingerprint() {
    const label = document.body.innerText.match(/(\d+)\s*\/\s*(\d+)/);
    if (label) return label[0];
    const pages = findVisiblePages();
    if (!pages.length) return String(Date.now());
    return pages
      .map((el) => {
        const c = elementToCanvas(el);
        if (!c) return "";
        const ctx = c.getContext("2d");
        const data = ctx.getImageData(0, 0, Math.min(16, c.width), Math.min(16, c.height)).data;
        let hash = 0;
        for (let i = 0; i < data.length; i += 16) hash = (hash * 31 + data[i]) | 0;
        return hash;
      })
      .join("|");
  }

  function currentPageNumbers() {
    const label = document.body.innerText.match(/(\d+)\s*\/\s*(\d+)/);
    if (!label) return null;
    return {
      left: Number(label[1]),
      right: Number(label[2]),
    };
  }

  async function ocrCanvas(canvas) {
    const result = await window.Tesseract.recognize(canvas, "eng");
    return String(result?.data?.text || "")
      .replace(/\u00a0/g, " ")
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  function chunkText(text) {
    const parts = text.split(/(?<=[.!?])\s+|\n+/).filter(Boolean);
    const out = [];
    let buf = "";
    for (const part of parts) {
      if ((buf + " " + part).trim().length > 1400) {
        if (buf) out.push(buf.trim());
        buf = part;
      } else buf = buf ? `${buf} ${part}` : part;
    }
    if (buf.trim()) out.push(buf.trim());
    return out.length ? out : [text];
  }

  function speak(text) {
    return new Promise(async (resolve) => {
      const chunks = chunkText(text);
      const next = async () => {
        if (!state.running) return resolve({ aborted: true });
        while (state.paused && state.running) await sleep(200);
        if (!state.running) return resolve({ aborted: true });
        if (!chunks.length) return resolve({ aborted: false });
        const u = new SpeechSynthesisUtterance(chunks.shift());
        u.rate = state.rate;
        const voices = speechSynthesis.getVoices();
        const voice =
          voices.find((v) => /en/i.test(v.lang) && /google|microsoft|samantha|aria/i.test(v.name)) ||
          voices.find((v) => /en/i.test(v.lang));
        if (voice) u.voice = voice;
        u.onend = () => next();
        u.onerror = () => next();
        speechSynthesis.speak(u);
      };
      speechSynthesis.cancel();
      next();
    });
  }

  function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }

  function flipNext() {
    const candidates = [...document.querySelectorAll("button,a,[role='button'],div,span")];
    for (const el of candidates) {
      if (el.closest("#rg-selar-helper")) continue;
      const label = `${el.getAttribute("aria-label") || ""} ${el.getAttribute("title") || ""} ${el.textContent || ""}`.trim();
      if (/^next$/i.test(label) || /next page/i.test(label) || label === ">" || label === "›" || label === "»") {
        el.click();
        return true;
      }
    }

    // Heuristic: click right-side control in bottom toolbar area.
    const toolbarHits = candidates.filter((el) => {
      const r = el.getBoundingClientRect();
      return r.width > 20 && r.width < 80 && r.height > 20 && r.height < 80 && r.bottom > innerHeight - 120 && r.left > innerWidth * 0.45;
    });
    if (toolbarHits.length) {
      toolbarHits.sort((a, b) => b.getBoundingClientRect().left - a.getBoundingClientRect().left);
      toolbarHits[0].click();
      return true;
    }

    // Final fallback: a single ArrowRight event.
    const keyOpts = { key: "ArrowRight", code: "ArrowRight", keyCode: 39, which: 39, bubbles: true, cancelable: true };
    document.dispatchEvent(new KeyboardEvent("keydown", keyOpts));
    window.dispatchEvent(new KeyboardEvent("keydown", keyOpts));
    document.body?.dispatchEvent(new KeyboardEvent("keydown", keyOpts));
    return true;
  }

  async function waitForPageChange(prev, prevNums = null) {
    for (let i = 0; i < 40; i += 1) {
      await sleep(250);
      if (!state.running) return false;
      if (pageFingerprint() !== prev) {
        const now = currentPageNumbers();
        if (prevNums && now) {
          const jumpedLeft = now.left - prevNums.left;
          const jumpedRight = now.right - prevNums.right;
          if (jumpedLeft > 2 || jumpedRight > 2) {
            status(
              `Selar jumped too far (${prevNums.left}/${prevNums.right} -> ${now.left}/${now.right}). Stopping auto-flip.`
            );
            state.running = false;
            speechSynthesis.cancel();
            return false;
          }
        }
        await sleep(500);
        return true;
      }
    }
    return false;
  }

  async function start() {
    const panel = ui();
    panel.querySelector("[data-go]").textContent = "Pause";
    state.running = true;
    state.paused = false;
    state.page = 0;

    try {
      status("Loading OCR…");
      await loadTesseract();
    } catch (error) {
      status(error.message);
      state.running = false;
      panel.querySelector("[data-go]").textContent = "Start";
      return;
    }

    while (state.running) {
      while (state.paused && state.running) await sleep(200);
      if (!state.running) break;

      state.page += 1;
      const n = state.page;
      const pageEls = findVisiblePages();
      const spread = pageEls.length;

      if (!pageEls.length) {
        status("No page image found. Open the book viewer, then Start again.");
        break;
      }

      status(
        spread > 1
          ? `Spread ${n}: found ${spread} pages — left first, then right…`
          : `Page ${n}: capturing…`
      );
      await sleep(400);

      let pageTexts = [];
      try {
        pageTexts = await ocrEachPage(pageEls, (msg) => {
          status(`Spread ${n}: ${msg}`);
        });
      } catch (error) {
        status(error.message || "OCR failed");
        await sleep(800);
        continue;
      }

      if (!pageTexts.length) {
        status(`Spread ${n}: little/no text (cover?). Flipping…`);
        if (autoFlipOn()) {
          const prev = pageFingerprint();
          const prevNums = currentPageNumbers();
          flipNext();
          await waitForPageChange(prev, prevNums);
          continue;
        }
        break;
      }

      let aborted = false;
      for (const { side, text } of pageTexts) {
        if (!state.running) {
          aborted = true;
          break;
        }
        status(
          spread > 1 ? `Spread ${n}: listening to ${side} page…` : `Page ${n}: listening…`
        );
        const spoken = await speak(text);
        if (!state.running || spoken.aborted) {
          aborted = true;
          break;
        }
      }
      if (aborted) break;

      if (!autoFlipOn()) {
        status(`Page ${n} done. Turn the page, then press Start.`);
        break;
      }

      status(`Page ${n} done — flipping…`);
      const prev = pageFingerprint();
      const prevNums = currentPageNumbers();
      flipNext();
      const changed = await waitForPageChange(prev, prevNums);
      if (!changed) {
        if (!state.running) break;
        status("Could not auto-flip. Click > once on Selar, helper will continue…");
        const manualPrev = pageFingerprint();
        for (let i = 0; i < 120 && state.running; i += 1) {
          await sleep(500);
          if (pageFingerprint() !== manualPrev) break;
        }
        await sleep(600);
      }
    }

    state.running = false;
    speechSynthesis.cancel();
    const go = document.querySelector("#rg-selar-helper [data-go]");
    if (go) go.textContent = "Start";
    if (state.page) status(`Stopped after ${state.page} page(s).`);
  }

  function stop(removePanel) {
    state.running = false;
    state.paused = false;
    speechSynthesis.cancel();
    if (removePanel) document.getElementById("rg-selar-helper")?.remove();
    else status("Stopped");
    const go = document.querySelector("#rg-selar-helper [data-go]");
    if (go) go.textContent = "Start";
  }

  window.__rgSelarHelper = { stop, start, get running() { return state.running; } };
  ui();
  status("Tap Start — reads left page fully, then right, then flips.");
})();
