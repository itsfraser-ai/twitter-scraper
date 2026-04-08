# Twitter/X Research Scraper

## What This Is

A standalone Node.js app that scrapes trending AI tweets every 45 minutes, scores them, stores in Supabase, and pushes the best ones to Telegram. Generates a daily markdown summary that feeds into Fraser's content pipeline at `fraserai/research/twitter-scraper/`.

**This is the missing "fountainhead" in Fraser's content system.** GitHub trending is already automated (daily launchd script). YouTube research works via `/yt-pipeline`. But Twitter/X is where AI topics break first — Karpathy's Obsidian RAG tweet, new Claude features, viral agentic coding demos. This catches those signals before competitors.

Based on Chase's Twitter scraper system (from his content pipeline video).

## Architecture

```
Node.js app on Hostinger VPS (node-cron scheduling, 45 min + random jitter)
        ↓
Apify Tweet Scraper → keyword search → 40-90 tweets per run
        ↓
Score (5 dimensions) → Softmax select top 3-5
        ↓
Store in Supabase (dedup by tweet_id) → Send to Telegram
        ↓ end of day (10pm)
Generate daily markdown → Push to fraserai GitHub repo via API
        ↓ next morning
Fraser's Mac: git pull → research/twitter-scraper/YYYY-MM-DD-twitter.md
        ↓
/fraser:standup reads it → "Want to push any into /yt-pipeline?"
        ↓
/yt-pipeline "topic" → NotebookLM deep research → /ideation → video ideas
```

**Pure Node.js. No n8n dependency.** The VPS runs n8n separately — this scraper is independent.

## Stack

- **Runtime:** Node.js (18+)
- **Scraping:** Apify `apidojo~tweet-scraper` actor (existing credentials). Abstracted behind interface — can swap to SocialData.tools ($9/mo flat) if Apify costs > $15/mo.
- **Database:** Supabase (instance: `qkbyyhsgvcfbjosuwmrr.supabase.co`, free tier)
- **Notifications:** Telegram bot (`node-telegram-bot-api`)
- **Scheduling:** `node-cron` (45 min interval + 0-10 min random jitter)
- **Process management:** pm2 on VPS
- **Vault sync:** GitHub API to push daily markdown to `fraserai` repo

## Project Structure

```
twitter-scraper/
├── package.json
├── index.js                # Main entry: scrape → score → select → store → telegram
├── daily-summary.js        # End-of-day: aggregate day's tweets → markdown → GitHub push
├── src/
│   ├── scraper.js          # Apify API calls (keyword search, tweet fetching)
│   ├── scorer.js           # 5-dimensional scoring + softmax probability
│   ├── storage.js          # Supabase client (upsert with dedup, queries)
│   ├── selector.js         # Softmax weighted random selection (temperature 1.5)
│   ├── telegram.js         # Telegram bot message formatting + sending
│   ├── markdown.js         # Obsidian-compatible daily report generation
│   ├── github.js           # GitHub API — push markdown to fraserai repo
│   └── config.js           # Keywords (tiered), scoring weights, thresholds
├── .env                    # API keys (see Environment Variables below)
├── .env.example            # Template for .env
├── .gitignore
├── CLAUDE.md               # This file
└── README.md
```

## Environment Variables

```
APIFY_TOKEN=               # Existing Apify credentials
SUPABASE_URL=https://qkbyyhsgvcfbjosuwmrr.supabase.co
SUPABASE_KEY=              # Service role key (not anon key)
TELEGRAM_BOT_TOKEN=        # From @BotFather
TELEGRAM_CHAT_ID=          # Private channel or DM chat ID
GITHUB_TOKEN=              # Personal access token with repo write access
GITHUB_REPO=itsfraser-ai/fraserai   # Target repo for daily markdown push
```

## Dependencies

```json
{
  "@supabase/supabase-js": "latest",
  "node-cron": "latest",
  "node-telegram-bot-api": "latest",
  "apify-client": "latest"
}
```

