// Markdown: generates the daily Obsidian-compatible report.
// This is a pure function — data in, markdown string out. No side effects.
//
// The output format is designed to be consumed by /fraser:standup
// and eventually fed into /yt-pipeline and /ideation.

function generateDailyMarkdown(tweets, runStats) {
  const date = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

  // Get only selected tweets (best ones from all runs today)
  const selectedTweets = tweets.filter((t) => t.selected);
  const topTweets = selectedTweets.length > 0 ? selectedTweets : tweets.slice(0, 10);

  let md = '';

  // --- Frontmatter (YAML metadata for Obsidian) ---
  md += '---\n';
  md += `date: ${date}\n`;
  md += 'type: twitter-research\n';
  md += '---\n\n';

  md += `# Twitter Research — ${date}\n\n`;

  // --- Top Tweets ---
  md += '## Top Tweets Today\n\n';

  if (topTweets.length === 0) {
    md += 'No tweets scraped today.\n\n';
  } else {
    topTweets.forEach((tweet, i) => {
      const followers = formatFollowers(tweet.author_followers || tweet.authorFollowers);
      const handle = tweet.author_handle || tweet.authorHandle;
      const text = (tweet.tweet_text || tweet.text || '').replace(/\n/g, ' ').trim();
      const score = tweet.score_total;
      const searchTerm = tweet.search_term || tweet.searchTerm;
      const url = tweet.tweet_url || tweet.url;

      md += `${i + 1}. **@${handle}** (${followers}) — Score: ${score}\n`;
      md += `   > "${truncate(text, 200)}"\n`;
      md += `   - Search term: "${searchTerm}"\n`;
      if (url) md += `   - 🔗 ${url}\n`;
      md += '\n';
    });
  }

  // --- Trending Themes ---
  // Group tweets by search term, count high-scoring ones per group
  md += '## Trending Themes\n';

  const themes = buildThemes(tweets);
  if (themes.length === 0) {
    md += '- No clear themes detected\n';
  } else {
    themes.slice(0, 5).forEach((theme) => {
      md += `- ${theme.keyword} (${theme.count} high-scoring tweets)\n`;
    });
  }
  md += '\n';

  // --- Suggested Research ---
  // Topics worth pushing into /yt-pipeline
  md += '## Suggested Research\n';
  md += 'Topics worth pushing into `/yt-pipeline`:\n';

  const suggestions = themes.slice(0, 3);
  if (suggestions.length === 0) {
    md += '- No strong suggestions today\n';
  } else {
    suggestions.forEach((theme) => {
      md += `- \`${theme.keyword}\` — ${theme.count} tweets, avg score ${theme.avgScore}\n`;
    });
  }
  md += '\n';

  // --- Stats ---
  md += '## Stats\n';
  md += `- Scraped: ${runStats.totalScraped} | New: ${runStats.totalNew} | Runs: ${runStats.runs}\n`;

  // Top keywords by frequency
  const keywordCounts = {};
  tweets.forEach((t) => {
    const term = t.search_term || t.searchTerm;
    if (term) keywordCounts[term] = (keywordCounts[term] || 0) + 1;
  });
  const topKeywords = Object.entries(keywordCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([kw, count]) => `${kw} (${count})`)
    .join(', ');

  if (topKeywords) {
    md += `- Top keywords: ${topKeywords}\n`;
  }

  return md;
}

// Group tweets by search term, count those scoring above 6 (high quality),
// and compute average score per group. Sort by count descending.
function buildThemes(tweets) {
  const groups = {};

  tweets.forEach((t) => {
    const term = t.search_term || t.searchTerm;
    const score = t.score_total || 0;
    if (!term) return;

    if (!groups[term]) {
      groups[term] = { keyword: term, scores: [], count: 0 };
    }
    groups[term].scores.push(score);
    if (score >= 6) groups[term].count++;
  });

  return Object.values(groups)
    .filter((g) => g.count > 0)
    .map((g) => ({
      keyword: g.keyword,
      count: g.count,
      avgScore: (g.scores.reduce((a, b) => a + b, 0) / g.scores.length).toFixed(1),
    }))
    .sort((a, b) => b.count - a.count);
}

function formatFollowers(count) {
  if (!count) return '0';
  if (count >= 1000000) return `${(count / 1000000).toFixed(1)}M`;
  if (count >= 1000) return `${(count / 1000).toFixed(0)}K`;
  return count.toString();
}

function truncate(text, maxLen) {
  if (!text || text.length <= maxLen) return text || '';
  return text.substring(0, maxLen) + '...';
}

module.exports = { generateDailyMarkdown };
