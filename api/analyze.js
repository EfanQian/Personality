const { getFreeModels } = require("./_models");

async function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => (data += chunk));
    req.on("end", () => {
      try { resolve(JSON.parse(data)); }
      catch { resolve({}); }
    });
    req.on("error", reject);
  });
}

function clean(s) {
  if (!s) return "";
  return s.replace(/[\x00-\x1F\x7F]/g, " ").replace(/"/g, "'").trim();
}

function extractContent(rawText) {
  // Try clean JSON parse first
  let parsed = null;
  try { parsed = JSON.parse(rawText); } catch (_) { /* fall through */ }

  if (parsed !== null) {
    if (parsed.error) throw new Error("OpenRouter: " + (parsed.error.message || parsed.error.code || "error"));
    const content = parsed.choices?.[0]?.message?.content;
    if (content) return content;
  }

  // Manual char-by-char extraction from malformed/truncated JSON
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
    } else if (ch === '"') {
      break;
    } else {
      out += ch; pos++;
    }
  }
  return out || null;
}

function parsePlainText(text) {
  const get = (key) => {
    const matches = [...text.matchAll(new RegExp("^" + key + ":\\s*(.+)", "gim"))];
    if (!matches.length) return "";
    return clean(matches[matches.length - 1][1]);
  };
  const traitsRaw = get("TRAITS");
  return {
    nickname:      get("NICKNAME")   || "",
    traits:        traitsRaw ? traitsRaw.split(/[,|]+/).map(t => t.trim()).filter(Boolean).slice(0, 5) : [],
    groupRole:     get("ROLE")       || "",
    characterVibe: get("VIBE")       || "",
    description:   get("ABOUT")      || "",
    deepDive:      get("DEEPDIVE")   || "",
    superpower:    get("SUPERPOWER") || "",
    weakness:      get("WEAKNESS")   || "",
    motto:         get("MOTTO")      || "",
    hints:         [get("HINT1"), get("HINT2"), get("HINT3")].filter(Boolean),
  };
}

function isBadOutput(profile) {
  const bad = ["funny title", "placeholder", "[", "your answer", "fill in", "example", "nickname here", "trait here", "human crash", "crash test", "dummy", "clever funny"];
  const nick = (profile.nickname || "").toLowerCase();
  return !profile.nickname || bad.some(b => nick.includes(b));
}

async function callModel(apiKey, answers, attempt, model) {
  const seed = Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10);

  const userMsg =
    "Session: " + seed + "\n\n" +
    "A player just answered these personality quiz questions:\n\n" +
    answers + "\n\n" +
    "Based ONLY on those specific answers, write their personality profile using this format:\n\n" +
    "NICKNAME: (a unique, funny, specific 3-6 word phrase that fits THEIR answers)\n" +
    "TRAITS: (5 comma-separated traits drawn from their actual answers)\n" +
    "ROLE: (their specific role in a friend group, one sentence)\n" +
    "VIBE: (2-4 words)\n" +
    "ABOUT: (2-3 funny, specific sentences about this person)\n" +
    "DEEPDIVE: (3-4 sentences going deeper on what makes them tick)\n" +
    "SUPERPOWER: (one specific ability they have)\n" +
    "WEAKNESS: (one specific flaw)\n" +
    "MOTTO: (a short phrase they'd actually say)\n" +
    "HINT1: (one behavioral clue about them)\n" +
    "HINT2: (another clue)\n" +
    "HINT3: (a third clue)\n\n" +
    (attempt > 1 ? "The NICKNAME must be very creative and specific to their answers — not generic at all.\n\n" : "") +
    "Start with NICKNAME:";

  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      max_tokens: 3000,
      temperature: attempt > 1 ? 1.1 : 0.95,
      messages: [
        {
          role: "system",
          content: "You are a sharp, witty writer for a party game. You write personality profiles that are specific, funny, and based entirely on the quiz answers provided. You never use placeholder text or generic descriptions. Every profile is unique to the person's actual answers."
        },
        { role: "user", content: userMsg }
      ],
    }),
  });

  const rawText = await response.text();
  return rawText;
}

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) return res.status(500).json({ error: "OPENROUTER_API_KEY is not set in environment variables" });

  const body = await readBody(req);
  const { responses } = body;
  if (!responses || !Array.isArray(responses)) return res.status(400).json({ error: "Missing responses" });

  const answers = responses.map((r) => `- ${r.text}: ${r.choice}`).join("\n");

  try {
    let profile = null;
    const models = await getFreeModels(apiKey);

    // Outer loop: try each model; inner loop: retry same model up to 3x for bad output
    outerLoop:
    for (const model of models) {
      for (let attempt = 1; attempt <= 3; attempt++) {
        let rawText;
        try {
          rawText = await callModel(apiKey, answers, attempt, model);
        } catch (fetchErr) {
          console.warn(`[analyze] model ${model} fetch error:`, fetchErr.message);
          break; // try next model
        }

        const content = extractContent(rawText);
        if (!content) {
          console.warn(`[analyze] model ${model} attempt ${attempt}: no content`);
          if (attempt === 3) break; // try next model
          continue;
        }

        const parsed = parsePlainText(content);
        if (!isBadOutput(parsed)) {
          profile = parsed;
          break outerLoop;
        }
        console.warn(`[analyze] model ${model} attempt ${attempt}: bad output`);
        if (attempt === 3) break; // try next model
      }
    }

    if (!profile) throw new Error("All models produced unusable output");

    const final = {
      nickname:      profile.nickname      || "The Undeniable Force",
      traits:        profile.traits.length  ? profile.traits : ["Unique", "Complex", "Surprising"],
      groupRole:     profile.groupRole     || "The one who changes the dynamic",
      characterVibe: profile.characterVibe || "Chaotic Good",
      description:   profile.description   || "This person defies easy categorization.",
      deepDive:      profile.deepDive      || "",
      superpower:    profile.superpower    || "",
      weakness:      profile.weakness      || "",
      motto:         profile.motto         || "",
      hints:         profile.hints,
    };

    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ profile: final }));
  } catch (err) {
    console.error("Analysis error:", err.message);
    res.status(500).json({ error: "Analysis failed: " + err.message });
  }
};
