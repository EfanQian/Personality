const { getFreeModels } = require("./_models");

async function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => (data += chunk));
    req.on("end", () => { try { resolve(JSON.parse(data)); } catch { resolve({}); } });
    req.on("error", reject);
  });
}

function extractContent(rawText) {
  let parsedJson = null;
  try { parsedJson = JSON.parse(rawText); } catch (_) {}
  if (parsedJson !== null) {
    if (parsedJson.error) throw new Error("OpenRouter: " + (parsedJson.error.message || parsedJson.error.code || "error"));
    const content = parsedJson.choices?.[0]?.message?.content;
    if (content) return content;
  }
  const idx = rawText.lastIndexOf('"content":');
  if (idx === -1) return null;
  let pos = idx + 10;
  while (pos < rawText.length && rawText[pos] !== '"') pos++;
  if (pos >= rawText.length) return null;
  pos++;
  let out = "";
  while (pos < rawText.length) {
    const ch = rawText[pos];
    if (ch === "\\") {
      const nx = rawText[pos + 1];
      if      (nx === "n")  { out += "\n"; pos += 2; }
      else if (nx === "t")  { out += "\t"; pos += 2; }
      else if (nx === '"')  { out += '"';  pos += 2; }
      else if (nx === "\\") { out += "\\"; pos += 2; }
      else                  { out += nx;   pos += 2; }
    } else if (ch === '"') { break; }
    else { out += ch; pos++; }
  }
  return out || null;
}

function parsePlainText(text) {
  const get = (key) => {
    const matches = [...text.matchAll(new RegExp("^" + key + ":\\s*(.+)", "gim"))];
    if (!matches.length) return "";
    return matches[matches.length - 1][1].trim().replace(/^["'*]+|["'*]+$/g, "").trim();
  };
  const traitsRaw = get("TRAITS");
  return {
    archetype:     get("ARCHETYPE")   || "",
    archetypeEmoji:get("EMOJI")       || "✨",
    traits:        traitsRaw ? traitsRaw.split(/[,|]+/).map(t => t.trim()).filter(Boolean).slice(0, 3) : [],
    description:   get("DESCRIPTION") || "",
    superpower:    get("SUPERPOWER")  || "",
    weakness:      get("WEAKNESS")    || "",
    groupRole:     get("ROLE")        || "",
    famousMatch:   get("MATCH")       || "",
    quote:         get("QUOTE")       || "",
  };
}

function isBadOutput(p) {
  const bad = ["placeholder", "[", "fill in", "example", "archetype here", "your answer", "generic"];
  const arc = (p.archetype || "").toLowerCase();
  return !p.archetype || bad.some(b => arc.includes(b));
}

async function callModel(apiKey, answers, attempt, model) {
  const seed = Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8);
  const userMsg =
    "Session: " + seed + "\n\n" +
    "A person answered these personality quiz questions:\n\n" + answers + "\n\n" +
    "Create their personality profile in EXACTLY this format. Be creative, specific, and base everything on their actual answers:\n\n" +
    "ARCHETYPE: [3-5 word archetype, e.g. 'The Quiet Storm' or 'The Chaotic Visionary' — make it specific to their answers]\n" +
    "EMOJI: [one perfect emoji that represents them]\n" +
    "TRAITS: [exactly 3 single-word traits, comma-separated]\n" +
    "DESCRIPTION: [2-3 specific engaging sentences starting with 'You are']\n" +
    "SUPERPOWER: [one sentence — their single greatest strength, be specific]\n" +
    "WEAKNESS: [one honest sentence — their real blind spot, be specific]\n" +
    "ROLE: [their role in any group, one punchy sentence]\n" +
    "MATCH: [a famous person or character they're like — real or fictional — with one sentence why]\n" +
    "QUOTE: [a short quote that fits them — real or invented]\n\n" +
    (attempt > 1 ? "ARCHETYPE must be very creative and unique — not generic at all.\n\n" : "") +
    "Start with ARCHETYPE:";

  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model, max_tokens: 500,
      temperature: attempt > 1 ? 1.1 : 0.95,
      messages: [
        { role: "system", content: "You are a sharp, witty personality analyst for a game. You write creative, specific personality profiles based entirely on quiz answers. Never use placeholder text. Every profile is unique to the person's actual answers." },
        { role: "user", content: userMsg }
      ],
    }),
  });
  return await response.text();
}

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) return res.status(500).json({ error: "OPENROUTER_API_KEY not set" });

  const body = await readBody(req);
  const { responses } = body;
  if (!responses || !Array.isArray(responses)) return res.status(400).json({ error: "Missing responses" });

  const answers = responses.map((r, i) => `${i + 1}. Q: ${r.text}\n   A: ${r.choice}`).join("\n\n");

  try {
    let profile = null;
    const models = await getFreeModels(apiKey);

    outerLoop:
    for (const model of models) {
      for (let attempt = 1; attempt <= 3; attempt++) {
        let rawText;
        try { rawText = await callModel(apiKey, answers, attempt, model); }
        catch (e) { console.warn(`[analyze] ${model} fetch error:`, e.message); break; }

        let rateLimitCheck;
        try { rateLimitCheck = JSON.parse(rawText); } catch (_) { rateLimitCheck = null; }
        if (rateLimitCheck?.error?.code === 429) {
          throw new Error(rateLimitCheck.error.message || "Rate limit reached. Try again tomorrow.");
        }

        let content;
        try { content = extractContent(rawText); } catch (e) { throw e; }
        if (!content) { console.warn(`[analyze] ${model} attempt ${attempt}: no content`); continue; }

        const parsed = parsePlainText(content);
        if (!isBadOutput(parsed)) { profile = parsed; break outerLoop; }
        console.warn(`[analyze] ${model} attempt ${attempt}: bad output`);
      }
    }

    if (!profile) throw new Error("All models produced unusable output");

    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({
      profile: {
        archetype:      profile.archetype      || "The Undeniable Force",
        archetypeEmoji: profile.archetypeEmoji || "✨",
        traits:         profile.traits.length  ? profile.traits : ["Unique", "Complex", "Surprising"],
        description:    profile.description    || "You defy easy categorization.",
        superpower:     profile.superpower     || "",
        weakness:       profile.weakness       || "",
        groupRole:      profile.groupRole      || "",
        famousMatch:    profile.famousMatch    || "",
        quote:          profile.quote          || "",
      }
    }));
  } catch (err) {
    console.error("Analysis error:", err.message);
    res.status(500).json({ error: "Analysis failed: " + err.message });
  }
};
