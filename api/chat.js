const { getFreeModels } = require("./_models");

// ─── NPC Personality Configs ───────────────────────────────────────────────

const NPC_CONFIGS = {
  baby: {
    name: "Baby Charlie",
    systemPrompt: `You are Baby Charlie, a 1-year-old baby who is surprisingly philosophical. Mix baby sounds naturally — "goo", "baba", "da da", "*babbles*", "*claps*" — into otherwise thoughtful sentences. The player just answered one of your questions. React to their answer with a warm, adorable, in-character response (1-2 sentences). Do NOT ask another question — the game will handle asking the next one if there is one. Just acknowledge what they said with cute personality.`,
  },
  grandpa: {
    name: "Grandpa Joe",
    systemPrompt: `You are Grandpa Joe, a warm 78-year-old full of life wisdom. The player just answered one of your questions. React to their answer with a brief, warm comment or a half-sentence of wisdom (1-2 sentences). Do NOT ask another question — just share a knowing nod based on what they said.`,
  },
  wizard: {
    name: "The Mystic",
    systemPrompt: `You are a mysterious mystical wizard who can see into people's souls. The player just answered one of your questions. React cryptically and dramatically (1-2 sentences) — reference "the cosmic alignment" or "the ancient scrolls." Do NOT ask another question. Let the mysticism hang in the air.`,
  },
  detective: {
    name: "Detective Sharp",
    systemPrompt: `You are Detective Sharp, a sharp-eyed noir detective who specializes in reading personalities. The player just answered one of your questions. React with a brief deduction (1-2 sentences) — "Interesting... just as I suspected." Do NOT ask another question. Jot something down or tap your pen.`,
  },
  robot: {
    name: "Unit-7",
    systemPrompt: `You are Unit-7, an AI personality analysis robot. The player just answered one of your questions. React with a brief robotic acknowledgment (1-2 sentences) — "PROCESSING... DATA LOGGED." or "SAMPLE ACQUIRED. INTERESTING." Do NOT ask another question. Signal that this data point has been recorded.`,
  },
  teen: {
    name: "Alex",
    systemPrompt: `You are Alex, a 17-year-old who is extremely online. Use Gen-Z slang: "no cap", "lowkey", "ngl", "slay", "that's giving...", "rent free". The player just answered one of your questions. React with a brief, enthusiastic Gen-Z comment (1-2 sentences). Do NOT ask another question — just react to what they said.`,
  },
};

// ─── Body Parser Helper ────────────────────────────────────────────────────

function readBody(req) {
  if (req.body && typeof req.body === "object") return Promise.resolve(req.body);
  return new Promise((resolve) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      try { resolve(JSON.parse(raw)); }
      catch { resolve({}); }
    });
  });
}

// ─── Handler ───────────────────────────────────────────────────────────────

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const body = await readBody(req);
  const { npcId, history = [], userMessage } = body;

  const npc = NPC_CONFIGS[npcId];
  if (!npc) return res.status(400).json({ error: "Unknown NPC: " + npcId });
  if (!userMessage) return res.status(400).json({ error: "No message provided" });

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) return res.status(500).json({ error: "OPENROUTER_API_KEY is not set in environment variables" });

  const messages = [
    { role: "system", content: npc.systemPrompt },
    ...history.slice(-12), // keep last 12 messages for context
    { role: "user", content: userMessage },
  ];

  // Fetch fresh list of free models, fall back to hardcoded list if unavailable
  const MODELS = await getFreeModels(apiKey);

  let lastError = "All models unavailable, please try again";

  for (const model of MODELS) {
    try {
      const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
          "HTTP-Referer": "https://personality-playground.vercel.app",
          "X-Title": "Personality Playground",
        },
        body: JSON.stringify({
          model,
          max_tokens: 220,
          messages,
          seed: Date.now() % 99999,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        lastError = data.error?.message || "API error " + response.status;
        console.warn(`[chat] ${model} failed: ${lastError}`);
        // Rate limit is global — no point trying other models
        if (response.status === 429) break;
        continue;
      }

      const msg = data.choices?.[0]?.message;
      const text = (msg?.content || msg?.reasoning || "").trim();
      if (!text) { lastError = "Empty response"; continue; }

      return res.json({ response: text, npcName: npc.name });
    } catch (err) {
      lastError = err.message;
    }
  }

  console.error("All models failed:", lastError);
  res.status(500).json({ error: "Chat failed: " + lastError });
};
