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
  const bad = ["funny title","placeholder","[","your answer","fill in","example","nickname here","trait here"];
  const nick = (profile.nickname || "").toLowerCase();
  return !profile.nickname || bad.some(b => nick.includes(b));
}

async function callModel(apiKey, answers, attempt) {
  const exampleProfile =
    "NICKNAME: The Human Crash Test Dummy\n" +
    "TRAITS: impulsive, fearless, contagiously energetic, oddly reliable\n" +
    "ROLE: The one who suggests the bad idea that somehow becomes the best night of everyone's year\n" +
    "VIBE: Controlled Chaos\n" +
    "ABOUT: This person has seventeen stories that all start with 'I probably should not have done that but...'\n" +
    "DEEPDIVE: They move at a speed that makes everyone around them nervous and somehow still arrive at the right answer. There is no plan B because plan A always works, or at minimum produces a better story than plan B ever would have. The group runs on their energy the way a car runs on gasoline — remove it and everything stalls.\n" +
    "SUPERPOWER: Can make absolutely any situation fun within five minutes flat\n" +
    "WEAKNESS: Patience is a concept they are aware of but personally unacquainted with\n" +
    "MOTTO: Worst case we have a good story\n" +
    "HINT1: Their texts read like stream of consciousness but always somehow get to the point\n" +
    "HINT2: Shows up late to everything but always at exactly the right moment\n" +
    "HINT3: Has strong, detailed opinions about things you would never think to have opinions about";

  const userMsg =
    "A player answered these personality quiz questions:\n\n" + answers +
    "\n\nHere is an example of a good personality profile (for a DIFFERENT person):\n\n" +
    exampleProfile +
    "\n\nNow write a profile for the player above. " +
    (attempt > 1 ? "Be very creative with the nickname — make it specific and funny. " : "") +
    "Use the same format. Every field must be filled with real content based on their answers:";

  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "google/gemma-4-31b-it:free",
      max_tokens: 2000,
      temperature: attempt > 1 ? 1.1 : 0.9,
      messages: [
        {
          role: "system",
          content: "You write sharp, specific, funny personality profiles for a party game. You NEVER use placeholder text. Every field contains real creative content. You follow the format exactly."
        },
        { role: "user", content: userMsg },
        { role: "assistant", content: "NICKNAME: " }
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

    for (let attempt = 1; attempt <= 2; attempt++) {
      const rawText = await callModel(apiKey, answers, attempt);
      const content = extractContent(rawText);
      if (!content) throw new Error("No content in response. Raw: " + rawText.slice(0, 200));

      // The assistant prefix "NICKNAME: " means we need to prepend it back
      const fullText = "NICKNAME: " + content;
      const parsed = parsePlainText(fullText);

      if (!isBadOutput(parsed)) {
        profile = parsed;
        break;
      }
      // Bad output on first attempt — retry
      if (attempt === 2) profile = parsed; // use whatever we got
    }

    // Apply defaults for any missing fields
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
