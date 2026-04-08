// Scorer: grades each tweet on 5 dimensions (0-10 each),
// then combines them into a weighted total score.

const { scoring, opportunityKeywords } = require('./config');

// Main function: takes an array of tweets, adds score fields to each one.
function scoreTweets(tweets) {
  const now = Date.now();

  return tweets.map((tweet) => {
    const velocity = scoreVelocity(tweet, now);
    const authority = scoreAuthority(tweet);
    const timing = scoreTiming(tweet, now);
    const opportunity = scoreOpportunity(tweet);
    const replyability = scoreReplyability(tweet);

    // Weighted composite score
    const w = scoring.weights;
    const total =
      w.velocity * velocity +
      w.authority * authority +
      w.timing * timing +
      w.opportunity * opportunity +
      w.replyability * replyability;

    return {
      ...tweet,
      score_velocity: round(velocity),
      score_authority: round(authority),
      score_timing: round(timing),
      score_opportunity: round(opportunity),
      score_replyability: round(replyability),
      score_total: round(total),
    };
  });
}

// --- Velocity ---
// "Is this tweet blowing up relative to the author's size?"
// A small account getting lots of engagement = high velocity.
// We also factor in age — 500 likes in 1 hour is better than 500 likes in 24 hours.
function scoreVelocity(tweet, now) {
  const followers = Math.max(tweet.authorFollowers || 1, 1);

  // Weighted engagement: retweets count double (they spread reach),
  // replies count 1.5x (they show conversation)
  const engagement =
    (tweet.likeCount || 0) +
    (tweet.retweetCount || 0) * 2 +
    (tweet.replyCount || 0) * 1.5;

  const engagementRate = engagement / followers;

  // Time decay: normalize by hours since posted
  const ageHours = tweet.createdAt
    ? (now - new Date(tweet.createdAt).getTime()) / 3600000
    : 12; // default to 12h if no timestamp
  const velocityPerHour = engagementRate / Math.max(ageHours, 0.5);

  // Scale so a "good" tweet scores around 7
  return Math.min(10, velocityPerHour * scoring.velocityScalingFactor);
}

// --- Authority ---
// "How big/credible is this person?"
// Simple tier lookup based on follower count.
// 100K+ followers = score of 10, under 1K = score of 2.
function scoreAuthority(tweet) {
  const followers = tweet.authorFollowers || 0;

  for (const tier of scoring.authorityTiers) {
    if (followers >= tier.min) {
      return tier.score;
    }
  }
  return 2; // fallback
}

// --- Timing ---
// "How fresh is this tweet?"
// Uses exponential decay: score = 10 * e^(-hours/12)
// This means:
//   1 hour old  → 9.2
//   6 hours old → 6.1
//   12 hours    → 3.7
//   24 hours    → 1.4
//   36 hours    → 0.5
function scoreTiming(tweet, now) {
  if (!tweet.createdAt) return 5; // no timestamp — assume medium freshness

  const ageHours = (now - new Date(tweet.createdAt).getTime()) / 3600000;
  return 10 * Math.exp(-ageHours / scoring.timingDecayHours);
}

// --- Opportunity ---
// "How relevant is this to content gaps?"
// Looks up the search keyword in the opportunity map.
// Also scans the tweet text for any matching keywords (a tweet found via
// "AI agent" might also mention "Claude Code" — we want the highest match).
function scoreOpportunity(tweet) {
  let bestScore = 5; // default if nothing matches

  // Check the search term that found this tweet
  if (tweet.searchTerm && opportunityKeywords[tweet.searchTerm]) {
    bestScore = opportunityKeywords[tweet.searchTerm];
  }

  // Also scan the tweet text for other high-value keywords
  const textLower = (tweet.text || '').toLowerCase();
  for (const [keyword, score] of Object.entries(opportunityKeywords)) {
    if (score > bestScore && textLower.includes(keyword.toLowerCase())) {
      bestScore = score;
    }
  }

  return bestScore;
}

// --- Replyability ---
// "How easy is it to engage with this tweet?"
// Looks for signals that make a tweet reply-worthy:
// - Questions invite answers
// - Hot takes invite debate
// - Tool mentions let you share your experience
// - Opinions let you agree/disagree
// - Threads show deeper content
function scoreReplyability(tweet) {
  const text = tweet.text || '';
  let score = 0;

  // Questions — "?" means they're asking something
  if (text.includes('?')) score += 3;

  // Hot takes — strong opinion language
  if (/\b(honestly|unpopular opinion|hot take|controversial|disagree)\b/i.test(text)) {
    score += 2;
  }

  // Tool mentions — specific products you can comment on
  if (/\b(Claude|GPT|Cursor|Copilot|Gemini|Codex|Windsurf|Bolt|Lovable)\b/i.test(text)) {
    score += 2;
  }

  // Opinions — subjective statements you can engage with
  if (/\b(I think|I believe|should|better than|worse than|prefer|overrated|underrated)\b/i.test(text)) {
    score += 3;
  }

  // Threads — longer-form content
  if (/🧵|thread/i.test(text)) score += 1;

  return Math.min(score, 10); // cap at 10
}

function round(n) {
  return Math.round(n * 10) / 10; // one decimal place
}

module.exports = { scoreTweets };
