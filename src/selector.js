// Selector: picks 3-5 tweets using softmax weighted random selection.
//
// Instead of always picking the highest-scoring tweets (boring, predictable),
// softmax converts scores into probabilities. Higher scores = higher chance
// of being picked, but lower scores still have a shot.
//
// Temperature (1.5) controls randomness:
//   Low temp (0.5) = almost always picks the top scorers
//   High temp (3.0) = nearly random
//   Our temp (1.5) = balanced — favors high scores with occasional surprises

const { selection } = require('./config');

function selectTweets(scoredTweets) {
  // Step 1: Filter out junk (below minimum threshold)
  const candidates = scoredTweets.filter(
    (t) => t.score_total >= selection.minScoreThreshold
  );

  if (candidates.length === 0) {
    console.log('No tweets above score threshold');
    return [];
  }

  // If we have fewer candidates than the minimum, just return them all
  if (candidates.length <= selection.minSelect) {
    return candidates.map((t) => ({ ...t, softmax_prob: 1 / candidates.length }));
  }

  // Step 2: Compute softmax probabilities
  // Formula: prob(i) = exp(score_i / temperature) / sum(exp(all_scores / temperature))
  const scores = candidates.map((t) => t.score_total);
  const probs = softmax(scores, selection.temperature);

  // Attach probabilities to tweets (before selection, so we keep the original distribution)
  const withProbs = candidates.map((t, i) => ({
    ...t,
    softmax_prob: Math.round(probs[i] * 1000) / 1000, // 3 decimal places
  }));

  // Step 3: Sample without replacement
  // Like drawing names from a hat, but some names are on more tickets
  const sampleSize = Math.min(selection.maxSelect, candidates.length);
  const selected = sampleWithoutReplacement(withProbs, probs, sampleSize);

  // Sort by score (highest first) for display
  selected.sort((a, b) => b.score_total - a.score_total);

  console.log(`Selected ${selected.length} tweets from ${candidates.length} candidates`);
  return selected;
}

// Softmax: turns an array of scores into probabilities that sum to 1.
// Higher scores get exponentially higher probabilities.
function softmax(scores, temperature) {
  // Subtract max for numerical stability (prevents exp() from exploding)
  const maxScore = Math.max(...scores);
  const exps = scores.map((s) => Math.exp((s - maxScore) / temperature));
  const sumExps = exps.reduce((a, b) => a + b, 0);
  return exps.map((e) => e / sumExps);
}

// Weighted random sampling without replacement.
// Each iteration: pick one based on probabilities, remove it, renormalize.
function sampleWithoutReplacement(items, probs, count) {
  const selected = [];
  const remaining = [...items];
  let remainingProbs = [...probs];

  for (let i = 0; i < count && remaining.length > 0; i++) {
    // Normalize probabilities (they won't sum to 1 after removals)
    const sum = remainingProbs.reduce((a, b) => a + b, 0);
    const normalized = remainingProbs.map((p) => p / sum);

    // Pick one using cumulative probability
    const rand = Math.random();
    let cumulative = 0;
    let pickedIndex = remaining.length - 1; // fallback to last

    for (let j = 0; j < normalized.length; j++) {
      cumulative += normalized[j];
      if (rand <= cumulative) {
        pickedIndex = j;
        break;
      }
    }

    // Move picked item from remaining to selected
    selected.push(remaining[pickedIndex]);
    remaining.splice(pickedIndex, 1);
    remainingProbs.splice(pickedIndex, 1);
  }

  return selected;
}

module.exports = { selectTweets };
