const express = require("express");
const OpenAI = require("openai");
const path = require("path");

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));
// Serve index.html from root when no public/ folder exists
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

const client = new OpenAI({
  baseURL: "https://openrouter.ai/api/v1",
  apiKey: process.env.OPENROUTER_API_KEY,
});

// ─── Question Bank ────────────────────────────────────────────────────────────

const QUESTION_BANK = {
  "Personality & Decisions": [
    {
      id: "pd1",
      text: "You have an unexpected free afternoon. What do you do?",
      choices: [
        "A) Finally tackle that project you've been putting off",
        "B) Call a friend and make spontaneous plans",
        "C) Blissfully do absolutely nothing and enjoy it",
        "D) Research something you've been curious about",
      ],
    },
    {
      id: "pd2",
      text: "Your group needs to make a decision and nobody can agree. You:",
      choices: [
        "A) Step up and make the call — someone has to",
        "B) Try to find a compromise everyone can live with",
        "C) Quietly go along with whatever the group decides",
        "D) Lay out the pros and cons of each option clearly",
      ],
    },
    {
      id: "pd3",
      text: "How do you handle being wrong about something?",
      choices: [
        "A) Admit it immediately and move on — no big deal",
        "B) Need a moment to process, then accept it",
        "C) Quietly correct course without making a fuss",
        "D) Want to understand exactly where your reasoning went wrong",
      ],
    },
    {
      id: "pd4",
      text: "A close friend is going through something difficult. You:",
      choices: [
        "A) Jump into problem-solving mode and offer solutions",
        "B) Listen for as long as they need without interrupting",
        "C) Distract them with fun plans to lift their mood",
        "D) Share a time you went through something similar",
      ],
    },
    {
      id: "pd5",
      text: "When starting a new project, you:",
      choices: [
        "A) Dive right in and figure it out as you go",
        "B) Make a solid plan before touching anything",
        "C) Look for how others have done it first",
        "D) Spend time imagining all the possibilities first",
      ],
    },
  ],
  "Character Vibe": [
    {
      id: "cv1",
      text: "Pick the vibe that fits you most honestly:",
      choices: [
        "A) The one who seems chill but is secretly very intense",
        "B) The one who's loud and chaotic but somehow always on time",
        "C) The quietly powerful one people underestimate constantly",
        "D) The one who's always three steps ahead and won't tell you",
      ],
    },
    {
      id: "cv2",
      text: "Your classic group dynamic move:",
      choices: [
        "A) The one who hypes everyone else up",
        "B) The voice of reason who says what nobody wants to hear",
        "C) The wildcard who makes things interesting",
        "D) The glue who keeps everyone from falling apart",
      ],
    },
    {
      id: "cv3",
      text: "If your life had background music right now, it would be:",
      choices: [
        "A) An epic orchestral buildup — things are happening",
        "B) Something lo-fi and ambient — just vibing",
        "C) Chaotic pop punk — barely holding it together but make it fun",
        "D) A movie soundtrack climax — I'm the main character",
      ],
    },
    {
      id: "cv4",
      text: "Your \"final boss\" quality — the thing that surprises people:",
      choices: [
        "A) How ruthlessly logical you get when stakes are high",
        "B) How emotionally perceptive you actually are",
        "C) How weirdly fearless you are when things go wrong",
        "D) How long you've secretly been planning something",
      ],
    },
  ],
  "Group Role": [
    {
      id: "gr1",
      text: "Group project. First day. You naturally:",
      choices: [
        "A) Start assigning roles and building a timeline",
        "B) Make sure everyone feels heard and included",
        "C) Immediately brainstorm the most interesting angle",
        "D) Research what's been done before and flag the risks",
      ],
    },
    {
      id: "gr2",
      text: "The group is losing energy halfway through. You:",
      choices: [
        "A) Remind everyone why this matters and push forward",
        "B) Suggest a break and check in on how people are doing",
        "C) Introduce something unexpected to make it fun again",
        "D) Identify what's slowing things down and fix it quietly",
      ],
    },
    {
      id: "gr3",
      text: "When someone in the group messes up badly, you:",
      choices: [
        "A) Focus on fixing the problem first, feelings second",
        "B) Make sure they don't feel too terrible about it",
        "C) Make a joke to defuse the tension (respectfully)",
        "D) Figure out what went wrong so it doesn't happen again",
      ],
    },
    {
      id: "gr4",
      text: "Your ideal role in any team is:",
      choices: [
        "A) The one who sets the direction and drives execution",
        "B) The one who keeps the team connected and supported",
        "C) The one who brings fresh ideas and shakes things up",
        "D) The one who makes sure details are right and nothing breaks",
      ],
    },
  ],
  Preferences: [
    {
      id: "pr1",
      text: "Pick a color that secretly matches your energy:",
      choices: [
        "A) Deep forest green — steady, grounded, and growing",
        "B) Electric blue — clear, sharp, and a little unpredictable",
        "C) Warm amber — cozy, glowing, draws people in",
        "D) Midnight purple — complex, mysterious, and deep",
      ],
    },
    {
      id: "pr2",
      text: "Which animal are you, honestly:",
      choices: [
        "A) A wolf — loyal to your pack, deadly serious when needed",
        "B) A crow — smarter than you look, excellent memory",
        "C) A golden retriever — genuinely happy, makes everyone feel good",
        "D) A cat — selective, independent, unbothered by your opinion",
      ],
    },
    {
      id: "pr3",
      text: "Your ideal way to spend a Saturday:",
      choices: [
        "A) Somewhere new — new city, new place, doesn't matter",
        "B) A perfect routine: coffee, a good book, no obligations",
        "C) With people — the more chaos, the better honestly",
        "D) Deep in a project or hobby you've been neglecting",
      ],
    },
    {
      id: "pr4",
      text: "Your aesthetic, if you had to pick one word:",
      choices: [
        "A) Minimalist — intentional, clean, nothing extra",
        "B) Cozy — warm, layered, extremely lived-in",
        "C) Eclectic — a collection of things that shouldn't go together but do",
        "D) Sleek — polished, functional, quietly impressive",
      ],
    },
  ],
  "Bonus Fun": [
    {
      id: "bf1",
      text: "You find $50 on the ground with no one around. You:",
      choices: [
        "A) Keep it — this is clearly a gift from the universe",
        "B) Spend 20 minutes deciding what to do, then keep it",
        "C) Immediately think of something to spend it on",
        "D) Feel weirdly guilty about it for three days",
      ],
    },
    {
      id: "bf2",
      text: "Your villain origin story would begin with:",
      choices: [
        "A) Being wildly underestimated one too many times",
        "B) Caring way too much for way too long",
        "C) Having a genuinely excellent idea that nobody listened to",
        "D) Watching someone make a completely avoidable mistake",
      ],
    },
    {
      id: "bf3",
      text: "Midnight snack tier list — your go-to is:",
      choices: [
        "A) Something sweet — dessert is a personality trait",
        "B) Leftovers — efficient, no shame",
        "C) Something crunchy — you need the sound",
        "D) You don't snack. You sleep like a normal person",
      ],
    },
    {
      id: "bf4",
      text: "If your phone's screen time report went public, people would:",
      choices: [
        "A) Not be surprised at all — you're predictable like that",
        "B) Be shocked at how much time is one specific app",
        "C) Respect the hustle (it's mostly productivity stuff)",
        "D) Never let you live it down",
      ],
    },
    {
      id: "bf5",
      text: "You're at a party and the vibe dies. You:",
      choices: [
        "A) Suggest a game — you've got three ready to go",
        "B) Find the one interesting person and have a real conversation",
        "C) Slowly migrate toward the snacks and call it a win",
        "D) Announce you're leaving — and somehow half the party follows",
      ],
    },
  ],
};

