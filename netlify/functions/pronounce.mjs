// Reading feedback: sends a short recording and its text to Azure Speech pronunciation assessment.
// The Azure key stays here on the server (Netlify environment variables), never in the app.
// Only signed-in Twige learners can use it (checked against Firebase).
// GET  ?health=1  -> { configured, keyValid, region }  (no secrets, no cost)
// POST { text, lang, audio } with "Authorization: Bearer <Firebase ID token>"
//      audio = base64 WAV, 16 kHz mono 16-bit, at most ~30 seconds.
import { summarise } from "../../src/pronounce-result.js";

const FIREBASE_API_KEY = "AIzaSyBhJJLVjRId79RPQGOOAixttxef-uEjsi0"; // public web key (same as src/config.js)
const LANGS = { en: "en-GB", sw: "sw-KE" };
const MAX_AUDIO_BYTES = 1_100_000; // ~34 s of 16 kHz 16-bit mono
const MAX_TEXT = 400;

const json = (status, body) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });

async function signedInUser(req) {
  const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const r = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${FIREBASE_API_KEY}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ idToken: token }),
  });
  if (!r.ok) return null;
  const data = await r.json();
  return data.users?.[0]?.localId || null;
}

export default async (req) => {
  const key = process.env.AZURE_SPEECH_KEY;
  const region = (process.env.AZURE_SPEECH_REGION || "").trim().toLowerCase();

  if (req.method === "GET") {
    if (!new URL(req.url).searchParams.has("health")) return json(404, { error: "not found" });
    if (!key || !region) return json(200, { configured: false, keyValid: false, region: region || null });
    if (!/^[a-z0-9-]+$/.test(region)) return json(200, { configured: true, keyValid: false, region, error: "Invalid region value" });
    try {
      const r = await fetch(`https://${region}.api.cognitive.microsoft.com/sts/v1.0/issueToken`, {
        method: "POST",
        headers: { "Ocp-Apim-Subscription-Key": key, "content-length": "0" },
      });
      return json(200, { configured: true, keyValid: r.ok, region, status: r.status });
    } catch (e) {
      return json(200, { configured: true, keyValid: false, region, error: e.message || "Region request failed" });
    }
  }
  if (req.method !== "POST") return json(405, { error: "method not allowed" });
  if (!key || !region) return json(503, { error: "Reading feedback is not set up yet." });

  const uid = await signedInUser(req).catch(() => null);
  if (!uid) return json(401, { error: "Please sign in to use reading feedback." });

  let body;
  try { body = await req.json(); } catch { return json(400, { error: "Bad request." }); }
  const text = String(body.text || "").trim().slice(0, MAX_TEXT);
  const language = LANGS[body.lang] || LANGS.en;
  if (!text || !body.audio) return json(400, { error: "Missing text or recording." });
  const audio = Buffer.from(String(body.audio), "base64");
  if (audio.length < 2000) return json(400, { error: "The recording is too short. Try again." });
  if (audio.length > MAX_AUDIO_BYTES) return json(413, { error: "Please read a shorter part (under 30 seconds)." });

  const settings = Buffer.from(
    JSON.stringify({ ReferenceText: text, GradingSystem: "HundredMark", Granularity: "Phoneme", Dimension: "Comprehensive", EnableMiscue: true }),
  ).toString("base64");
  const url = `https://${region}.stt.speech.microsoft.com/speech/recognition/conversation/cognitiveservices/v1?language=${language}&format=detailed`;
  if (!/^[a-z0-9-]+$/.test(region)) return json(502, { error: "Speech region configuration is invalid." });
  let r;
  try {
    r = await fetch(url, {
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
    return json(502, { error: "Could not reach the speech service. Try again in a moment." });
  }
  if (r.status === 429 || r.status === 403) return json(429, { error: "Reading feedback has reached its free limit for now. Try again later." });
  if (!r.ok) return json(502, { error: "The speech service did not answer. Try again in a moment.", status: r.status });
  const result = await r.json();
  return json(200, summarise(result, text));
};

export const config = { path: "/api/pronounce" };
