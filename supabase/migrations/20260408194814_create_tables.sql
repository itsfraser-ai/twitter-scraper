-- Table 1: tweets
-- Every tweet we scrape goes here. One row per tweet.
-- tweet_id is UNIQUE so the same tweet can never be stored twice.
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

-- Table 2: scrape_runs
-- A log of every time the scraper runs. Like a receipt.
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

-- Table 3: replies (v2 — schema only, no logic yet)
-- Ready for when we build reply suggestions later.
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
