// Daily Summary: runs at 10pm (or manually) to generate the day's report.
//
// Flow:
// 1. Get all tweets scraped today from Supabase
// 2. Get run stats (how many scrapes, total tweets, etc.)
// 3. Generate Obsidian-compatible markdown
// 4. Push to fraserai GitHub repo
// 5. Notify via Telegram
//
// Can be called from index.js (cron) or standalone: node daily-summary.js

require('dotenv').config();

const { isTestMode } = require('./src/config');
const { initSupabase, getTodaysTweets, getTodaysRunStats } = require('./src/storage');
const { generateDailyMarkdown } = require('./src/markdown');
const { pushMarkdown } = require('./src/github');
const { initTelegram, sendDailySummary } = require('./src/telegram');

async function runDailySummary() {
  console.log('Generating daily summary...');

  const tweets = await getTodaysTweets();
  const runStats = await getTodaysRunStats();

  console.log(`Found ${tweets.length} tweets from ${runStats.runs} runs today`);

  const markdown = generateDailyMarkdown(tweets, runStats);
  const date = new Date().toISOString().split('T')[0];

  await pushMarkdown(markdown, date);

  const summaryMsg = tweets.length > 0
    ? `📋 Daily summary pushed: ${tweets.length} tweets, ${runStats.runs} runs → research/twitter-scraper/${date}-twitter.md`
    : `⚠️ No tweets scraped today — check the scraper logs`;

  await sendDailySummary(summaryMsg);

  console.log('Daily summary complete');
}

// Allow standalone execution: node daily-summary.js
if (require.main === module) {
  if (isTestMode) console.log('🧪 Running in TEST mode\n');
  initSupabase();
  initTelegram();
  runDailySummary()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('Daily summary failed:', err);
      process.exit(1);
    });
}

module.exports = { runDailySummary };