## Supabase Schema

### Table: `tweets`
```sql
CREATE TABLE tweets (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tweet_id          text UNIQUE NOT NULL,
  author_handle     text NOT NULL,
  author_name       text,
  author_followers  integer,
  tweet_text        text NOT NULL,
  tweet_url         text,
  created_at        timestamptz,
  scraped_at        timestamptz DEFAULT now(),
  like_count        integer DEFAULT 0,
  retweet_count     integer DEFAULT 0,
  reply_count       integer DEFAULT 0,
  view_count        bigint DEFAULT 0,
  search_term       text,
  score_velocity    float,
  score_authority   float,
  score_timing      float,
  score_opportunity float,
  score_replyability float,
  score_total       float,
  softmax_prob      float,
  selected          boolean DEFAULT false,
  notified          boolean DEFAULT false
);

CREATE INDEX idx_tweets_tweet_id ON tweets(tweet_id);
CREATE INDEX idx_tweets_scraped_at ON tweets(scraped_at);
CREATE INDEX idx_tweets_score_total ON tweets(score_total);
```

### Table: `scrape_runs`
```sql
CREATE TABLE scrape_runs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  started_at      timestamptz DEFAULT now(),
  completed_at    timestamptz,
  tweets_scraped  integer,
  tweets_new      integer,
  tweets_selected integer,
  status          text DEFAULT 'running',
  error_message   text
);
```

### Table: `replies` (v2 — schema only, don't build logic yet)
```sql
CREATE TABLE replies (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tweet_id        text REFERENCES tweets(tweet_id),
  suggested_reply text,
  reply_model     text,
  approved        boolean,
  posted          boolean DEFAULT false,
  posted_at       timestamptz,
  engagement      jsonb,
  created_at      timestamptz DEFAULT now()
);
```

## Search Keywords (tiered rotation)

**Tier 1 — Core niche (every run):**
- `Claude Code`, `Codex CLI`, `Gemini Code`, `agentic coding`, `vibe coding`
- `GitHub trending`, `GitHub repo`, `open source AI`, `new AI repo`
- `AI agent`, `AI automation`, `RAG`

**Tier 2 — AI dev tools (rotate through):**
- `cursor AI`, `windsurf AI`, `GitHub Copilot`, `AI coding`
- `agentic workflow`, `LLM app`, `AI tool launch`
- `open source`, `new repository`, `AI library`

**Tier 3 — Trend-catching (broad, used sparingly):**
- `AI viral`, `AI announcement`, `new AI model`

Strategy: Always search all Tier 1 keywords. Rotate through Tier 2/3 each run to stay within Apify budget.

## Scoring Algorithm

Each tweet scored 0-10 on 5 dimensions:

| Dimension | What it measures | Weight |
|-----------|-----------------|--------|
| Velocity | Engagement rate relative to follower count, time-decayed | 0.25 |
| Authority | Follower tier (100K+=10, 50K+=8, 10K+=6, 1K+=4, below=2) + verified bonus | 0.15 |
| Timing | Exponential decay: `10 * exp(-age_hours / 12)`. Tweets >24h score near zero | 0.25 |
| Opportunity | Keyword relevance to content gaps (configurable keyword-to-score mapping) | 0.20 |
| Replyability | Questions (+3), hot takes (+2), tool mentions (+2), opinions (+3), threads (+1). Cap 10 | 0.15 |

**Composite:** `total = 0.25*velocity + 0.15*authority + 0.25*timing + 0.20*opportunity + 0.15*replyability`

**Softmax selection:** Top-N scores → `softmax(scores / temperature)` where temperature=1.5. Sample 3-5 tweets without replacement. This avoids always picking #1 — adds enough randomization to surface surprising finds.

## Telegram Message Format

