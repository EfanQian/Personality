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

  const answers = responses.map((r) => `Q: ${r.text} / A: ${r.choice}`).join(" | ");

  const prompt = `Party game: guess the personality. Quiz answers: ${answers}

Reply with ONLY a JSON object, no markdown, no explanation:
{"nickname":"funny title","traits":["trait1","trait2","trait3"],"groupRole":"their role in 1 sentence","characterVibe":"one archetype word or phrase","description":"This person... one funny sentence.","hints":["hint1","hint2"]}`;

  try {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "liquid/lfm-2.5-1.2b-instruct:free",
        max_tokens: 600,
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

    const cleaned = text.replace(/```json\s*/gi, "").replace(/```\s*/gi, "").trim();
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("Model did not return JSON. Got: " + cleaned.slice(0, 200));

    const profile = JSON.parse(jsonMatch[0]);
    res.json({ profile });
  } catch (err) {
    console.error("Analysis error:", err.message);
    res.status(500).json({ error: "Analysis failed: " + err.message });
  }
};
