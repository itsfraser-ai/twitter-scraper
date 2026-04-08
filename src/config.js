// Config: the single source of truth for all tuneable values.
// No API calls, no env vars — just data and logic.

const isTestMode = process.argv.includes('--test');

// --- Keywords (tiered) ---
// Tier 1: always searched every run (your core niche)
// Tier 2: rotated through — a few per run (broader AI dev tools)
// Tier 3: used sparingly — one per run (trend-catching)

const keywords = {
  tier1: [
    'Claude Code', 'Codex CLI', 'Gemini Code', 'agentic coding', 'vibe coding',
    'GitHub trending', 'GitHub repo', 'open source AI', 'new AI repo',
    'AI agent', 'AI automation', 'RAG',
  ],
  tier2: [
    'cursor AI', 'windsurf AI', 'GitHub Copilot', 'AI coding',
    'agentic workflow', 'LLM app', 'AI tool launch',
    'open source', 'new repository', 'AI library',
  ],
  tier3: [
    'AI viral', 'AI announcement', 'new AI model',
  ],
};

// In-memory counter that increments each run.
// When pm2 restarts the process, this resets to 0 — that's fine,
// it just means some keywords get searched a bit more often briefly.
let runCounter = 0;

// Returns the keywords for this particular run.
// All of Tier 1 + a rotating slice of Tier 2 + one Tier 3.
function getKeywordsForRun() {
  const t2Count = Math.ceil(keywords.tier2.length / 3); // ~4 per run
  const t2Start = (runCounter * t2Count) % keywords.tier2.length;
  const t3Index = runCounter % keywords.tier3.length;

  // Slice tier2 with wraparound
  const tier2Selection = [];
  for (let i = 0; i < t2Count; i++) {
    tier2Selection.push(keywords.tier2[(t2Start + i) % keywords.tier2.length]);
  }

  runCounter++;

  return [
    ...keywords.tier1,
    ...tier2Selection,
    keywords.tier3[t3Index],
  ];
}

// --- Scoring ---
// Each tweet gets scored 0-10 on 5 dimensions, then combined with these weights.
// The weights must add up to 1.0.
const scoring = {
  weights: {
    velocity: 0.25,     // How fast is it getting engagement?
    authority: 0.15,    // How big/credible is the author?
    timing: 0.25,       // How fresh is the tweet?
    opportunity: 0.20,  // How relevant to your content gaps?
    replyability: 0.15, // How easy is it to engage with?
  },
  // Follower count → authority score mapping
  authorityTiers: [
    { min: 100000, score: 10 },
    { min: 50000, score: 8 },
    { min: 10000, score: 6 },
    { min: 1000, score: 4 },
    { min: 0, score: 2 },
  ],
  // Timing decay: tweets lose relevance exponentially.
  // At 12 hours old, a tweet scores about 3.7 (out of 10).
  // At 24 hours, about 1.4. At 36 hours, about 0.5.
  timingDecayHours: 12,
  // Velocity scaling factor — normalizes so a "good" tweet scores ~7.
  // This will need tuning after the first week of real data.
  velocityScalingFactor: 500,
};

// Keyword-to-opportunity-score mapping.
// When a tweet's search term matches one of these, it gets that score
// for the "opportunity" dimension. Higher = more relevant to your content gaps.
const opportunityKeywords = {
  'Claude Code': 9,
  'Codex CLI': 8,
  'Gemini Code': 8,
  'agentic coding': 9,
  'vibe coding': 8,
  'GitHub trending': 7,
  'GitHub repo': 6,
  'open source AI': 7,
  'new AI repo': 8,
  'AI agent': 7,
  'AI automation': 6,
  'RAG': 7,
  'cursor AI': 6,
  'windsurf AI': 6,
  'GitHub Copilot': 5,
  'AI coding': 6,
  'agentic workflow': 7,
  'LLM app': 6,
  'AI tool launch': 8,
  'open source': 5,
  'new repository': 5,
  'AI library': 6,
  'AI viral': 5,
  'AI announcement': 6,
  'new AI model': 7,
};

// --- Filters ---
// Minimum thresholds to weed out noise before scoring.
// Without these, tiny accounts with 1 like get inflated velocity scores
// because the engagement RATIO is high even though the absolute numbers
// are meaningless. These ensure we only score tweets worth looking at.
const filters = {
  minFollowers: 500,        // Author must have at least 500 followers
  minEngagement: 5,         // Tweet must have at least 5 total engagements (likes + RTs + replies)
};

// --- Selection ---
// Softmax selection: instead of always picking the top 5 tweets,
// we use a probability distribution so lower-ranked (but still good)
// tweets have a chance of being selected. Temperature controls randomness:
// higher temp = more random, lower = more deterministic.
const selection = {
  temperature: 1.5,
  minSelect: 3,
  maxSelect: 5,
  minScoreThreshold: 3.0, // Tweets below this score are filtered out entirely
};

// --- Schedule ---
const schedule = {
  intervalMinutes: 45,
  jitterMinutes: 10, // Random 0-10 min delay added to each run
  dailySummaryHour: 22, // 10pm — end-of-day summary
};

module.exports = {
  isTestMode,
  keywords,
  getKeywordsForRun,
  scoring,
  opportunityKeywords,
  filters,
  selection,
  schedule,
};
