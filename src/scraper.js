// Scraper: fetches tweets from Twitter/X via a scraping service.
//
// Built as a "factory" — createScraper('socialdata') returns an object with a
// search() method. The rest of the app doesn't know or care which provider
// is behind it. To swap providers, change one line in index.js.

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// --- SocialData.tools Implementation ---
// Simple REST API: one call, instant results. $9/mo flat rate.
// Docs: https://docs.socialdata.tools/reference/get-search-results/

function createSocialDataScraper() {
  const apiKey = process.env.SOCIALDATA_API_KEY;
  if (!apiKey) throw new Error('Missing SOCIALDATA_API_KEY in .env');

  async function search(keyword, options = {}) {
    try {
      const query = encodeURIComponent(keyword);
      const url = `https://api.socialdata.tools/twitter/search?query=${query}&type=Latest`;

      const res = await fetch(url, {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          Accept: 'application/json',
        },
      });

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`SocialData API ${res.status}: ${errText}`);
      }

      const data = await res.json();
      const tweets = data.tweets || [];

      return tweets
        .filter((t) => !t.retweeted_status) // Skip retweets — we want originals
        .map((t) => normalizeSocialDataTweet(t, keyword))
        .filter(Boolean);
    } catch (err) {
      console.error(`Scraper error for "${keyword}":`, err.message);
      return []; // Return empty — don't crash the whole run for one keyword
    }
  }

  return { search };
}

// Convert SocialData's tweet format to our standard shape.
// SocialData returns Twitter's native format, which is well-documented.
function normalizeSocialDataTweet(tweet, searchTerm) {
  try {
    const user = tweet.user || {};

    return {
      tweetId: tweet.id_str || String(tweet.id),
      authorHandle: user.screen_name || 'unknown',
      authorName: user.name || null,
      authorFollowers: user.followers_count || 0,
      text: tweet.full_text || tweet.text || '',
      url: `https://x.com/${user.screen_name}/status/${tweet.id_str || tweet.id}`,
      createdAt: tweet.tweet_created_at || tweet.created_at || null,
      likeCount: tweet.favorite_count || 0,
      retweetCount: tweet.retweet_count || 0,
      replyCount: tweet.reply_count || 0,
      viewCount: tweet.views_count || tweet.view_count || 0,
      searchTerm,
    };
  } catch (err) {
    console.error('Failed to normalize tweet:', err.message);
    return null;
  }
}

// --- Apify Implementation (kept as backup) ---

function createApifyScraper() {
  const { ApifyClient } = require('apify-client');
  const token = process.env.APIFY_TOKEN;
  if (!token) throw new Error('Missing APIFY_TOKEN in .env');

  const client = new ApifyClient({ token });

  async function search(keyword, options = {}) {
    const maxTweets = options.maxTweets || 20;
    try {
      const run = await client.actor('apidojo/tweet-scraper').call({
        searchTerms: [keyword],
        maxTweets,
        sort: 'Latest',
      });
      const { items } = await client.dataset(run.defaultDatasetId).listItems();
      return items.map((item) => normalizeApifyTweet(item, keyword)).filter(Boolean);
    } catch (err) {
      console.error(`Scraper error for "${keyword}":`, err.message);
      return [];
    }
  }

  return { search };
}

function normalizeApifyTweet(item, searchTerm) {
  try {
    const user = item.author || item.user || {};
    return {
      tweetId: item.id || item.id_str || item.tweetId,
      authorHandle: user.userName || user.screen_name || user.username || 'unknown',
      authorName: user.name || user.displayName || null,
      authorFollowers: user.followers || user.followers_count || user.followersCount || 0,
      text: item.text || item.full_text || item.tweetText || '',
      url: item.url || item.tweetUrl || (item.id ? `https://x.com/i/status/${item.id}` : null),
      createdAt: item.createdAt || item.created_at || item.date || null,
      likeCount: item.likeCount || item.favorite_count || item.likes || 0,
      retweetCount: item.retweetCount || item.retweet_count || item.retweets || 0,
      replyCount: item.replyCount || item.reply_count || item.replies || 0,
      viewCount: item.viewCount || item.views?.count || item.impressions || 0,
      searchTerm,
    };
  } catch (err) {
    console.error('Failed to normalize tweet:', err.message);
    return null;
  }
}

// --- Factory ---
// Switch provider by changing the argument in index.js.
// 'socialdata' = SocialData.tools ($9/mo flat rate, instant results)
// 'apify' = Apify (requires paid plan, job-based)

function createScraper(provider = 'socialdata') {
  switch (provider) {
    case 'socialdata':
      return createSocialDataScraper();
    case 'apify':
      return createApifyScraper();
    default:
      throw new Error(`Unknown scraper provider: ${provider}`);
  }
}

// Convenience: search all keywords, dedup results, return one big array.
// Adds a small delay between searches to be polite to the API.
async function scrapeAll(scraper, keywords) {
  const allTweets = [];
  const seenIds = new Set();

  for (const keyword of keywords) {
    console.log(`Searching: "${keyword}"...`);
    const tweets = await scraper.search(keyword);

    for (const tweet of tweets) {
      if (tweet.tweetId && !seenIds.has(tweet.tweetId)) {
        seenIds.add(tweet.tweetId);
        allTweets.push(tweet);
      }
    }

    // Small delay between API calls — don't hammer the service
    if (keywords.indexOf(keyword) < keywords.length - 1) {
      await sleep(1500);
    }
  }

  console.log(`Scraped ${allTweets.length} unique tweets from ${keywords.length} keywords`);
  return allTweets;
}

module.exports = { createScraper, scrapeAll };
