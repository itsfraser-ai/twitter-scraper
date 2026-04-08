// Telegram: formats and sends messages to your Telegram bot.
// In test mode, prints to console instead of sending.
//
// Uses HTML parse mode (not Markdown) because tweet text often contains
// underscores, asterisks, and other characters that break Telegram's
// Markdown parser. HTML mode is more predictable.

const TelegramBot = require('node-telegram-bot-api');
const { isTestMode } = require('./config');

let bot = null;
let chatId = null;

function initTelegram() {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  chatId = process.env.TELEGRAM_CHAT_ID;

  if (!token || !chatId) {
    console.warn('Missing TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID — Telegram disabled');
    return;
  }

  // { polling: false } — we only send messages, never receive.
  // No need to listen for incoming messages from users.
  bot = new TelegramBot(token, { polling: false });
  console.log('Telegram bot initialized');
}

// Send the main research alert with selected tweets.
async function sendAlert(selectedTweets, stats) {
  if (!selectedTweets.length) return;

  let message = '🔥 <b>Twitter Research Alert</b>\n\n';

  selectedTweets.forEach((tweet, i) => {
    const followers = formatFollowers(tweet.authorFollowers);
    const text = escapeHtml(truncate(tweet.text, 120));

    message += `${i + 1}. <b>@${escapeHtml(tweet.authorHandle)}</b> (${followers}) — Score: ${tweet.score_total}\n`;
    message += `   "${text}"\n`;
    message += `   V:${tweet.score_velocity} | A:${tweet.score_authority} | T:${tweet.score_timing} | O:${tweet.score_opportunity} | R:${tweet.score_replyability}\n`;
    if (tweet.url) {
      message += `   🔗 ${tweet.url}\n`;
    }
    message += '\n';
  });

  message += `📊 ${stats.scraped} scraped, ${stats.new} new, ${stats.selected} selected`;

  await send(message);
}

// Send an error notification so you know something broke.
async function sendError(errorMessage) {
  const message = `⚠️ <b>Scraper failed:</b> ${escapeHtml(errorMessage)}`;
  await send(message);
}

// Send a short daily summary notification.
async function sendDailySummary(text) {
  await send(text);
}

// --- Internal helpers ---

async function send(message) {
  // Safety: Telegram has a 4096 character limit per message
  if (message.length > 4000) {
    message = message.substring(0, 3997) + '...';
  }

  if (isTestMode || !bot) {
    console.log('\n--- Telegram Message (test mode) ---');
    console.log(message);
    console.log('--- End ---\n');
    return;
  }

  try {
    await bot.sendMessage(chatId, message, { parse_mode: 'HTML' });
  } catch (err) {
    // Telegram failures should never crash the scraper
    console.error('Telegram send failed:', err.message);
  }
}

// Make numbers human-readable: 3200000 → "3.2M", 85000 → "85K"
function formatFollowers(count) {
  if (!count) return '0';
  if (count >= 1000000) return `${(count / 1000000).toFixed(1)}M`;
  if (count >= 1000) return `${(count / 1000).toFixed(0)}K`;
  return count.toString();
}

// Escape HTML special characters so tweet text doesn't break the message
function escapeHtml(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// Truncate text to a max length, adding "..." if trimmed
function truncate(text, maxLen) {
  if (!text) return '';
  // Collapse newlines into spaces for the Telegram preview
  const clean = text.replace(/\n/g, ' ').trim();
  if (clean.length <= maxLen) return clean;
  return clean.substring(0, maxLen) + '...';
}

module.exports = { initTelegram, sendAlert, sendError, sendDailySummary };
