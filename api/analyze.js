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
  // Strip control characters, replace double quotes with single quotes
  return s.replace(/[\x00-\x1F\x7F]/g, " ").replace(/"/g, "'").trim();
}

function parsePlainText(text) {
  // Use last match in case model echoes the example first
  const get = (key) => {
    const matches = [...text.matchAll(new RegExp("^" + key + ":\\s*(.+)", "gim"))];
    if (matches.length === 0) return "";
    return clean(matches[matches.length - 1][1]);
  };
  const traitsRaw = get("TRAITS");
  const traits = traitsRaw
    ? traitsRaw.split(/[,|]+/).map(t => t.trim()).filter(Boolean).slice(0, 5)
    : ["Adaptable", "Observant", "Genuine"];
  return {
    nickname:      get("NICKNAME")   || "The Wild Card",
    traits,
    groupRole:     get("ROLE")       || "The one who keeps things interesting",
    characterVibe: get("VIBE")       || "Unpredictable",
    description:   get("ABOUT")      || "This person is one of a kind.",
    superpower:    get("SUPERPOWER") || "",
    weakness:      get("WEAKNESS")   || "",
    motto:         get("MOTTO")      || "",
    hints:         [get("HINT1"), get("HINT2")].filter(Boolean),
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

  const prompt = `You are a witty party game host. Read these quiz answers and write a fun personality profile.

Quiz answers:
${answers}

Instructions:
- NICKNAME should be a clever, specific title like "The One Who Googles Everything" or "Emotionally Available But Only After 11pm"
- TRAITS should be 3-4 specific traits from the answers
- ABOUT must start with "This person" and be one funny, specific sentence
- Base everything on the actual answers, not generic stereotypes

Write the profile now:
NICKNAME:
TRAITS:
ROLE:
VIBE:
ABOUT:
SUPERPOWER:
WEAKNESS:
MOTTO:
HINT1:
HINT2:`;

  try {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "stepfun/step-3.5-flash:free",
        max_tokens: 500,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      const detail = data.error?.message || data.error?.code || JSON.stringify(data);
      throw new Error(`OpenRouter error ${response.status}: ${detail}`);
    }

    const rawText = data.choices?.[0]?.message?.content || "";
    const profile = parsePlainText(rawText);

    // Force a clean round-trip through JSON to guarantee valid output
    const safeStr = JSON.stringify({ profile });
    res.setHeader("Content-Type", "application/json");
    res.end(safeStr);
  } catch (err) {
    console.error("Analysis error:", err.message);
    res.status(500).json({ error: "Analysis failed: " + err.message });
  }
};