// ─── Game State ───────────────────────────────────────────────────────────────

let gameState = {
  phase: "setup", // setup | sections | answering | analyzing | guessing | reveal | done
  players: [],
  sections: [],
  questions: [],
  responses: {}, // { playerName: [{ id, text, choice }] }
  currentPlayerIndex: 0,
  secretPlayer: null,
  profile: null,
  usedPlayers: [],
};

function resetGame() {
  gameState = {
    phase: "setup",
    players: [],
    sections: [],
    questions: [],
    responses: {},
    currentPlayerIndex: 0,
    secretPlayer: null,
    profile: null,
    usedPlayers: gameState.usedPlayers || [],
  };
}

function buildQuestions(sections) {
  const questions = [];
  for (const section of sections) {
    const bank = QUESTION_BANK[section] || [];
    // shuffle and take a portion
    const shuffled = [...bank].sort(() => Math.random() - 0.5);
    const take = sections.length <= 2 ? 4 : sections.length === 3 ? 3 : 2;
    questions.push(...shuffled.slice(0, take));
  }
  // Clamp to 8–12
  return questions.slice(0, 12);
}

// ─── API Routes ───────────────────────────────────────────────────────────────

app.get("/api/state", (req, res) => {
  // Return safe state (no secretPlayer reveal)
  const safe = { ...gameState, secretPlayer: gameState.phase === "reveal" ? gameState.secretPlayer : null };
  res.json(safe);
});

