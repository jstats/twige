import { put, get } from "./store.js";

function findVoice(lang = "en") {
  const voices = window.speechSynthesis?.getVoices?.() || [];
  if (lang === "sw") {
    return (
      voices.find((v) => /^sw[-_]KE/i.test(v.lang)) ||
      voices.find((v) => /^sw[-_]TZ/i.test(v.lang)) ||
      voices.find((v) => /^sw([-_]|$)/i.test(v.lang)) ||
      null
    );
  }
  return (
    voices.find((v) => v.lang === "en-GB") ||
    voices.find((v) => v.lang === "en-US") ||
    voices.find((v) => v.lang?.startsWith("en")) ||
    null
  );
}

export function hasSwVoice() {
  return Boolean(findVoice("sw"));
}

// Text-to-speech: English by default; Kiswahili only when opt-in allowSw=true AND device has an sw voice.
// Resolves when speaking ends; returns false if unavailable.
export function speak(text, lang = "en", rate = 1, allowSw = false) {
  if (!("speechSynthesis" in window)) return false;
  if (lang === "sw" && (!allowSw || !hasSwVoice())) return false;
  return new Promise((resolve) => {
    let done = false;
    const finish = () => {
      if (!done) {
        done = true;
        clearTimeout(timer);
        resolve(true);
      }
    };
    const u = new SpeechSynthesisUtterance(text);
    const v = findVoice(lang);
    if (v) u.voice = v;
    u.lang = v?.lang || (lang === "sw" ? "sw-KE" : "en-GB");
    u.rate = rate;
    u.onend = u.onerror = finish;
    const timer = setTimeout(finish, 12000);
    try {
      speechSynthesis.cancel();
      speechSynthesis.speak(u);
    } catch {
      finish();
    }
  });
}

export async function record(key) {
  if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
    throw Error("Recording is not available in this browser.");
  }
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

// Speech recognition (Chrome; needs internet). Resolves with the transcript, or null (undefined if unsupported).
export function listen(lang = "en", timeoutMs = 10000) {
  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!Recognition) return Promise.resolve(undefined);
  return new Promise((resolve) => {
    let done = false;
    let timer;
    const finish = (v) => {
      if (!done) {
        done = true;
        clearTimeout(timer);
        resolve(v);
      }
    };
    try {
      const r = new Recognition();
      r.lang = lang === "sw" ? "sw-KE" : "en-GB";
      r.interimResults = false;
      r.maxAlternatives = 1;
      r.onresult = (e) => finish(e.results?.[0]?.[0]?.transcript || null);
      r.onerror = () => finish(null);
      r.onend = () => setTimeout(() => finish(null), 300);
      timer = setTimeout(() => {
        try { r.stop(); } catch {}
        finish(null);
      }, timeoutMs);
      r.start();
    } catch {
      finish(null);
    }
  });
}
