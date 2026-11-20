import { put, get } from "./store.js";

function englishVoice() {
  const voices = window.speechSynthesis?.getVoices?.() || [];
  return (
    voices.find((v) => v.lang === "en-GB") ||
    voices.find((v) => v.lang === "en-US") ||
    voices.find((v) => v.lang?.startsWith("en")) ||
    null
  );
}

// Text-to-speech for English only. Kiswahili voices are often missing on phones, so Kiswahili
// uses recorded audio files when they exist (none yet). Resolves when speaking ends; false if unavailable.
export function speak(text, lang = "en", rate = 1) {
  if (!("speechSynthesis" in window) || lang === "sw") return false;
  return new Promise((resolve) => {
    const u = new SpeechSynthesisUtterance(text);
    const v = englishVoice();
    if (v) u.voice = v;
    u.lang = v?.lang || "en-GB";
    u.rate = rate;
    u.onend = u.onerror = () => resolve(true);
    speechSynthesis.cancel();
    speechSynthesis.speak(u);
  });
}

export async function record(key) {
  if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) throw Error("Recording is not available in this browser.");
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const chunks = [];
  const recorder = new MediaRecorder(stream);
  recorder.ondataavailable = (e) => chunks.push(e.data);
  recorder.start();
  return {
    key,
    stop: () =>
      new Promise((resolve) => {
        recorder.onstop = async () => {
          stream.getTracks().forEach((t) => t.stop());
          const blob = new Blob(chunks, { type: recorder.mimeType });
          await put(key, blob, "recordings");
          resolve(blob);
        };
        recorder.stop();
      }),
  };
}

// Plays a saved recording. Resolves true when playback ends, false if there is no recording.
export async function playback(key) {
  const blob = await get(key, "recordings");
  if (!blob) return false;
  const url = URL.createObjectURL(blob);
  const audio = new Audio(url);
  await new Promise((resolve) => {
    audio.onended = audio.onerror = resolve;
    audio.play().catch(resolve);
  });
  URL.revokeObjectURL(url);
  return true;
}

// Speech recognition (Chrome; needs internet). Resolves with the transcript, or null.
export function listen(lang = "en", timeoutMs = 10000) {
  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!Recognition) return Promise.resolve(undefined);
  return new Promise((resolve) => {
    let done = false;
    const finish = (v) => { if (!done) { done = true; resolve(v); } };
    const r = new Recognition();
    r.lang = lang === "sw" ? "sw-KE" : "en-GB";
    r.interimResults = false;
    r.maxAlternatives = 1;
    r.onresult = (e) => finish(e.results[0][0].transcript);
    r.onerror = () => finish(null);
    r.onend = () => setTimeout(() => finish(null), 300);
    setTimeout(() => { try { r.stop(); } catch {} finish(null); }, timeoutMs);
    r.start();
  });
}
