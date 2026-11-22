// Converts a recording (webm/mp4 from the phone) to 16 kHz mono 16-bit WAV, the format Azure needs.
export function encodeWav(samples, sampleRate = 16000) {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const v = new DataView(buffer);
  const str = (o, s) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  str(0, "RIFF"); v.setUint32(4, 36 + samples.length * 2, true); str(8, "WAVE");
  str(12, "fmt "); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, sampleRate, true); v.setUint32(28, sampleRate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  str(36, "data"); v.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i] || 0));
    v.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return buffer;
}

function decodeAudio(ctx, arrayBuffer) {
  return new Promise((resolve, reject) => {
    try {
      const p = ctx.decodeAudioData(arrayBuffer, resolve, reject);
      if (p && typeof p.then === "function") p.then(resolve, reject);
    } catch (e) {
      reject(e);
    }
  });
}

function resampleMonoFallback(decoded, targetRate = 16000) {
  const channels = decoded.numberOfChannels || 1;
  const srcRate = decoded.sampleRate || targetRate;
  const srcLen = decoded.length || 0;
  const outLen = Math.max(1, Math.round((srcLen * targetRate) / srcRate));
  const out = new Float32Array(outLen);
  const data = Array.from({ length: channels }, (_, c) => decoded.getChannelData(c));
  const ratio = srcRate / targetRate;
  for (let i = 0; i < outLen; i++) {
    const pos = i * ratio;
    const idx = Math.floor(pos);
    const frac = pos - idx;
    const next = Math.min(idx + 1, srcLen - 1);
    let sum = 0;
    for (let c = 0; c < channels; c++) {
      const a = data[c][idx] || 0;
      const b = data[c][next] || a;
      sum += a + (b - a) * frac;
    }
    out[i] = sum / channels;
  }
  return out;
}

export async function toWav16k(blob) {
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) throw new Error("This browser cannot process audio recordings.");
  const ctx = new Ctx();
  let decoded;
  try {
    decoded = await decodeAudio(ctx, await blob.arrayBuffer());
  } finally {
    try { ctx.close?.()?.catch?.(() => {}); } catch {}
  }
  const frames = Math.max(1, Math.ceil(decoded.duration * 16000));
  const OffCtx = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  if (OffCtx) {
    try {
      const off = new OffCtx(1, frames, 16000);
      const src = off.createBufferSource();
      src.buffer = decoded;
      src.connect(off.destination);
      src.start();
      const rendered = await new Promise((resolve, reject) => {
        off.oncomplete = (e) => resolve(e.renderedBuffer);
        const p = off.startRendering();
        if (p && typeof p.then === "function") p.then(resolve, reject);
      });
      return { wav: encodeWav(rendered.getChannelData(0), 16000), seconds: decoded.duration };
    } catch {
      // Fallback for older Safari / WebViews where OfflineAudioContext rejects 16000 Hz
    }
  }
  return { wav: encodeWav(resampleMonoFallback(decoded, 16000), 16000), seconds: decoded.duration };
}

export function toBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x4000) s += String.fromCharCode(...bytes.subarray(i, i + 0x4000));
  return btoa(s);
}
