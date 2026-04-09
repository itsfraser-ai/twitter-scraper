// Main entry point: the conductor that orchestrates the whole scraper.
//
// Usage:
//   node index.js              → Runs on schedule (every 45 min + daily summary)
//   node index.js --once       → Single run, then exits
//   node index.js --test       → Dry run (console output, no external writes)
//   node index.js --test --once → Single dry run

require('dotenv').config(); // Load .env file into process.env

const cron = require('node-cron');
const { isTestMode, getKeywordsForRun, schedule, filters } = require('./src/config');
const { initSupabase, upsertTweets, markSelected, markNotified, createScrapeRun, completeScrapeRun } = require('./src/storage');
const { createScraper, scrapeAll } = require('./src/scraper');
const { scoreTweets } = require('./src/scorer');
const { selectTweets } = require('./src/selector');
const { initTelegram, sendAlert, sendError } = require('./src/telegram');
const { runDailySummary } = require('./daily-summary');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// --- Main scrape job ---
// This is what runs every 45 minutes (or once with --once).
// Each step feeds into the next: scrape → score → store → select → notify.

async function runScrapeJob(scraper) {
  const runId = await createScrapeRun();

  try {
    // 1. Decide which keywords to search this run
    const keywords = getKeywordsForRun();
    console.log(`\nStarting scrape run with ${keywords.length} keywords...`);

    // 2. Fetch tweets from Twitter via Apify
    const rawTweets = await scrapeAll(scraper, keywords);

    if (rawTweets.length === 0) {
      console.log('No tweets found this run');
      await completeScrapeRun(runId, { scraped: 0, new: 0, selected: 0, status: 'completed' });
      return;
    }

    // 2b. Filter out noise — small accounts and low-engagement tweets
    // Without this, a 13-follower account with 1 like gets a higher
    // velocity score than Karpathy with 5,000 likes (ratio vs absolute)
    const filtered = rawTweets.filter((t) => {
      const engagement = (t.likeCount || 0) + (t.retweetCount || 0) + (t.replyCount || 0);
      return t.authorFollowers >= filters.minFollowers && engagement >= filters.minEngagement;
    });
    console.log(`Filtered: ${rawTweets.length} → ${filtered.length} (removed ${rawTweets.length - filtered.length} low-quality)`);

    // 3. Score every tweet on 5 dimensions
    const scoredTweets = scoreTweets(filtered);

    // 4. Store in Supabase (duplicates auto-skipped via ON CONFLICT)
    const { inserted, duplicates } = await upsertTweets(scoredTweets);
    console.log(`Stored: ${inserted} new, ${duplicates} duplicates skipped`);

    // 5. Pick 3-5 best tweets using softmax selection
    const selected = selectTweets(scoredTweets);

    if (selected.length > 0) {
      // Mark which tweets were selected and update their softmax probs in DB
      const selectedIds = selected.map((t) => t.tweetId);
      await markSelected(selectedIds);

      // 6. Send Telegram notification
      await sendAlert(selected, {
        scraped: rawTweets.length,
        new: inserted,
        selected: selected.length,
      });
      await markNotified(selectedIds);
    }

    // Update the scrape_runs record
    await completeScrapeRun(runId, {
      scraped: rawTweets.length,
      new: inserted,
      selected: selected.length,
      status: 'completed',
    });

    console.log(`Run complete: ${rawTweets.length} scraped, ${inserted} new, ${selected.length} selected\n`);
  } catch (err) {
    console.error('Scrape run failed:', err.message);
    await completeScrapeRun(runId, { status: 'error', error: err.message });
    await sendError(err.message);
  }
}

// --- Startup ---

async function main() {
  const isOnce = process.argv.includes('--once');

  if (isTestMode) console.log('🧪 Running in TEST mode (no external writes)\n');

  // Initialize services
  initSupabase();
  initTelegram();
  const scraper = createScraper('socialdata');

  if (isOnce) {
    // Single run mode: scrape once and exit
    await runScrapeJob(scraper);
    process.exit(0);
  }

  // --- Scheduled mode ---
  // Run immediately on startup, then every 45 minutes with random jitter.

  console.log('Twitter scraper starting...');
  console.log(`Schedule: every ${schedule.intervalMinutes}min (±${schedule.jitterMinutes}min jitter)`);
  console.log(`Daily summary: ${schedule.dailySummaryHour}:00`);
  console.log('');

  // Run once right away
  await runScrapeJob(scraper);

  // Cron: once per hour with random jitter to vary request timing
  cron.schedule('0 * * * *', async () => {
    const jitter = Math.random() * schedule.jitterMinutes * 60 * 1000;
    console.log(`Cron fired, waiting ${Math.round(jitter / 1000)}s jitter...`);
    await sleep(jitter);
    await runScrapeJob(scraper);
  });

  // Cron: daily summary at 10pm
  cron.schedule(`0 ${schedule.dailySummaryHour} * * *`, async () => {
    console.log('Running daily summary...');
    await runDailySummary();
  });

  console.log('Scraper running. Ctrl+C to stop.');
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
