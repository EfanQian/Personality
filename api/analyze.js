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

function parsePlainText(text) {
  const get = (key) => {
    const match = text.match(new RegExp("^" + key + ":\\s*(.+)", "im"));
    return match ? clean(match[1]) : "";
  };
  const traitsRaw = get("TRAITS");
  const traits = traitsRaw
    ? traitsRaw.split(/[,|]+/).map(t => t.trim()).filter(Boolean).slice(0, 5)
    : ["Mysterious", "Unpredictable", "Unique"];
  return {
    nickname:      get("NICKNAME")   || "The Enigma",
    traits,
    groupRole:     get("ROLE")       || "The wildcard of the group",
    characterVibe: get("VIBE")       || "Enigmatic",
    description:   get("ABOUT")      || "This person defies easy categorization.",
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

  const prompt = `You are hosting a party game. A player just answered these personality quiz questions:

${answers}

Write their personality profile. Each line must start with the label exactly as shown.

NICKNAME: The Chaos Gremlin With a Color-Coded Planner
TRAITS: impulsive, detail-obsessed, secretly soft
ROLE: The one who texts 3am memes but shows up on time to everything
VIBE: Chaotic Neutral with a Pinterest board
ABOUT: This person will reorganize your entire kitchen and call it relaxing.
SUPERPOWER: Reads the energy in any room within 30 seconds flat
WEAKNESS: Cannot resist starting a new project before finishing the last one
MOTTO: It'll make sense eventually
HINT1: Their phone battery is always at exactly 12%
HINT2: Has a strong opinion about how to load a dishwasher

Now write a completely different profile that matches the quiz answers above. Use the same line format:

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
        model: "nvidia/nemotron-3-super-120b-a12b:free",
        max_tokens: 500,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      const detail = data.error?.message || data.error?.code || JSON.stringify(data);
      throw new Error(`OpenRouter error ${response.status}: ${detail}`);
    }

    const text = data.choices?.[0]?.message?.content;
    if (!text) throw new Error("No response from model");

    const profile = parsePlainText(text);

    // Ensure the response is always valid JSON-safe
    const safeProfile = JSON.parse(JSON.stringify(profile));
    res.json({ profile: safeProfile });
  } catch (err) {
    console.error("Analysis error:", err.message);
    res.status(500).json({ error: "Analysis failed: " + err.message });
  }
};
