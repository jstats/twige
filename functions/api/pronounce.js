// Cloudflare Pages Function: same reading-feedback server step as netlify/functions/pronounce.mjs.
// Secrets come from Cloudflare project settings (AZURE_SPEECH_KEY, AZURE_SPEECH_REGION), never from code.
import { summarise } from "../../src/pronounce-result.js";

const FIREBASE_API_KEY = "AIzaSyBhJJLVjRId79RPQGOOAixttxef-uEjsi0"; // public web key (same as src/config.js)
const LANGS = { en: "en-GB", sw: "sw-KE" };
const MAX_AUDIO_BYTES = 1_100_000;
const MAX_TEXT = 400;
const json = (status, body) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });

function fromBase64(b64) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
const toBase64 = (str) => btoa(unescape(encodeURIComponent(str)));

async function signedInUser(request) {
  const token = (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const r = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${FIREBASE_API_KEY}`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ idToken: token }),
  });
  if (!r.ok) return null;
  return (await r.json()).users?.[0]?.localId || null;
}

export async function onRequest({ request, env }) {
  const key = env.AZURE_SPEECH_KEY;
  const region = String(env.AZURE_SPEECH_REGION || "").trim().toLowerCase();
  const regionOk = /^[a-z0-9]+$/.test(region);

  if (request.method === "GET") {
    if (!new URL(request.url).searchParams.has("health")) return json(404, { error: "not found" });
    if (!key || !regionOk) return json(200, { configured: false, keyValid: false, region: region || null });
    try {
      const r = await fetch(`https://${region}.api.cognitive.microsoft.com/sts/v1.0/issueToken`, {
        method: "POST", headers: { "Ocp-Apim-Subscription-Key": key, "content-length": "0" },
      });
      return json(200, { configured: true, keyValid: r.ok, region, status: r.status });
    } catch {
      return json(200, { configured: true, keyValid: false, region, error: "region unreachable" });
    }
  }
  if (request.method !== "POST") return json(405, { error: "method not allowed" });
  if (!key || !regionOk) return json(503, { error: "Reading feedback is not set up yet." });

  const uid = await signedInUser(request).catch(() => null);
  if (!uid) return json(401, { error: "Please sign in to use reading feedback." });

  let body;
  try { body = await request.json(); } catch { return json(400, { error: "Bad request." }); }
  const text = String(body.text || "").trim().slice(0, MAX_TEXT);
  const language = LANGS[body.lang] || LANGS.en;
  if (!text || !body.audio) return json(400, { error: "Missing text or recording." });
  let audio;
  try { audio = fromBase64(String(body.audio)); } catch { return json(400, { error: "Bad recording." }); }
  if (audio.length < 2000) return json(400, { error: "The recording is too short. Try again." });
  if (audio.length > MAX_AUDIO_BYTES) return json(413, { error: "Please read a shorter part (under 30 seconds)." });

  const settings = toBase64(JSON.stringify({ ReferenceText: text, GradingSystem: "HundredMark", Granularity: "Phoneme", Dimension: "Comprehensive", EnableMiscue: true }));
  let r;
  try {
    r = await fetch(`https://${region}.stt.speech.microsoft.com/speech/recognition/conversation/cognitiveservices/v1?language=${language}&format=detailed`, {
      method: "POST",
      headers: {
        "Ocp-Apim-Subscription-Key": key,
        "Content-Type": "audio/wav; codecs=audio/pcm; samplerate=16000",
        "Pronunciation-Assessment": settings,
        Accept: "application/json",
      },
      body: audio,
    });
  } catch {
    return json(502, { error: "The speech service did not answer. Try again in a moment." });
  }
  if (r.status === 429 || r.status === 403) return json(429, { error: "Reading feedback has reached its free limit for now. Try again later." });
  if (!r.ok) return json(502, { error: "The speech service did not answer. Try again in a moment.", status: r.status });
  return json(200, summarise(await r.json(), text));
}
