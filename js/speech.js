const RATE_MIN = 0.7;
const RATE_MAX = 1.6;
const RATE_STEP = 0.1;

function chunkText(text) {
  const parts = String(text)
    .split(/(?<=[.!?])\s+|\n+/)
    .map((p) => p.trim())
    .filter(Boolean);
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
  return chunks.length ? chunks : [String(text).trim()];
}

export function createNarrator({ onEnd, onStateChange } = {}) {
  let playing = false;
  let paused = false;
  let queue = [];
  let continueBook = true;
  let rate = Number(localStorage.getItem("rg-speech-rate") || 1);

  function emit() {
    onStateChange?.({ playing, paused, rate, supported: isSupported() });
  }

  function isSupported() {
    return typeof window !== "undefined" && "speechSynthesis" in window;
  }

  function pickVoice() {
    const voices = speechSynthesis.getVoices();
    if (!voices.length) return null;
    const preferred =
      voices.find((v) => /en(-|_|$)/i.test(v.lang) && /google|microsoft|samantha|daniel|aria/i.test(v.name)) ||
      voices.find((v) => /en(-|_|$)/i.test(v.lang)) ||
      voices[0];
    return preferred;
  }

  function stop() {
    if (!isSupported()) return;
    speechSynthesis.cancel();
    queue = [];
    playing = false;
    paused = false;
    emit();
  }

  function speakQueue() {
    if (!queue.length) {
      playing = false;
      paused = false;
      emit();
      if (continueBook) onEnd?.();
      return;
    }

    const text = queue.shift();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = rate;
    const voice = pickVoice();
    if (voice) utterance.voice = voice;

    utterance.onend = () => speakQueue();
    utterance.onerror = () => speakQueue();

    playing = true;
    paused = false;
    emit();
    speechSynthesis.speak(utterance);
  }

  function speak(text, options = {}) {
    if (!isSupported()) {
      throw new Error("Text-to-speech is not supported in this browser.");
    }
    const cleaned = (text || "").trim();
    if (!cleaned) {
      throw new Error("This page has no text to read aloud.");
    }

    continueBook = options.continueBook !== false;
    stop();
    queue = chunkText(cleaned);
    speakQueue();
  }

  function pause() {
    if (!isSupported() || !playing || paused) return;
    speechSynthesis.pause();
    paused = true;
    emit();
  }

  function resume() {
    if (!isSupported() || !paused) return;
    speechSynthesis.resume();
    paused = false;
    playing = true;
    emit();
  }

  function toggle(text) {
    if (paused) {
      resume();
      return;
    }
    if (playing) {
      pause();
      return;
    }
    speak(text);
  }

  function setRate(next) {
    rate = Math.min(RATE_MAX, Math.max(RATE_MIN, Number(next.toFixed(1))));
    localStorage.setItem("rg-speech-rate", String(rate));
    emit();
  }

  function slower() {
    setRate(rate - RATE_STEP);
  }

  function faster() {
    setRate(rate + RATE_STEP);
  }

  if (isSupported()) {
    speechSynthesis.addEventListener("voiceschanged", () => emit());
  }

  emit();

  return {
    isSupported,
    speak,
    stop,
    pause,
    resume,
    toggle,
    slower,
    faster,
    getRate: () => rate,
    isPlaying: () => playing,
    isPaused: () => paused,
  };
}

export { RATE_MIN, RATE_MAX, RATE_STEP };