```
🔥 Twitter Research Alert

1. @karpathy (3.2M) — Score: 9.1
   "Just open-sourced my Obsidian RAG setup..."
   V:9.2 | A:8.0 | T:9.5 | O:9.0 | R:8.5
   🔗 https://x.com/karpathy/status/...

2. @svpino (85K) — Score: 8.4
   "Claude Code + Codex side by side..."
   V:8.8 | A:6.5 | T:9.0 | O:8.2 | R:7.8
   🔗 https://x.com/svpino/status/...

📊 67 scraped, 42 new, 5 selected
```

Errors: `⚠️ Scraper failed: [error message]`

## Daily Markdown Output Format

Pushed to `fraserai` repo at `research/twitter-scraper/YYYY-MM-DD-twitter.md`:

```markdown
---
date: YYYY-MM-DD
type: twitter-research
---

# Twitter Research — YYYY-MM-DD

## Top Tweets Today

1. **@handle** (followers) — Score: X.X
   > "Tweet text..."
   - Search term: "keyword"
   - 🔗 link

## Trending Themes
- Theme 1 (N high-scoring tweets)
- Theme 2

## Suggested Research
Topics worth pushing into `/yt-pipeline`:
- `topic` — N tweets, avg score X.X

## Stats
- Scraped: N | New: N | Runs: N
- Top keywords: keyword (N), keyword (N)
```

## Deployment

**Target:** Hostinger VPS (already running self-hosted n8n — this is separate)

```bash
# On VPS
cd /opt
git clone git@github.com:fraserkemp/twitter-scraper.git
cd twitter-scraper
npm install
cp .env.example .env
# Fill in .env with actual credentials
node index.js --test    # Dry run
pm2 start index.js --name twitter-scraper
pm2 save
pm2 startup             # Auto-start on reboot
```

## Build Order

1. **Supabase tables** — Run the SQL above in Supabase dashboard
2. **Telegram bot** — Create via @BotFather, get token + chat ID
3. **config.js** — Keywords, weights, thresholds
4. **storage.js** — Supabase client (upsert with ON CONFLICT DO NOTHING, queries)
5. **scraper.js** — Apify integration (keyword search, tweet parsing)
6. **scorer.js** — 5-dimensional scoring
7. **selector.js** — Softmax weighted random selection
8. **telegram.js** — Message formatting + sending
9. **markdown.js** — Daily report generation
10. **github.js** — Push markdown to fraserai repo via GitHub API
11. **index.js** — Main orchestrator (scrape → score → select → store → notify)
12. **daily-summary.js** — End-of-day aggregation + push
13. **node-cron scheduling** — Wire up 45-min + jitter + end-of-day triggers
14. Test locally with `--test` flag
15. Deploy to VPS with pm2

## Integration with fraserai (separate repo)

After this scraper is running, update `/fraser:standup` in the fraserai project:
- Add `research/twitter-scraper/` to Step 1 read list
- Add "Twitter Trending" section to the daily briefing
- Add prompt: "Any of these worth deep-diving? I can run `/yt-pipeline` on them."
- If Fraser picks topics → run `/yt-pipeline "topic"` for each

## v2 Scope (defer — needs 2-4 weeks of data first)
- Reply suggestions via Claude API
- Reply posting via Twitter API (credentials exist in fraserai project)
- Reply quality tracking + feedback loop
- Theme clustering (LLM trend detection across days)
- Scoring weight auto-tuning from engagement data
- Optional thought_leaders table for profile-specific tracking

## Rules
- Keep the scraper abstracted — swapping Apify for another API should be a config change
- All tweets deduped by `tweet_id` (Supabase UNIQUE constraint + ON CONFLICT DO NOTHING)
- Never store API keys in code — always `.env`
- Daily markdown format must match what `/ideation` in fraserai expects (see format above)
- Monitor Apify costs week 1 — switch to SocialData.tools if > $15/mo
- **Learning mode:** Fraser is learning as we build. When he asks questions, update `learning.md` with the concepts explained. Keep explanations in plain language with practical examples. This file persists across sessions so concepts don't need to be re-explained.
