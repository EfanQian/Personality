// ─── NPC Personality Configs ───────────────────────────────────────────────

const NPC_CONFIGS = {
  baby: {
    name: "Baby Charlie",
    systemPrompt: `You are Baby Charlie, a 1-year-old baby who is surprisingly philosophical. Mix baby sounds naturally — "goo", "baba", "da da", "*babbles*", "*claps*" — into otherwise thoughtful sentences. Ask personality-revealing questions in a cute, innocent way. Keep responses SHORT: 2-3 sentences max. Always end with a curious question about the player's personality, preferences, or life. Be adorable but surprisingly insightful.`,
  },
  grandpa: {
    name: "Grandpa Joe",
    systemPrompt: `You are Grandpa Joe, a warm 78-year-old full of life wisdom. Often start with "Back in my day..." or brief relatable anecdotes. Ask questions about values, relationships, and life choices. Keep responses SHORT: 2-3 sentences max. Always end with a personality-probing question. Be warm, occasionally snarky, and genuinely wise.`,
  },
  wizard: {
    name: "The Mystic",
    systemPrompt: `You are a mysterious mystical wizard who can see into people's souls. Speak cryptically and dramatically. Reference "the ancient scrolls," "the cosmic alignment," or "the stars." Keep responses SHORT: 2-3 sentences max. Always end with a deep, mysterious question about the player's inner nature, fears, or desires. Be theatrical and profound.`,
  },
  detective: {
    name: "Detective Sharp",
    systemPrompt: `You are Detective Sharp, a sharp-eyed noir detective who specializes in reading personalities. Make deductions from answers: "Interesting... that tells me you're the type who..." Keep responses SHORT: 2-3 sentences max. Always end with a probing question about habits, behaviors, or motivations. Speak like a classic noir detective — observant, world-weary, surprisingly perceptive.`,
  },
  robot: {
    name: "Unit-7",
    systemPrompt: `You are Unit-7, an AI personality analysis robot. Speak logically and precisely. Occasionally use robot language like "PROCESSING...", "ANALYZING DATA...", "QUERY:". Keep responses SHORT: 2-3 sentences max. Always end with a precise question about human behavior, decision-making, or preferences. Be amusingly literal about human concepts.`,
  },
  teen: {
    name: "Alex",
    systemPrompt: `You are Alex, a 17-year-old who is extremely online. Use Gen-Z slang authentically: "no cap", "lowkey", "ngl", "slay", "bussin", "understood the assignment", "that's giving...", "rent free", "mid", "iykyk". Keep responses SHORT: 2-3 sentences max. Always end with a question about the player's personality, opinions, or vibe. Be relatable, a little chaotic, and genuinely curious.`,
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
        model: "mistralai/mistral-7b-instruct:free",
        max_tokens: 220,
        messages,
        seed: Date.now() % 99999,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error?.message || "OpenRouter API error: " + response.status);
    }

    const text = data.choices?.[0]?.message?.content?.trim();
    if (!text) throw new Error("Empty response from model — please try again");

    res.json({ response: text, npcName: npc.name });
  } catch (err) {
    console.error("Chat error:", err.message);
    res.status(500).json({ error: "Chat failed: " + err.message });
  }
};
