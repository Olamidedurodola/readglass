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

  async snap({ settleMs = 500, crop = true } = {}) {
    if (!this.active || !this.video) {
      throw new Error("Screen share ended. Start again and pick the Selar Chrome tab (not ReadGlass).");
    }

    await new Promise((r) => setTimeout(r, settleMs));

    const width = this.video.videoWidth || 1280;
    const height = this.video.videoHeight || 720;
    if (width < 2 || height < 2) {
      throw new Error("Could not read the shared screen. Share the Selar tab only.");
    }

    const full = document.createElement("canvas");
    full.width = width;
    full.height = height;
    const fullCtx = full.getContext("2d");
    fullCtx.drawImage(this.video, 0, 0, width, height);

    const sx = Math.floor(width * 0.4);
    const sy = Math.floor(height * 0.4);
    const sample = fullCtx.getImageData(sx, sy, Math.min(40, width - sx), Math.min(40, height - sy)).data;
    let lit = 0;
    for (let i = 0; i < sample.length; i += 4) {
      if (sample[i] + sample[i + 1] + sample[i + 2] > 30) lit += 1;
    }
    if (lit < 3) {
      throw new Error(
        "That share looks blank. Share the Selar Chrome tab (Chrome → Tab → Selar), not the whole desktop."
      );
    }

    let out = full;
    if (crop) {
      const x = Math.floor(width * 0.08);
      const y = Math.floor(height * 0.06);
      const w = Math.floor(width * 0.84);
      const h = Math.floor(height * 0.78);
      const cropped = document.createElement("canvas");
      cropped.width = w;
      cropped.height = h;
      cropped.getContext("2d").drawImage(full, x, y, w, h, 0, 0, w, h);
      out = cropped;
    }

    return await new Promise((resolve, reject) => {
      out.toBlob(
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
