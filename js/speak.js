/**
 * Speaks text and resolves when finished (or stopped).
 */
export function speakUntilDone(text, { rate = 1, signal } = {}) {
  return new Promise((resolve, reject) => {
    if (!("speechSynthesis" in window)) {
      reject(new Error("Text-to-speech is not supported in this browser."));
      return;
    }
    const cleaned = String(text || "").trim();
    if (!cleaned) {
      resolve({ empty: true });
      return;
    }

    const parts = cleaned
      .split(/(?<=[.!?])\s+|\n+/)
      .map((p) => p.trim())
      .filter(Boolean);
    const chunks = [];
    let buf = "";
    for (const part of parts) {
      if ((buf + " " + part).trim().length > 1500) {
        if (buf) chunks.push(buf.trim());
        buf = part;
      } else {
        buf = buf ? `${buf} ${part}` : part;
      }
    }
    if (buf.trim()) chunks.push(buf.trim());
    if (!chunks.length) chunks.push(cleaned);

    let stopped = false;
    const onAbort = () => {
      stopped = true;
      speechSynthesis.cancel();
      resolve({ aborted: true });
    };
    signal?.addEventListener("abort", onAbort, { once: true });

    const voices = () => speechSynthesis.getVoices();
    const pick = () =>
      voices().find((v) => /en(-|_|$)/i.test(v.lang) && /google|microsoft|samantha|aria|daniel/i.test(v.name)) ||
      voices().find((v) => /en(-|_|$)/i.test(v.lang)) ||
      voices()[0] ||
      null;

    const speakNext = () => {
      if (stopped) return;
      if (!chunks.length) {
        signal?.removeEventListener("abort", onAbort);
        resolve({ aborted: false });
        return;
      }
      const utter = new SpeechSynthesisUtterance(chunks.shift());
      utter.rate = rate;
      const voice = pick();
      if (voice) utter.voice = voice;
      utter.onend = () => speakNext();
      utter.onerror = () => speakNext();
      speechSynthesis.speak(utter);
    };

    speechSynthesis.cancel();
    speakNext();
  });
}
