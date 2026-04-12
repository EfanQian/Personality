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

function parsePlainText(text) {
  const get = (key) => {
    const match = text.match(new RegExp(key + ":\\s*(.+)", "i"));
    return match ? match[1].trim() : "";
  };
  const traitsRaw = get("TRAITS");
  const traits = traitsRaw ? traitsRaw.split(/[,|]+/).map(t => t.trim()).filter(Boolean) : ["Mysterious", "Unpredictable", "Unique"];
  return {
    nickname:      get("NICKNAME") || "The Mystery",
    traits,
    groupRole:     get("ROLE")     || "The wildcard of the group",
    characterVibe: get("VIBE")     || "Enigmatic",
    description:   get("ABOUT")   || "This person defies easy categorization.",
    hints: [
      get("HINT1") || "Hard to pin down",
      get("HINT2") || "Full of surprises",
    ].filter(Boolean),
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

  const prompt = `You are a fun party game host. Based on these quiz answers, create a personality profile.

Quiz answers:
${answers}

Reply using EXACTLY this format with no extra text:
NICKNAME: [a funny creative title]
TRAITS: [trait1, trait2, trait3]
ROLE: [their role in a group in one sentence]
VIBE: [one archetype word or short phrase]
ABOUT: [one funny sentence starting with "This person"]
HINT1: [a subtle clue about this person]
HINT2: [another clue about their habits]`;

  try {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "nvidia/nemotron-3-nano-30b-a3b:free",
        max_tokens: 400,
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
    res.json({ profile });
  } catch (err) {
    console.error("Analysis error:", err.message);
    res.status(500).json({ error: "Analysis failed: " + err.message });
  }
};
