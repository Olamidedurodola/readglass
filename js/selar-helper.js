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

  function grabPageCanvas() {
    const nodes = [...document.querySelectorAll("canvas, img")].filter((el) => {
      if (el.closest("#rg-selar-helper")) return false;
      return visibleScore(el) > 0;
    });
    nodes.sort((a, b) => visibleScore(b) - visibleScore(a));
    const top = nodes[0];
    if (!top) return null;

    const canvas = document.createElement("canvas");
    if (top.tagName === "CANVAS") {
      canvas.width = top.width || top.clientWidth;
      canvas.height = top.height || top.clientHeight;
      canvas.getContext("2d").drawImage(top, 0, 0);
    } else {
      const w = top.naturalWidth || top.width || top.clientWidth;
      const h = top.naturalHeight || top.height || top.clientHeight;
      canvas.width = w;
      canvas.height = h;
      try {
        canvas.getContext("2d").drawImage(top, 0, 0, w, h);
      } catch {
        return null;
      }
    }

    // Crop edges to reduce toolbar / dark margins noise.
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

  function pageFingerprint() {
    const label = document.body.innerText.match(/(\d+)\s*\/\s*(\d+)/);
    if (label) return label[0];
    const c = grabPageCanvas();
    if (!c) return String(Date.now());
    const ctx = c.getContext("2d");
    const data = ctx.getImageData(0, 0, Math.min(32, c.width), Math.min(32, c.height)).data;
    let hash = 0;
    for (let i = 0; i < data.length; i += 16) hash = (hash * 31 + data[i]) | 0;
    return `${c.width}x${c.height}:${hash}`;
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
    const keyOpts = { key: "ArrowRight", code: "ArrowRight", keyCode: 39, which: 39, bubbles: true, cancelable: true };
    document.dispatchEvent(new KeyboardEvent("keydown", keyOpts));
    window.dispatchEvent(new KeyboardEvent("keydown", keyOpts));
    document.body?.dispatchEvent(new KeyboardEvent("keydown", keyOpts));

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
    return false;
  }

  async function waitForPageChange(prev) {
    for (let i = 0; i < 40; i += 1) {
      await sleep(250);
      if (!state.running) return false;
      if (pageFingerprint() !== prev) {
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
      status(`Page ${n}: capturing what’s on screen…`);
      await sleep(400);

      const canvas = grabPageCanvas();
      if (!canvas) {
        status("No page image found. Open the book viewer, then Start again.");
        break;
      }

      status(`Page ${n}: reading text…`);
      let text = "";
      try {
        text = await ocrCanvas(canvas);
      } catch (error) {
        status(error.message || "OCR failed");
        await sleep(800);
        continue;
      }

      if (!text || text.length < 20) {
        status(`Page ${n}: little/no text (cover?). Flipping…`);
        if (autoFlipOn()) {
          const prev = pageFingerprint();
          flipNext();
          await waitForPageChange(prev);
          continue;
        }
        break;
      }

      status(`Page ${n}: listening…`);
      const spoken = await speak(text);
      if (!state.running || spoken.aborted) break;

      if (!autoFlipOn()) {
        status(`Page ${n} done. Turn the page, then press Start.`);
        break;
      }

      status(`Page ${n} done — flipping…`);
      const prev = pageFingerprint();
      flipNext();
      const changed = await waitForPageChange(prev);
      if (!changed) {
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
  status("Tap Start — it will read THIS page, then auto-flip.");
})();
