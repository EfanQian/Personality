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
    const match = text.match(new RegExp("^" + key + ":\\s*(.+)", "im"));
    return match ? match[1].trim() : "";
  };
  const traitsRaw = get("TRAITS");
  const traits = traitsRaw ? traitsRaw.split(/[,|]+/).map(t => t.trim()).filter(Boolean) : ["Mysterious", "Unpredictable", "Unique"];
  return {
    nickname:      get("NICKNAME")   || "The Mystery",
    traits,
    groupRole:     get("ROLE")       || "The wildcard of the group",
    characterVibe: get("VIBE")       || "Enigmatic",
    description:   get("ABOUT")      || "This person defies easy categorization.",
    superpower:    get("SUPERPOWER") || "",
    weakness:      get("WEAKNESS")   || "",
    motto:         get("MOTTO")      || "",
    hints: [get("HINT1"), get("HINT2")].filter(Boolean),
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

  const prompt = `You are a witty party game host creating a personality profile from quiz answers. Be creative, specific, and funny — base everything on the actual answers given.

Quiz answers:
${answers}

Fill in this profile using the exact format below. Do not copy the examples — write something original based on the answers above.

NICKNAME: The Overthinker's Nightmare  (example — write a different original title)
TRAITS: loyal, chaotic, secretly judging everyone  (example — write traits that match the answers)
ROLE: The one who arrives late but somehow fixes everything  (example)
VIBE: Chaotic Good  (example — could be an archetype, alignment, or vibe)
ABOUT: This person has a 47-tab browser and calls it organized.  (example — write a specific funny observation)
SUPERPOWER: Can read a room better than anyone but will never admit it
WEAKNESS: Absolutely cannot make a decision without a pros and cons list
MOTTO: Why do it now when you can do it better in 10 minutes?
HINT1: Their texts are either one word or an essay, no in-between
HINT2: Has a very specific way of doing things and notices when you do it wrong`;

  try {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "nvidia/nemotron-3-nano-30b-a3b:free",
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
    res.json({ profile });
  } catch (err) {
    console.error("Analysis error:", err.message);
    res.status(500).json({ error: "Analysis failed: " + err.message });
  }
};
