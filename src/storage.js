// Storage: all Supabase interactions live here.
// This is the only file that talks to the database.
// In test mode, writes are logged to console instead.

const { createClient } = require('@supabase/supabase-js');
const { isTestMode } = require('./config');

let supabase = null;

// Call once at startup. Creates the Supabase client using your env vars.
function initSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_KEY;

  if (!url || !key) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_KEY in .env');
  }

  supabase = createClient(url, key);
  console.log('Supabase client initialized');
  return supabase;
}

// Store an array of scored tweets.
// Uses upsert with "on conflict do nothing" — if the tweet_id already exists,
// it silently skips that row. Returns count of inserted vs skipped.
async function upsertTweets(tweets) {
  if (isTestMode) {
    console.log(`[TEST] Would upsert ${tweets.length} tweets`);
    return { inserted: tweets.length, duplicates: 0 };
  }

  // Map our internal tweet objects to the database column names
  const rows = tweets.map(t => ({
    tweet_id: t.tweetId,
    author_handle: t.authorHandle,
    author_name: t.authorName,
    author_followers: t.authorFollowers,
    tweet_text: t.text,
    tweet_url: t.url,
    created_at: t.createdAt,
    like_count: t.likeCount,
    retweet_count: t.retweetCount,
    reply_count: t.replyCount,
    view_count: t.viewCount,
    search_term: t.searchTerm,
    score_velocity: t.score_velocity,
    score_authority: t.score_authority,
    score_timing: t.score_timing,
    score_opportunity: t.score_opportunity,
    score_replyability: t.score_replyability,
    score_total: t.score_total,
    softmax_prob: t.softmax_prob || null,
  }));

  const { data, error } = await supabase
    .from('tweets')
    .upsert(rows, { onConflict: 'tweet_id', ignoreDuplicates: true })
    .select();

  if (error) {
    console.error('Supabase upsert error:', error.message);
    throw error;
  }

  const inserted = data ? data.length : 0;
  return { inserted, duplicates: rows.length - inserted };
}

// Mark tweets as "selected" (chosen by the softmax selector)
async function markSelected(tweetIds) {
  if (isTestMode) {
    console.log(`[TEST] Would mark ${tweetIds.length} tweets as selected`);
    return;
  }

  const { error } = await supabase
    .from('tweets')
    .update({ selected: true })
    .in('tweet_id', tweetIds);

  if (error) console.error('Failed to mark selected:', error.message);
}

// Mark tweets as "notified" (Telegram message sent)
async function markNotified(tweetIds) {
  if (isTestMode) {
    console.log(`[TEST] Would mark ${tweetIds.length} tweets as notified`);
    return;
  }

  const { error } = await supabase
    .from('tweets')
    .update({ notified: true })
    .in('tweet_id', tweetIds);

  if (error) console.error('Failed to mark notified:', error.message);
}

// Create a scrape_runs row when a job starts. Returns the run ID.
async function createScrapeRun() {
  if (isTestMode) {
    console.log('[TEST] Would create scrape run');
    return 'test-run-id';
  }

  const { data, error } = await supabase
    .from('scrape_runs')
    .insert({ status: 'running' })
    .select('id')
    .single();

  if (error) {
    console.error('Failed to create scrape run:', error.message);
    throw error;
  }

  return data.id;
}

// Update the scrape_runs row when a job finishes (success or error).
async function completeScrapeRun(runId, stats) {
  if (isTestMode) {
    console.log(`[TEST] Would complete scrape run:`, stats);
    return;
  }

  const { error } = await supabase
    .from('scrape_runs')
    .update({
      completed_at: new Date().toISOString(),
      tweets_scraped: stats.scraped || 0,
      tweets_new: stats.new || 0,
      tweets_selected: stats.selected || 0,
      status: stats.status || 'completed',
      error_message: stats.error || null,
    })
    .eq('id', runId);

  if (error) console.error('Failed to complete scrape run:', error.message);
}

// Get all tweets scraped today, ordered by score (best first).
// Used by the daily summary to know what to include in the report.
async function getTodaysTweets() {
  const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

  const { data, error } = await supabase
    .from('tweets')
    .select('*')
    .gte('scraped_at', `${today}T00:00:00Z`)
    .lt('scraped_at', `${today}T23:59:59Z`)
    .order('score_total', { ascending: false });

  if (error) {
    console.error('Failed to get today\'s tweets:', error.message);
    return [];
  }

  return data || [];
}

// Aggregate today's scrape run stats for the daily summary.
async function getTodaysRunStats() {
  const today = new Date().toISOString().split('T')[0];

  const { data, error } = await supabase
    .from('scrape_runs')
    .select('*')
    .gte('started_at', `${today}T00:00:00Z`)
    .lt('started_at', `${today}T23:59:59Z`);

  if (error) {
    console.error('Failed to get run stats:', error.message);
    return { runs: 0, totalScraped: 0, totalNew: 0 };
  }

  const runs = data || [];
  return {
    runs: runs.length,
    totalScraped: runs.reduce((sum, r) => sum + (r.tweets_scraped || 0), 0),
    totalNew: runs.reduce((sum, r) => sum + (r.tweets_new || 0), 0),
  };
}

module.exports = {
  initSupabase,
  upsertTweets,
  markSelected,
  markNotified,
  createScrapeRun,
  completeScrapeRun,
  getTodaysTweets,
  getTodaysRunStats,
};