app.post("/api/setup", (req, res) => {
  const { players } = req.body;
  if (!players || players.length < 2) {
    return res.status(400).json({ error: "Need at least 2 players" });
  }
  resetGame();
  gameState.players = players.map((p) => p.trim()).filter(Boolean);
  gameState.phase = "sections";
  res.json({ ok: true });
});

app.post("/api/sections", (req, res) => {
  const { sections } = req.body;
  if (!sections || sections.length < 2 || sections.length > 4) {
    return res.status(400).json({ error: "Pick 2–4 sections" });
  }
  gameState.sections = sections;
  gameState.questions = buildQuestions(sections);
  gameState.phase = "answering";
  gameState.currentPlayerIndex = 0;
  res.json({ ok: true, questionCount: gameState.questions.length });
});

app.get("/api/questions", (req, res) => {
  res.json({ questions: gameState.questions });
});

app.post("/api/answer", (req, res) => {
  const { playerName, responses } = req.body;
  if (!playerName || !responses) {
    return res.status(400).json({ error: "Missing data" });
  }
  gameState.responses[playerName] = responses;
  gameState.currentPlayerIndex++;

  if (gameState.currentPlayerIndex >= gameState.players.length) {
    // All players done — pick secret player
    const eligible = gameState.players.filter(
      (p) => !gameState.usedPlayers.includes(p)
    );
    const pool = eligible.length > 0 ? eligible : gameState.players;
    gameState.secretPlayer = pool[Math.floor(Math.random() * pool.length)];
    gameState.phase = "analyzing";
  }

  res.json({
    ok: true,
    allDone: gameState.currentPlayerIndex >= gameState.players.length,
  });
});

app.post("/api/analyze", async (req, res) => {
  if (gameState.phase !== "analyzing") {
    return res.status(400).json({ error: "Not in analyzing phase" });
  }

  const player = gameState.secretPlayer;
  const responses = gameState.responses[player];

  const responseText = responses
    .map((r) => `Q: ${r.text}\nA: ${r.choice}`)
    .join("\n\n");

  const systemPrompt = `You are the host of a party game called "Guess the Personality."
You have a player's quiz answers. Your job is to create a fun, engaging, and slightly dramatic personality profile.

The profile MUST be:
- Interesting and specific (not generic)
- Fun and slightly funny
- Accurate to the answers
- Intriguing enough that friends can debate who it is
- Written as if presenting a mystery character

Return ONLY valid JSON matching this exact schema:
{
  "nickname": "A creative title like 'The Quiet Strategist' or 'Chaos Incarnate (Organized Edition)'",
  "traits": ["trait 1", "trait 2", "trait 3", "trait 4"],
  "groupRole": "Their role in any friend group (1-2 sentences)",
  "characterVibe": "An archetype description like 'the mentor who pretends not to care' or 'the villain who's actually right'. NO specific copyrighted character names.",
  "description": "2-3 funny, revealing sentences that capture their essence without being too obvious. Use second person ('This person...').",
  "hints": ["A subtle behavioral hint", "Another clue about their habits or tendencies"]
}`;

  try {
    const completion = await client.chat.completions.create({
      model: "meta-llama/llama-3.3-70b-instruct:free",
      max_tokens: 1024,
      messages: [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: `Here are the quiz answers for the mystery player:\n\n${responseText}\n\nGenerate their personality profile.`,
        },
      ],
    });

    const text = completion.choices[0]?.message?.content;
    if (!text) throw new Error("No response from model");

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("No JSON found in response");

    gameState.profile = JSON.parse(jsonMatch[0]);
    gameState.phase = "guessing";

    // Track used players
    if (!gameState.usedPlayers.includes(player)) {
      gameState.usedPlayers.push(player);
    }

    res.json({ ok: true });
  } catch (err) {
    console.error("Claude error:", err.message);
    res.status(500).json({ error: "Analysis failed: " + err.message });
  }
});

