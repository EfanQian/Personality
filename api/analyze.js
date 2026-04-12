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
    const matches = [...text.matchAll(new RegExp("^" + key + ":\\s*(.+)", "gim"))];
    if (matches.length === 0) return "";
    return clean(matches[matches.length - 1][1]);
  };
  const traitsRaw = get("TRAITS");
  const traits = traitsRaw
    ? traitsRaw.split(/[,|]+/).map(t => t.trim()).filter(Boolean).slice(0, 5)
    : ["Adaptable", "Observant", "Genuine"];
  return {
    nickname:      get("NICKNAME")    || "The Wild Card",
    traits,
    groupRole:     get("ROLE")        || "The one who keeps things interesting",
    characterVibe: get("VIBE")        || "Unpredictable",
    description:   get("ABOUT")       || "This person is one of a kind.",
    deepDive:      get("DEEPDIVE")    || "",
    superpower:    get("SUPERPOWER")  || "",
    weakness:      get("WEAKNESS")    || "",
    motto:         get("MOTTO")       || "",
    hints:         [get("HINT1"), get("HINT2"), get("HINT3")].filter(Boolean),
  };
}

const EXAMPLE_ANSWERS = `- What energizes you most: Solving a hard problem alone
- In a group project you are: The one quietly doing 80% of the work
- Your decision style: Research everything, then decide
- Ideal weekend: A long walk with no notifications`;

const EXAMPLE_RESPONSE = `NICKNAME: The Quietly Overqualified
TRAITS: resourceful, introverted, detail-obsessed, secretly competitive
ROLE: The one who shows up with the solution already written before the meeting starts
VIBE: Introverted Mastermind
ABOUT: This person has a color-coded spreadsheet for things that don't need spreadsheets.
DEEPDIVE: Underneath the calm exterior is someone who has run through every possible outcome of this conversation and prepared a response for each one. They work best alone, deliver results that make everyone else look bad by comparison, and genuinely enjoy the silence that follows.
SUPERPOWER: Can research, plan, and execute something while everyone else is still deciding on a name for the group chat
WEAKNESS: Will redo your work if you do it slightly differently than they would have
MOTTO: If it's worth doing, it's worth doing with a 12-tab browser and a backup plan
HINT1: Their camera roll is 90% screenshots of things they want to remember
HINT2: Has a strong opinion about the right way to load a dishwasher
HINT3: Replies to texts days late but the reply is three paragraphs`;

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

  try {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "stepfun/step-3.5-flash:free",
        max_tokens: 600,
        messages: [
          {
            role: "system",
            content: "You are a witty, sharp party game host who creates hilarious and accurate personality profiles. You write specific, funny observations — never generic. You always follow the exact format given."
          },
          {
            role: "user",
            content: `Create a personality profile for someone with these quiz answers:\n\n${EXAMPLE_ANSWERS}`
          },
          {
            role: "assistant",
            content: EXAMPLE_RESPONSE
          },
          {
            role: "user",
            content: `Great! Now create a completely different profile for this new person's quiz answers:\n\n${answers}`
          }
        ],
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      const detail = data.error?.message || data.error?.code || JSON.stringify(data);
      throw new Error(`OpenRouter error ${response.status}: ${detail}`);
    }

    const rawText = data.choices?.[0]?.message?.content || "";
    const profile = parsePlainText(rawText);
    const safeStr = JSON.stringify({ profile });
    res.setHeader("Content-Type", "application/json");
    res.end(safeStr);
  } catch (err) {
    console.error("Analysis error:", err.message);
    res.status(500).json({ error: "Analysis failed: " + err.message });
  }
};
