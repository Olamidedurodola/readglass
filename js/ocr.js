export async function recognizeImage(source, onProgress) {
  if (!globalThis.Tesseract) {
    throw new Error("OCR engine failed to load. Check your connection and reload.");
  }

  const result = await Tesseract.recognize(source, "eng", {
    logger: (message) => {
      if (!onProgress || message.status !== "recognizing text") return;
      onProgress(message.progress ?? 0);
    },
  });

  return (result?.data?.text || "").trim();
}

export function supportsScreenCapture() {
  return Boolean(navigator.mediaDevices?.getDisplayMedia);
}

/**
 * Keeps a screen/tab share open so the user can snap many pages
 * (e.g. Selar website in Chrome) without re-prompting each time.
 */
export class ScreenSession {
  constructor() {
    this.stream = null;
    this.video = null;
    this.track = null;
    this.onEnded = null;
  }

  get active() {
    return Boolean(this.stream && this.track && this.track.readyState === "live");
  }

  async start() {
    if (!supportsScreenCapture()) {
      throw new Error(
        "Live screen reading needs desktop Chrome. On phones, open Selar in Chrome and use Screenshot."
      );
    }

    this.stop();

    // Prefer another tab/window (Selar), not the ReadGlass tab.
    const attempts = [
      {
        video: { displaySurface: "browser", frameRate: 5 },
        audio: false,
        preferCurrentTab: false,
        selfBrowserSurface: "exclude",
        surfaceSwitching: "include",
        monitorTypeSurfaces: "include",
      },
      {
        video: true,
        audio: false,
        preferCurrentTab: false,
      },
      {
        video: true,
        audio: false,
      },
    ];

    let lastError;
    for (const options of attempts) {
      try {
        this.stream = await navigator.mediaDevices.getDisplayMedia(options);
        lastError = null;
        break;
      } catch (error) {
        lastError = error;
        if (error?.name === "NotAllowedError") throw error;
      }
    }
    if (!this.stream) throw lastError || new Error("Could not start screen share.");

    this.track = this.stream.getVideoTracks()[0];
    this.track.addEventListener("ended", () => {
      this.stop();
      this.onEnded?.();
    });

    this.video = document.createElement("video");
    this.video.muted = true;
    this.video.playsInline = true;
    this.video.srcObject = this.stream;
    await this.video.play();

    await new Promise((resolve) => {
      if (this.video.readyState >= 2) resolve();
      else this.video.onloadeddata = () => resolve();
    });

    return this.video;
  }

  async snap() {
    if (!this.active || !this.video) {
      throw new Error("Screen share ended. Start Live screen again and pick the Selar Chrome tab.");
    }

    await new Promise((r) => setTimeout(r, 120));

    const width = this.video.videoWidth || 1280;
    const height = this.video.videoHeight || 720;
    if (width < 2 || height < 2) {
      throw new Error("Could not read the shared screen. Try sharing the Selar Chrome tab again.");
    }

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(this.video, 0, 0, width, height);

    // Black frame usually means the site blocked capture — fall back to OS screenshot.
    const sample = ctx.getImageData(0, 0, Math.min(40, width), Math.min(40, height)).data;
    let lit = 0;
    for (let i = 0; i < sample.length; i += 4) {
      if (sample[i] + sample[i + 1] + sample[i + 2] > 30) lit += 1;
    }
    if (lit < 3) {
      throw new Error(
        "That tab looks blank (capture blocked). Open Selar in Chrome and use an OS screenshot instead."
      );
    }

    return await new Promise((resolve, reject) => {
      canvas.toBlob(
        (blob) => {
          if (!blob) reject(new Error("Could not capture frame."));
          else resolve(blob);
        },
        "image/png",
        0.95
      );
    });
  }

  stop() {
    if (this.track) {
      try {
        this.track.stop();
      } catch {
        /* ignore */
      }
    }
    if (this.stream) {
      this.stream.getTracks().forEach((t) => {
        try {
          t.stop();
        } catch {
          /* ignore */
        }
      });
    }
    if (this.video) {
      this.video.srcObject = null;
    }
    this.stream = null;
    this.track = null;
    this.video = null;
  }
}
