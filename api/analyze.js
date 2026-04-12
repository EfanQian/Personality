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

// Attempt to close truncated JSON so it can be parsed
function repairJson(str) {
  // Remove trailing comma before closing
  str = str.replace(/,\s*$/, "");

  // Close any unclosed string (odd number of unescaped quotes)
  let inString = false;
  let escaped = false;
  for (let i = 0; i < str.length; i++) {
    if (escaped) { escaped = false; continue; }
    if (str[i] === "\\") { escaped = true; continue; }
    if (str[i] === '"') inString = !inString;
  }
  if (inString) str += '"';

  // Close open arrays and objects
  const stack = [];
  inString = false; escaped = false;
  for (let i = 0; i < str.length; i++) {
    if (escaped) { escaped = false; continue; }
    if (str[i] === "\\") { escaped = true; continue; }
    if (str[i] === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (str[i] === "{") stack.push("}");
    else if (str[i] === "[") stack.push("]");
    else if (str[i] === "}" || str[i] === "]") stack.pop();
  }
  str += stack.reverse().join("");
  return str;
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

  const prompt = `Party game. Quiz answers: ${answers}

Reply with ONLY this JSON, nothing else:
{"nickname":"funny title","traits":["a","b","c"],"groupRole":"1 sentence","characterVibe":"archetype","description":"This person... 1 sentence.","hints":["hint1","hint2"]}`;

  try {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "liquid/lfm-2.5-1.2b-instruct:free",
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

    const cleaned = text.replace(/```json\s*/gi, "").replace(/```\s*/gi, "").trim();

    // Extract JSON object
    const start = cleaned.indexOf("{");
    if (start === -1) throw new Error("Model did not return JSON. Got: " + cleaned.slice(0, 200));
    let jsonStr = cleaned.slice(start);

    // Try to parse, then try to repair if truncated
    let profile;
    try {
      profile = JSON.parse(jsonStr);
    } catch (e) {
      const repaired = repairJson(jsonStr);
      try {
        profile = JSON.parse(repaired);
      } catch (e2) {
        throw new Error("Could not parse model response. Got: " + jsonStr.slice(0, 200));
      }
    }

    res.json({ profile });
  } catch (err) {
    console.error("Analysis error:", err.message);
    res.status(500).json({ error: "Analysis failed: " + err.message });
  }
};
