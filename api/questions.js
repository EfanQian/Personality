const QUESTION_BANK = {
  "Personality & Decisions": [
    { id: "pd1", text: "You have an unexpected free afternoon. What do you do?", choices: ["A) Finally tackle that project you've been putting off", "B) Call a friend and make spontaneous plans", "C) Blissfully do absolutely nothing and enjoy it", "D) Research something you've been curious about"] },
    { id: "pd2", text: "Your group needs to make a decision and nobody can agree. You:", choices: ["A) Step up and make the call — someone has to", "B) Try to find a compromise everyone can live with", "C) Quietly go along with whatever the group decides", "D) Lay out the pros and cons of each option clearly"] },
    { id: "pd3", text: "How do you handle being wrong about something?", choices: ["A) Admit it immediately and move on — no big deal", "B) Need a moment to process, then accept it", "C) Quietly correct course without making a fuss", "D) Want to understand exactly where your reasoning went wrong"] },
    { id: "pd4", text: "A close friend is going through something difficult. You:", choices: ["A) Jump into problem-solving mode and offer solutions", "B) Listen for as long as they need without interrupting", "C) Distract them with fun plans to lift their mood", "D) Share a time you went through something similar"] },
    { id: "pd5", text: "When starting a new project, you:", choices: ["A) Dive right in and figure it out as you go", "B) Make a solid plan before touching anything", "C) Look for how others have done it first", "D) Spend time imagining all the possibilities first"] },
  ],
  "Character Vibe": [
    { id: "cv1", text: "Pick the vibe that fits you most honestly:", choices: ["A) The one who seems chill but is secretly very intense", "B) The one who's loud and chaotic but somehow always on time", "C) The quietly powerful one people underestimate constantly", "D) The one who's always three steps ahead and won't tell you"] },
    { id: "cv2", text: "Your classic group dynamic move:", choices: ["A) The one who hypes everyone else up", "B) The voice of reason who says what nobody wants to hear", "C) The wildcard who makes things interesting", "D) The glue who keeps everyone from falling apart"] },
    { id: "cv3", text: "If your life had background music right now, it would be:", choices: ["A) An epic orchestral buildup — things are happening", "B) Something lo-fi and ambient — just vibing", "C) Chaotic pop punk — barely holding it together but make it fun", "D) A movie soundtrack climax — I'm the main character"] },
    { id: "cv4", text: "Your \"final boss\" quality — the thing that surprises people:", choices: ["A) How ruthlessly logical you get when stakes are high", "B) How emotionally perceptive you actually are", "C) How weirdly fearless you are when things go wrong", "D) How long you've secretly been planning something"] },
  ],
  "Group Role": [
    { id: "gr1", text: "Group project. First day. You naturally:", choices: ["A) Start assigning roles and building a timeline", "B) Make sure everyone feels heard and included", "C) Immediately brainstorm the most interesting angle", "D) Research what's been done before and flag the risks"] },
    { id: "gr2", text: "The group is losing energy halfway through. You:", choices: ["A) Remind everyone why this matters and push forward", "B) Suggest a break and check in on how people are doing", "C) Introduce something unexpected to make it fun again", "D) Identify what's slowing things down and fix it quietly"] },
    { id: "gr3", text: "When someone in the group messes up badly, you:", choices: ["A) Focus on fixing the problem first, feelings second", "B) Make sure they don't feel too terrible about it", "C) Make a joke to defuse the tension (respectfully)", "D) Figure out what went wrong so it doesn't happen again"] },
    { id: "gr4", text: "Your ideal role in any team is:", choices: ["A) The one who sets the direction and drives execution", "B) The one who keeps the team connected and supported", "C) The one who brings fresh ideas and shakes things up", "D) The one who makes sure details are right and nothing breaks"] },
  ],
  "Preferences": [
    { id: "pr1", text: "Pick a color that secretly matches your energy:", choices: ["A) Deep forest green — steady, grounded, and growing", "B) Electric blue — clear, sharp, and a little unpredictable", "C) Warm amber — cozy, glowing, draws people in", "D) Midnight purple — complex, mysterious, and deep"] },
    { id: "pr2", text: "Which animal are you, honestly:", choices: ["A) A wolf — loyal to your pack, deadly serious when needed", "B) A crow — smarter than you look, excellent memory", "C) A golden retriever — genuinely happy, makes everyone feel good", "D) A cat — selective, independent, unbothered by your opinion"] },
    { id: "pr3", text: "Your ideal way to spend a Saturday:", choices: ["A) Somewhere new — new city, new place, doesn't matter", "B) A perfect routine: coffee, a good book, no obligations", "C) With people — the more chaos, the better honestly", "D) Deep in a project or hobby you've been neglecting"] },
    { id: "pr4", text: "Your aesthetic, if you had to pick one word:", choices: ["A) Minimalist — intentional, clean, nothing extra", "B) Cozy — warm, layered, extremely lived-in", "C) Eclectic — a collection of things that shouldn't go together but do", "D) Sleek — polished, functional, quietly impressive"] },
  ],
  "Bonus Fun": [
    { id: "bf1", text: "You find $50 on the ground with no one around. You:", choices: ["A) Keep it — this is clearly a gift from the universe", "B) Spend 20 minutes deciding what to do, then keep it", "C) Immediately think of something to spend it on", "D) Feel weirdly guilty about it for three days"] },
    { id: "bf2", text: "Your villain origin story would begin with:", choices: ["A) Being wildly underestimated one too many times", "B) Caring way too much for way too long", "C) Having a genuinely excellent idea that nobody listened to", "D) Watching someone make a completely avoidable mistake"] },
    { id: "bf3", text: "Midnight snack tier list — your go-to is:", choices: ["A) Something sweet — dessert is a personality trait", "B) Leftovers — efficient, no shame", "C) Something crunchy — you need the sound", "D) You don't snack. You sleep like a normal person"] },
    { id: "bf4", text: "If your phone's screen time report went public, people would:", choices: ["A) Not be surprised at all — you're predictable like that", "B) Be shocked at how much time is one specific app", "C) Respect the hustle (it's mostly productivity stuff)", "D) Never let you live it down"] },
    { id: "bf5", text: "You're at a party and the vibe dies. You:", choices: ["A) Suggest a game — you've got three ready to go", "B) Find the one interesting person and have a real conversation", "C) Slowly migrate toward the snacks and call it a win", "D) Announce you're leaving — and somehow half the party follows"] },
  ],
};

function buildQuestions(sections) {
  const questions = [];
  for (const section of sections) {
    const bank = QUESTION_BANK[section] || [];
    const shuffled = [...bank].sort(() => Math.random() - 0.5);
    const take = sections.length <= 2 ? 4 : sections.length === 3 ? 3 : 2;
    questions.push(...shuffled.slice(0, take));
  }
  return questions.slice(0, 12);
}

module.exports = (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");

  const sectionsParam = req.query.sections || "";
  const sections = sectionsParam ? sectionsParam.split(",") : [];

  if (sections.length === 0) {
    // Return the full section list
    return res.json({ sectionNames: Object.keys(QUESTION_BANK) });
  }

  const questions = buildQuestions(sections);
  res.json({ questions });
};
