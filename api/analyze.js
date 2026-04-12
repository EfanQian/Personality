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

// Manually extract "content" value from a potentially malformed JSON response
function extractContent(rawText) {
  try {
    const d = JSON.parse(rawText);
    if (d.error) {
      const msg = d.error.message || d.error.code || JSON.stringify(d.error);
      throw new Error("OpenRouter: " + msg);
    }
    return d.choices?.[0]?.message?.content || null;
  } catch (e) {
    if (!(e instanceof SyntaxError)) throw e; // re-throw provider errors
  }

  // Manual char-by-char extraction from malformed JSON
  const marker = '"content":';
  const idx = rawText.lastIndexOf(marker);
  if (idx === -1) return null;

  let pos = idx + marker.length;
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

// Try JSON parse first, then fall back to plain-text key: value parsing
function parseModelText(text) {
  if (!text) return null;

  // Attempt JSON parse (strip markdown code fences first)
  const stripped = text.replace(/```json\s*/gi, "").replace(/```\s*/gi, "").trim();
  const jsonStart = stripped.indexOf("{");
  if (jsonStart !== -1) {
    try {
      const obj = JSON.parse(stripped.slice(jsonStart));
      if (obj.nickname || obj.traits) return normalizeJson(obj);
    } catch (_) {}
  }

  // Fall back to KEY: value line parsing
  const get = (key) => {
    const matches = [...text.matchAll(new RegExp("^" + key + ":\\s*(.+)", "gim"))];
    if (matches.length === 0) return "";
    return clean(matches[matches.length - 1][1]);
  };
  const traitsRaw = get("TRAITS");
  const traits = traitsRaw
    ? traitsRaw.split(/[,|]+/).map(t => t.trim()).filter(Boolean).slice(0, 5)
    : null;

  return {
    nickname:      get("NICKNAME")    || null,
    traits:        traits,
    groupRole:     get("ROLE")        || null,
    characterVibe: get("VIBE")        || null,
    description:   get("ABOUT")       || null,
    deepDive:      get("DEEPDIVE")    || null,
    superpower:    get("SUPERPOWER")  || null,
    weakness:      get("WEAKNESS")    || null,
    motto:         get("MOTTO")       || null,
    hints:         [get("HINT1"), get("HINT2"), get("HINT3")].filter(Boolean),
  };
}

function normalizeJson(obj) {
  return {
    nickname:      clean(obj.nickname)      || null,
    traits:        Array.isArray(obj.traits) ? obj.traits.map(clean).filter(Boolean) : null,
    groupRole:     clean(obj.groupRole || obj.group_role || obj.role) || null,
    characterVibe: clean(obj.characterVibe || obj.vibe)               || null,
    description:   clean(obj.description || obj.about)                || null,
    deepDive:      clean(obj.deepDive || obj.deep_dive || obj.detail)  || null,
    superpower:    clean(obj.superpower)    || null,
    weakness:      clean(obj.weakness)      || null,
    motto:         clean(obj.motto)         || null,
    hints:         Array.isArray(obj.hints) ? obj.hints.map(clean).filter(Boolean) : [],
  };
}

function buildProfile(raw) {
  return {
    nickname:      raw.nickname      || "The Wild Card",
    traits:        (raw.traits && raw.traits.length) ? raw.traits : ["Adaptable", "Observant", "Genuine"],
    groupRole:     raw.groupRole     || "The one who keeps things interesting",
    characterVibe: raw.characterVibe || "Unpredictable",
    description:   raw.description   || "This person is one of a kind.",
    deepDive:      raw.deepDive      || "",
    superpower:    raw.superpower    || "",
    weakness:      raw.weakness      || "",
    motto:         raw.motto         || "",
    hints:         raw.hints         || [],
  };
}

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "OPENROUTER_API_KEY is not set in environment variables" });
  }

  const body = await readBody(req);
  const { responses } = body;
  if (!responses || !Array.isArray(responses)) {
    return res.status(400).json({ error: "Missing responses" });
  }

  const answers = responses.map((r) => `- ${r.text}: ${r.choice}`).join("\n");

  const prompt = `You are a witty party game host. Read these quiz answers and write a personality profile.

Quiz answers:
${answers}

Write the profile by filling in each line. Base every answer on the actual quiz responses above — be specific and creative, not generic.

NICKNAME: The One Who Arrives 10 Minutes Early to Check the Vibe
TRAITS: strategic, empathetic, quietly intense, always prepared
ROLE: The emotional anchor who also somehow fixes the WiFi when it breaks
VIBE: Benevolent Chaos Manager
ABOUT: This person has a plan B before most people have formed a plan A.
DEEPDIVE: They hold groups together with invisible effort that only becomes obvious when they are gone. Calm in crisis, organized in chaos, and somehow always aware of what everyone needs before they ask. The amount of mental load they carry quietly would surprise most people who know them.
SUPERPOWER: Can de-escalate any situation with exactly the right words at exactly the right time
WEAKNESS: Takes on other people's stress as a personal hobby and calls it caring
MOTTO: I have already thought about this
HINT1: Always has exactly what you need in their bag without being asked
HINT2: Knows everyone's coffee order after one meeting
HINT3: Their texts are short but land perfectly every single time

Now write a completely NEW profile for the quiz answers above. Use the same format but different content:

NICKNAME:
TRAITS:
ROLE:
VIBE:
ABOUT:
DEEPDIVE:
SUPERPOWER:
WEAKNESS:
MOTTO:
HINT1:
HINT2:
HINT3:`;

  try {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "arcee-ai/trinity-large-preview:free",
        max_tokens: 600,
        temperature: 0.9,
        messages: [
          {
            role: "system",
            content: "You are a creative, witty personality profiler. Complete the profile fields based on the quiz answers. Never copy the example — write something original. Never leave a field blank or use placeholder text."
          },
          { role: "user", content: prompt }
        ],
      }),
    });

    const rawText = await response.text();
    const modelText = extractContent(rawText);
    if (!modelText) throw new Error("No content in response. Raw: " + rawText.slice(0, 200));

    const raw = parseModelText(modelText);
    const profile = buildProfile(raw);

    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ profile }));
  } catch (err) {
    console.error("Analysis error:", err.message);
    res.status(500).json({ error: "Analysis failed: " + err.message });
  }
};
