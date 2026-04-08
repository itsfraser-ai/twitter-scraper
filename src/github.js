// GitHub: pushes the daily markdown report to the fraserai repo.
// Uses the GitHub Contents API (a simple REST endpoint) with built-in fetch.
// No extra dependencies needed — Node 18+ has fetch built in.
//
// Flow:
// 1. Check if today's file already exists (need its SHA to update it)
// 2. PUT the file (create or update)
//
// If this fails, it's not critical — the markdown can be pushed
// next day or manually. The scraper keeps running regardless.

const { isTestMode } = require('./config');

async function pushMarkdown(markdown, date) {
  const token = process.env.GITHUB_TOKEN;
  const repo = process.env.GITHUB_REPO || 'fraserkemp/fraserai';

  if (!token) {
    console.warn('Missing GITHUB_TOKEN — skipping GitHub push');
    return;
  }

  const path = `research/twitter-scraper/${date}-twitter.md`;

  if (isTestMode) {
    console.log(`\n[TEST] Would push to ${repo}/${path}`);
    console.log(`[TEST] Content preview: ${markdown.substring(0, 200)}...`);
    return;
  }

  try {
    // Step 1: Check if file exists (we need the SHA to update it).
    // If it doesn't exist, the API returns 404 — that's fine, means we'll create it.
    const apiBase = `https://api.github.com/repos/${repo}/contents/${path}`;
    const headers = {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github.v3+json',
      'User-Agent': 'twitter-scraper',
    };

    let sha = null;
    const existingRes = await fetch(apiBase, { headers });
    if (existingRes.ok) {
      const existing = await existingRes.json();
      sha = existing.sha; // Need this to update an existing file
    }

    // Step 2: PUT the file (creates if new, updates if exists)
    // Content must be base64 encoded — that's how the GitHub API works
    const body = {
      message: `chore: twitter research ${date}`,
      content: Buffer.from(markdown).toString('base64'),
    };
    if (sha) body.sha = sha; // Include SHA only if updating

    const putRes = await fetch(apiBase, {
      method: 'PUT',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!putRes.ok) {
      const err = await putRes.json();
      throw new Error(err.message || `GitHub API returned ${putRes.status}`);
    }

    console.log(`Pushed daily markdown to ${repo}/${path}`);
  } catch (err) {
    console.error('GitHub push failed:', err.message);
    // Don't throw — this failure shouldn't stop the rest of the pipeline
  }
}

module.exports = { pushMarkdown };
