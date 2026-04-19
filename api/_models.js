// Fetches the live list of free models from OpenRouter and caches it for 5 minutes.
// Falls back to a hardcoded list if the request fails.

const FALLBACK_FREE_MODELS = [
  "google/gemma-3n-e4b-it:free",
  "google/gemma-3-4b-it:free",
  "meta-llama/llama-4-scout:free",
  "meta-llama/llama-4-maverick:free",
  "openai/gpt-oss-20b:free",
  "openai/gpt-oss-120b:free",
];

let _cache = null;
let _cacheAt = 0;
const TTL = 5 * 60 * 1000; // 5 minutes

async function getFreeModels(apiKey) {
  if (_cache && Date.now() - _cacheAt < TTL) return _cache;

  try {
    const res = await fetch("https://openrouter.ai/api/v1/models", {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!res.ok) throw new Error("Status " + res.status);

    const { data } = await res.json();
    const free = (data || [])
      .filter((m) => m.id.endsWith(":free"))
      .map((m) => m.id);

    if (free.length) {
      _cache = free;
      _cacheAt = Date.now();
      console.log(`[models] fetched ${free.length} free models from OpenRouter`);
      return free;
    }
  } catch (e) {
    console.warn("[models] fetch failed, using fallback list:", e.message);
  }

  return FALLBACK_FREE_MODELS;
}

module.exports = { getFreeModels };
