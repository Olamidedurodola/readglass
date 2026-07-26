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

export async function captureScreenFrame() {
  if (!navigator.mediaDevices?.getDisplayMedia) {
    throw new Error("Screen capture is not supported in this browser. Use Camera or Screenshot instead.");
  }

  const stream = await navigator.mediaDevices.getDisplayMedia({
    video: { displaySurface: "browser" },
    audio: false,
    preferCurrentTab: true,
  });

  try {
    const track = stream.getVideoTracks()[0];
    const video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    video.srcObject = stream;
    await video.play();

    await new Promise((resolve) => {
      if (video.readyState >= 2) resolve();
      else video.onloadeddata = () => resolve();
    });

    // Brief pause so the shared frame is painted.
    await new Promise((r) => setTimeout(r, 180));

    const width = video.videoWidth || 1280;
    const height = video.videoHeight || 720;
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(video, 0, 0, width, height);
    track.stop();
    stream.getTracks().forEach((t) => t.stop());

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
  } catch (error) {
    stream.getTracks().forEach((t) => t.stop());
    throw error;
  }
}
