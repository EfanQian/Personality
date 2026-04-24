const { getFreeModels } = require("./_models");

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

function extractContent(rawText) {
  let parsedJson = null;
  try { parsedJson = JSON.parse(rawText); } catch (_) { /* fall through */ }

  if (parsedJson !== null) {
    if (parsedJson.error) throw new Error("OpenRouter: " + (parsedJson.error.message || parsedJson.error.code || "error"));
    const content = parsedJson.choices?.[0]?.message?.content;
    if (content) return content;
  }

  // Manual extraction from malformed/truncated JSON
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

async function callModel(apiKey, answers, model) {
  const seed = Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10);

  const userMsg =
    "Session: " + seed + "\n\n" +
    "A person just answered these personality questions in a game:\n\n" +
    answers + "\n\n" +
    "Write a single paragraph (5-6 sentences, around 80-100 words) describing what type of person they are. " +
    "Start with 'You are...' and write in second person throughout. " +
    "Be warm, specific to their actual answers, a little playful, and genuinely insightful. " +
    "Capture their core personality — how they think, how they relate to others, and what makes them unique.";

  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      max_tokens: 300,
      temperature: 0.95,
      messages: [
        {
          role: "system",
          content: "You are a sharp, insightful writer for a personality game. Based on the quiz answers given, write a specific and engaging personality summary paragraph. Never use placeholder text. Be warm, a little playful, and always grounded in the actual answers provided."
        },
        { role: "user", content: userMsg }
      ],
    }),
  });

  return await response.text();
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

  const answers = responses.map((r, i) => `${i + 1}. Q: ${r.text}\n   A: ${r.choice}`).join("\n\n");

  try {
    let summary = null;
    const models = await getFreeModels(apiKey);

    for (const model of models) {
      let rawText;
      try {
        rawText = await callModel(apiKey, answers, model);
      } catch (fetchErr) {
        console.warn(`[analyze] model ${model} fetch error:`, fetchErr.message);
        continue;
      }

      let rateLimitCheck;
      try { rateLimitCheck = JSON.parse(rawText); } catch (_) { rateLimitCheck = null; }
      if (rateLimitCheck?.error?.code === 429) {
        throw new Error(rateLimitCheck.error.message || "Daily free request limit reached. Add credits at openrouter.ai or try again tomorrow.");
      }

      let content;
      try {
        content = extractContent(rawText);
      } catch (extractErr) {
        throw extractErr;
      }

      if (content && content.trim().length > 40) {
        summary = content.trim();
        break;
      }
      console.warn(`[analyze] model ${model}: empty or too-short content`);
    }

    if (!summary) throw new Error("All models produced unusable output");

    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ summary }));
  } catch (err) {
    console.error("Analysis error:", err.message);
    res.status(500).json({ error: "Analysis failed: " + err.message });
  }
};
