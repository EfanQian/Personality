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

  const responseText = responses
    .map((r) => `Q: ${r.text}\nA: ${r.choice}`)
    .join("\n\n");

  const systemPrompt = `You are the host of a party game called "Guess the Personality."
You have a player's quiz answers. Create a fun, engaging personality profile.

Return ONLY valid JSON matching this exact schema:
{
  "nickname": "A creative title like 'The Quiet Strategist' or 'Chaos Incarnate (Organized Edition)'",
  "traits": ["trait 1", "trait 2", "trait 3", "trait 4"],
  "groupRole": "Their role in any friend group (1-2 sentences)",
  "characterVibe": "An archetype description with NO copyrighted character names.",
  "description": "2-3 funny, revealing sentences starting with 'This person...'",
  "hints": ["A subtle behavioral hint", "Another clue about their habits"]
}`;

  try {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "meta-llama/llama-3.3-70b-instruct:free",
        max_tokens: 1024,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `Quiz answers:\n\n${responseText}\n\nGenerate their personality profile.` },
        ],
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error?.message || `OpenRouter error: ${response.status}`);
    }

    const text = data.choices?.[0]?.message?.content;
    if (!text) throw new Error("No response from model");

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("Model did not return valid JSON");

    const profile = JSON.parse(jsonMatch[0]);
    res.json({ profile });
  } catch (err) {
    console.error("Analysis error:", err.message);
    res.status(500).json({ error: "Analysis failed: " + err.message });
  }
};
