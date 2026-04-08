# Twitter/X Research Scraper

A Node.js app that automatically scrapes trending AI tweets, scores them on 5 dimensions, and sends the best ones to your Telegram. Generates daily markdown summaries for your content pipeline.

Built to catch trending AI topics before competitors — new tools, viral demos, hot takes, and breaking announcements.

## What It Does

Every 45 minutes, the scraper:

1. **Searches Twitter/X** for tweets matching your keywords (via SocialData.tools API)
2. **Scores each tweet** on 5 dimensions: Velocity, Authority, Timing, Opportunity, Replyability
3. **Filters out noise** — minimum follower count and engagement thresholds
4. **Picks 3-5 winners** using softmax weighted random selection (not just the top scorers — adds controlled randomness to surface surprising finds)
5. **Stores everything** in Supabase (with automatic deduplication)
6. **Sends a Telegram alert** with the best tweets and their scores

At 10pm daily, it generates an Obsidian-compatible markdown summary and pushes it to your GitHub repo.

## Quick Start

### Prerequisites

- **Node.js 18+** installed
- A **SocialData.tools** account ($9/mo flat rate) — [socialdata.tools](https://socialdata.tools)
- A **Supabase** project (free tier works) — [supabase.com](https://supabase.com)
- A **Telegram bot** (free) — create via [@BotFather](https://t.me/BotFather)
- A **GitHub personal access token** (for daily markdown push)

### 1. Clone and Install

```bash
git clone https://github.com/fraserkemp/twitter-scraper.git
cd twitter-scraper
npm install
```

### 2. Set Up Supabase

Create a new Supabase project, then link and push the migration:

```bash
supabase link --project-ref YOUR_PROJECT_REF
supabase db push
```

This creates three tables: `tweets`, `scrape_runs`, and `replies` (replies is for future use).

Alternatively, copy the SQL from `supabase/migrations/` and run it manually in the Supabase SQL editor.

### 3. Create a Telegram Bot

1. Open Telegram and message [@BotFather](https://t.me/BotFather)
2. Send `/newbot` and follow the prompts
3. Copy the **bot token** it gives you
4. Send any message to your new bot
5. Visit `https://api.telegram.org/bot<YOUR_TOKEN>/getUpdates` in your browser
6. Find `"chat":{"id": 123456789}` in the response — that's your chat ID

### 4. Configure Environment Variables

```bash
cp .env.example .env
```

Fill in your `.env`:

```
SOCIALDATA_API_KEY=          # From socialdata.tools dashboard
SUPABASE_URL=                # Your Supabase project URL (https://xxxxx.supabase.co)
SUPABASE_KEY=                # Service role key (Settings → API → service_role)
TELEGRAM_BOT_TOKEN=          # From @BotFather
TELEGRAM_CHAT_ID=            # From the getUpdates step above
GITHUB_TOKEN=                # Personal access token with Contents: read/write on target repo
GITHUB_REPO=your-user/your-repo  # Repo where daily markdown gets pushed
```

### 5. Test It

```bash
# Dry run — searches Twitter, scores tweets, shows what Telegram message
# would look like. Doesn't write to Supabase or send messages.
node index.js --test --once

# Single live run — actually stores in Supabase and sends to Telegram
node index.js --once
```

### 6. Deploy (Run 24/7)

On your server (VPS, EC2, etc.):

```bash
npm install -g pm2
pm2 start index.js --name twitter-scraper
pm2 save
pm2 startup    # Auto-restart on server reboot
```

The scraper will run every 45 minutes (with random jitter) and send a daily summary at 10pm.

## How Scoring Works

Each tweet is scored 0-10 on five dimensions:

| Dimension | Weight | What It Measures |
|-----------|--------|-----------------|
| **Velocity** | 25% | Engagement rate relative to follower count — is this tweet blowing up? |
| **Authority** | 15% | Follower count tiers (100K+ = 10, 50K+ = 8, 10K+ = 6, 1K+ = 4) |
| **Timing** | 25% | Freshness — exponential decay, tweets older than 24h score near zero |
| **Opportunity** | 20% | How relevant is this to your content gaps? (configurable per keyword) |
| **Replyability** | 15% | Questions, hot takes, tool mentions, opinions — how easy to engage with? |

The final score is a weighted combination. Then **softmax selection** (temperature 1.5) picks 3-5 tweets with controlled randomness — high scorers are favoured but occasional surprises get through.

## Customisation

### Keywords

Edit `src/config.js` to change what you're tracking:

- **Tier 1** — searched every run (your core niche)
- **Tier 2** — rotated through, a few per run (broader topics)
- **Tier 3** — one per run (trend-catching, broad terms)

### Quality Filters

In `src/config.js`, adjust `filters`:

```javascript
const filters = {
  minFollowers: 500,    // Skip accounts smaller than this
  minEngagement: 5,     // Skip tweets with fewer than 5 likes+RTs+replies
};
```

### Scoring Weights

Adjust `scoring.weights` in `src/config.js` to prioritise different dimensions. Weights must add up to 1.0.

### Opportunity Keywords

The `opportunityKeywords` map in `src/config.js` controls how relevant each search term is to your content. Higher score = more aligned with gaps in your content.

## Project Structure

```
twitter-scraper/
├── index.js              # Main entry: scrape → score → filter → select → store → notify
├── daily-summary.js      # End-of-day: aggregate → markdown → GitHub push
├── src/
│   ├── config.js         # Keywords, scoring weights, filters, thresholds
│   ├── scraper.js        # SocialData API (swappable — factory pattern)
│   ├── scorer.js         # 5-dimensional scoring algorithm
│   ├── selector.js       # Softmax weighted random selection
│   ├── storage.js        # Supabase client (upsert, dedup, queries)
│   ├── telegram.js       # Telegram message formatting + sending
│   ├── markdown.js       # Obsidian-compatible daily report generation
│   └── github.js         # GitHub API — push markdown to repo
├── supabase/
│   └── migrations/       # Database schema (run via supabase db push)
├── .env.example          # Environment variable template
├── CLAUDE.md             # Full spec and architecture docs
└── learning.md           # Concepts explained during the build
```

## Swapping the Scraper Provider

The scraper uses a factory pattern — the rest of the app doesn't know or care which API provides tweets. To switch from SocialData to another provider:

1. Add a new implementation in `src/scraper.js` (implement the `search(keyword)` method)
2. Add a case to the `createScraper()` factory
3. Change one line in `index.js`

The Apify implementation is already included as a backup.

## CLI Flags

```bash
node index.js              # Run on schedule (every 45min + daily summary at 10pm)
node index.js --once       # Single run, then exit
node index.js --test       # Dry run (console output, no writes)
node index.js --test --once # Single dry run

node daily-summary.js       # Generate and push today's summary now
node daily-summary.js --test # Preview the summary without pushing
```

## Monitoring

If running with pm2:

```bash
pm2 status                    # Check if scraper is running
pm2 logs twitter-scraper      # Watch live logs
pm2 logs twitter-scraper --lines 50 --nostream  # Last 50 log lines
```

## Daily Markdown Output

Each day, a markdown file is pushed to your GitHub repo at `research/twitter-scraper/YYYY-MM-DD-twitter.md` containing:

- Top tweets with scores and links
- Trending themes (grouped by keyword)
- Suggested research topics
- Daily stats

## Credits

Based on Chase's Twitter scraper system from his content pipeline video. Built with Claude Code.

## License

MIT