app.get("/api/profile", (req, res) => {
  if (!gameState.profile) {
    return res.status(404).json({ error: "No profile yet" });
  }
  res.json({ profile: gameState.profile, players: gameState.players });
});

app.post("/api/reveal", (req, res) => {
  gameState.phase = "reveal";
  res.json({ secretPlayer: gameState.secretPlayer, profile: gameState.profile });
});

app.post("/api/play-again", (req, res) => {
  const keepPlayers = gameState.players;
  const usedPlayers = gameState.usedPlayers;
  resetGame();
  gameState.players = keepPlayers;
  gameState.usedPlayers = usedPlayers;

  // If everyone has been chosen, reset the used list
  if (gameState.usedPlayers.length >= gameState.players.length) {
    gameState.usedPlayers = [];
  }

  gameState.phase = "sections";
  res.json({ ok: true });
});

app.get("/api/sections-list", (req, res) => {
  res.json({ sections: Object.keys(QUESTION_BANK) });
});

// ─── NPC Chat (Playground Mode) ──────────────────────────────────────────────

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
    systemPrompt: `You are Detective Sharp, a sharp-eyed noir detective who specializes in reading personalities. Make deductions from answers: "Interesting... that tells me you're the type who..." Keep responses SHORT: 2-3 sentences max. Always end with a probing question. Speak like a classic noir detective — observant, world-weary, surprisingly perceptive.`,
  },
  robot: {
    name: "Unit-7",
    systemPrompt: `You are Unit-7, an AI personality analysis robot. Speak logically and precisely. Occasionally use robot language like "PROCESSING...", "ANALYZING DATA...", "QUERY:". Keep responses SHORT: 2-3 sentences max. Always end with a precise question about human behavior, decision-making, or preferences. Be amusingly literal about human concepts.`,
  },
  teen: {
    name: "Alex",
    systemPrompt: `You are Alex, a 17-year-old who is extremely online. Use Gen-Z slang authentically: "no cap", "lowkey", "ngl", "slay", "bussin", "understood the assignment", "that's giving...", "rent free", "mid". Keep responses SHORT: 2-3 sentences max. Always end with a question about the player's personality, opinions, or vibe. Be relatable, a little chaotic, and genuinely curious.`,
  },
};

app.post("/api/chat", async (req, res) => {
  const { npcId, history = [], userMessage } = req.body;
  const npc = NPC_CONFIGS[npcId];
  if (!npc) return res.status(400).json({ error: "Unknown NPC: " + npcId });
  if (!userMessage) return res.status(400).json({ error: "No message provided" });

  const messages = [
    { role: "system", content: npc.systemPrompt },
    ...history.slice(-12),
    { role: "user", content: userMessage },
  ];

  try {
    const completion = await client.chat.completions.create({
      model: "meta-llama/llama-3.3-70b-instruct:free",
      max_tokens: 220,
      messages,
      seed: Date.now() % 99999,
    });
    const text = completion.choices[0]?.message?.content?.trim();
    if (!text) throw new Error("Empty response from model");
    res.json({ response: text, npcName: npc.name });
  } catch (err) {
    console.error("Chat error:", err.message);
    res.status(500).json({ error: "Chat failed: " + err.message });
  }
});

// ─── Start Server ─────────────────────────────────────────────────────────────

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`\n🎉 Guess the Personality is running!`);
  console.log(`   Open: http://localhost:${PORT}`);
  console.log(`   Make sure ANTHROPIC_API_KEY is set.\n`);
});
