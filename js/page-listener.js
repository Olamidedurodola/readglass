(() => {
  if (window.__readglassListener) {
    window.__readglassListener.togglePanel();
    return;
  }

  const RATE_KEY = "rg-page-listen-rate";
  let rate = Number(localStorage.getItem(RATE_KEY) || 1) || 1;
  let speaking = false;
  let paused = false;
  let queue = [];
  let panel;

  function pickVoice() {
    const voices = speechSynthesis.getVoices();
    return (
      voices.find((v) => /en(-|_|$)/i.test(v.lang) && /google|microsoft|samantha|aria|daniel/i.test(v.name)) ||
      voices.find((v) => /en(-|_|$)/i.test(v.lang)) ||
      voices[0] ||
      null
    );
  }

  function cleanText(raw) {
    return String(raw || "")
      .replace(/\u00a0/g, " ")
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .replace(/[ \t]{2,}/g, " ")
      .trim();
  }

  function extractText() {
    const selectors = [
      "[data-chapter-content]",
      "[class*='chapter-content' i]",
      "[class*='chapterContent' i]",
      "[class*='reader-content' i]",
      "[class*='readerContent' i]",
      "[class*='novel-content' i]",
      "[class*='article-content' i]",
      "article",
      "main",
      "[role='main']",
      ".content",
      "#content",
    ];

    for (const selector of selectors) {
      let nodes;
      try {
        nodes = document.querySelectorAll(selector);
      } catch {
        continue;
      }
      for (const node of nodes) {
        if (!node || node.closest("#rg-listen-panel")) continue;
        const text = cleanText(node.innerText || "");
        if (text.length > 180) return text;
      }
    }

    const clone = document.body.cloneNode(true);
    clone.querySelectorAll("script,style,nav,header,footer,aside,#rg-listen-panel").forEach((el) => el.remove());
    return cleanText(clone.innerText || "");
  }

  function chunkText(text) {
    const parts = text.split(/(?<=[.!?])\s+|\n+/).filter(Boolean);
    const chunks = [];
    let buf = "";
    for (const part of parts) {
      if ((buf + " " + part).trim().length > 1600) {
        if (buf) chunks.push(buf.trim());
        buf = part;
      } else {
        buf = buf ? `${buf} ${part}` : part;
      }
    }
    if (buf.trim()) chunks.push(buf.trim());
    return chunks.length ? chunks : [text];
  }

  function setStatus(msg) {
    const el = panel?.querySelector("[data-status]");
    if (el) el.textContent = msg;
  }

  function stopSpeech() {
    speechSynthesis.cancel();
    queue = [];
    speaking = false;
    paused = false;
    setStatus("Stopped");
    syncButtons();
  }

  function speakNext() {
    if (!queue.length) {
      speaking = false;
      paused = false;
      setStatus("Done with this page");
      syncButtons();
      maybeAdvance();
      return;
    }
    const text = queue.shift();
    const utter = new SpeechSynthesisUtterance(text);
    utter.rate = rate;
    const voice = pickVoice();
    if (voice) utter.voice = voice;
    utter.onend = () => speakNext();
    utter.onerror = () => speakNext();
    speaking = true;
    paused = false;
    setStatus(`Listening… ${queue.length} chunks left`);
    syncButtons();
    speechSynthesis.speak(utter);
  }

  function startListening() {
    if (!("speechSynthesis" in window)) {
      setStatus("This browser can’t speak text aloud");
      return;
    }
    const text = extractText();
    if (!text || text.length < 40) {
      setStatus("Couldn’t find chapter text on this page");
      return;
    }
    speechSynthesis.cancel();
    queue = chunkText(text);
    setStatus(`Found ${text.length.toLocaleString()} characters`);
    speakNext();
  }

  function togglePause() {
    if (!speaking && !paused) {
      startListening();
      return;
    }
    if (paused) {
      speechSynthesis.resume();
      paused = false;
      speaking = true;
      setStatus("Resumed");
    } else {
      speechSynthesis.pause();
      paused = true;
      setStatus("Paused");
    }
    syncButtons();
  }

  function findNextControl() {
    const patterns = [/next\s*chapter/i, /next\s*page/i, /^next$/i, /continue/i, /→|›|»/];
    const candidates = [
      ...document.querySelectorAll("a,button,[role='button']"),
    ];
    for (const el of candidates) {
      if (el.closest("#rg-listen-panel")) continue;
      const label = `${el.innerText || ""} ${el.getAttribute("aria-label") || ""} ${el.title || ""}`.trim();
      if (!label || label.length > 40) continue;
      if (patterns.some((re) => re.test(label))) return el;
    }
    return null;
  }

  function maybeAdvance() {
    const auto = panel?.querySelector("[data-auto]");
    if (!auto?.checked) return;
    const next = findNextControl();
    if (!next) {
      setStatus("Done — no Next button found. Turn the page, then Listen again.");
      return;
    }
    setStatus("Opening next…");
    setTimeout(() => {
      next.click();
      setTimeout(() => {
        if (document.getElementById("rg-listen-panel")) startListening();
      }, 1200);
    }, 500);
  }

  function syncButtons() {
    const play = panel?.querySelector("[data-play]");
    if (!play) return;
    if (paused) play.textContent = "Resume";
    else if (speaking) play.textContent = "Pause";
    else play.textContent = "Listen";
  }

  function buildPanel() {
    panel = document.createElement("div");
    panel.id = "rg-listen-panel";
    panel.innerHTML = `
      <div class="rg-head">
        <strong>ReadGlass Listen</strong>
        <button type="button" data-close aria-label="Close">×</button>
      </div>
      <p data-status>Ready — tap Listen to read this page aloud</p>
      <div class="rg-actions">
        <button type="button" data-slower>−</button>
        <button type="button" data-play>Listen</button>
        <button type="button" data-faster>+</button>
        <button type="button" data-stop>Stop</button>
      </div>
      <label class="rg-auto"><input type="checkbox" data-auto checked /> Auto next chapter/page</label>
    `;
    const style = document.createElement("style");
    style.textContent = `
      #rg-listen-panel{
        position:fixed;z-index:2147483647;right:12px;bottom:12px;width:min(320px,calc(100vw - 24px));
        background:#121820;color:#e7ecf2;border:1px solid rgba(231,236,242,.14);border-radius:16px;
        box-shadow:0 18px 50px rgba(0,0,0,.4);padding:12px 12px 14px;font:14px/1.4 system-ui,sans-serif;
      }
      #rg-listen-panel .rg-head{display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:6px}
      #rg-listen-panel strong{font-size:14px}
      #rg-listen-panel p{margin:0 0 10px;color:#9aa7b5;font-size:12px;min-height:2.6em}
      #rg-listen-panel .rg-actions{display:flex;gap:6px;flex-wrap:wrap}
      #rg-listen-panel button{
        border:1px solid rgba(231,236,242,.14);background:#1a222d;color:#e7ecf2;border-radius:999px;
        padding:8px 12px;cursor:pointer;font:inherit
      }
      #rg-listen-panel [data-play]{background:#5ec4b2;color:#06221d;border-color:transparent;font-weight:600;flex:1}
      #rg-listen-panel [data-close]{background:transparent;border:none;font-size:20px;line-height:1;padding:0 4px}
      #rg-listen-panel .rg-auto{display:flex;gap:8px;align-items:center;margin-top:10px;color:#9aa7b5;font-size:12px}
    `;
    document.documentElement.appendChild(style);
    document.documentElement.appendChild(panel);

    panel.querySelector("[data-play]").addEventListener("click", togglePause);
    panel.querySelector("[data-stop]").addEventListener("click", stopSpeech);
    panel.querySelector("[data-close]").addEventListener("click", () => {
      stopSpeech();
      panel.remove();
      style.remove();
      window.__readglassListener = null;
    });
    panel.querySelector("[data-slower]").addEventListener("click", () => {
      rate = Math.max(0.7, Number((rate - 0.1).toFixed(1)));
      localStorage.setItem(RATE_KEY, String(rate));
      setStatus(`Speed ${rate.toFixed(1)}x`);
    });
    panel.querySelector("[data-faster]").addEventListener("click", () => {
      rate = Math.min(1.6, Number((rate + 0.1).toFixed(1)));
      localStorage.setItem(RATE_KEY, String(rate));
      setStatus(`Speed ${rate.toFixed(1)}x`);
    });
  }

  function togglePanel() {
    if (document.getElementById("rg-listen-panel")) {
      document.getElementById("rg-listen-panel").remove();
      stopSpeech();
      return;
    }
    buildPanel();
  }

  window.__readglassListener = { togglePanel, startListening, stopSpeech };
  buildPanel();
})();
