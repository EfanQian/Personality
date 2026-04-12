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
  try {
    const d = JSON.parse(rawText);
    if (d.error) throw new Error("OpenRouter: " + (d.error.message || d.error.code || "error"));
    return d.choices?.[0]?.message?.content || null;
  } catch (e) {
    if (!(e instanceof SyntaxError)) throw e;
  }
  // Manually extract content field from malformed JSON
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
  const bad = ["funny title","placeholder","[","your answer","fill in","example","nickname here","trait here","human crash","crash test","dummy"];
  const nick = (profile.nickname || "").toLowerCase();
  return !profile.nickname || bad.some(b => nick.includes(b));
}

async function callModel(apiKey, answers, attempt) {
  // Unique seed per call to prevent OpenRouter response caching
  const seed = Date.now() + "-" + Math.random().toString(36).slice(2, 8);

  const systemPrompt =
    "You are a sharp, witty writer who creates one-of-a-kind personality profiles for a party game. " +
    "You analyze quiz answers carefully and write a profile that is SPECIFIC to those answers — not generic. " +
    "The NICKNAME must be a clever, funny, specific phrase based on what the person actually answered. " +
    "NEVER write placeholder text. NEVER copy from examples. Every field must reflect the actual quiz answers. " +
    "Respond ONLY with the profile in the exact format requested. [ref:" + seed + "]";

  const userMsg =
    "Here are the quiz answers from one player. Read them carefully:\n\n" +
    answers +
    "\n\n" +
    "Write a personality profile for this specific person. Use this exact format:\n\n" +
    "NICKNAME: [A clever, funny 3-6 word title that reflects their specific answers — e.g. 'The Accidental Chaos Architect' or 'The One Who Planned This Six Months Ago']\n" +
    "TRAITS: [5 traits separated by commas, based on their actual answers]\n" +
    "ROLE: [Their specific dynamic in a group, one sentence]\n" +
    "VIBE: [2-4 words capturing their energy]\n" +
    "ABOUT: [2-3 sentences describing them based on their answers. Be specific and funny.]\n" +
    "DEEPDIVE: [3-4 sentences going deeper — what drives them, how they actually operate, what people miss about them at first]\n" +
    "SUPERPOWER: [One specific ability this person has, based on their answers]\n" +
    "WEAKNESS: [One specific flaw, based on their answers]\n" +
    "MOTTO: [A short phrase they would actually say]\n" +
    "HINT1: [A specific clue about their behavior — one sentence]\n" +
    "HINT2: [Another specific clue — one sentence]\n" +
    "HINT3: [A third specific clue — one sentence]\n\n" +
    (attempt > 1
      ? "IMPORTANT: Make the NICKNAME extremely creative and specific. It must not be generic.\n\n"
      : "") +
    "Write the profile now:";

  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "google/gemma-4-31b-it:free",
      max_tokens: 2000,
      temperature: attempt > 1 ? 1.2 : 1.0,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user",   content: userMsg },
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

    for (let attempt = 1; attempt <= 3; attempt++) {
      const rawText = await callModel(apiKey, answers, attempt);
      const content = extractContent(rawText);
      if (!content) throw new Error("No content in response. Raw: " + rawText.slice(0, 200));

      const parsed = parsePlainText(content);

      if (!isBadOutput(parsed)) {
        profile = parsed;
        break;
      }
      if (attempt === 3) profile = parsed;
    }

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
