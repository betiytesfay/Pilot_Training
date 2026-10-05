const { Telegraf, Markup } = require('telegraf');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

// Load Environment Variables
const BOT_TOKEN = process.env.BOT_TOKEN;
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || '@admin';
const ADMIN_CHAT_ID = process.env.ADMIN_CHAT_ID ? String(process.env.ADMIN_CHAT_ID).trim() : null;

if (!BOT_TOKEN || BOT_TOKEN === 'YOUR_BOT_TOKEN_HERE') {
  console.error('❌ ERROR: BOT_TOKEN is not set in .env file!');
  console.error('Please add your Telegram Bot token to the .env file before running.');
  process.exit(1);
}

const bot = new Telegraf(BOT_TOKEN);

// Load FAQ Data
const faqPath = path.join(__dirname, '..', 'faq.json');
let faqList = [];

function loadFAQ() {
  try {
    if (fs.existsSync(faqPath)) {
      const data = fs.readFileSync(faqPath, 'utf-8');
      faqList = JSON.parse(data);
      console.log(`✅ Loaded ${faqList.length} FAQ items from faq.json`);
    } else {
      console.warn('⚠️ faq.json not found, using empty FAQ list.');
    }
  } catch (err) {
    console.error('❌ Failed to load faq.json:', err.message);
  }
}
loadFAQ();

// In-Memory store for user state & forwarded admin replies
const userStates = new Map();
const forwardedQuestions = new Map();

/**
 * Main Menu Keyboard:
 * ❓ FAQs
 * 📞 Contact Support
 */
function getMainMenuKeyboard() {
  return Markup.keyboard([
    ['❓ Most Frequent Questions'],
    ['✏️ Ask a Custom Question']
  ]).resize();
}

/**
 * Questions List Keyboard:
 * - FAQ Topics from faq.json
 * - ✏️ Ask a Question
 * - ↩️ Back
 */
function getQuestionsListKeyboard() {
  const buttons = faqList.map((item, index) => [
    Markup.button.callback(`${index + 1}. ${item.question}`, `faq_${item.id}`)
  ]);
  
  buttons.push([Markup.button.callback('✏️ Ask a custom question', 'ask_custom_question')]);
  buttons.push([Markup.button.callback('↩️ Back', 'show_main_menu')]);

  return Markup.inlineKeyboard(buttons);
}

// ==================== BOT COMMANDS ====================

// /start command
bot.start((ctx) => {
  userStates.delete(ctx.from.id);
  const name = ctx.from.first_name || 'there';
  const welcomeText = `✈️ Welcome to Pilot Training Club, ${name}!\n\nHave a question in mind?\nChoose from the options below or tap "Ask a Custom Question" to write to us directly — our team will reply shortly!`;

  return ctx.replyWithMarkdownV2(
    escapeMarkdown(welcomeText),
    getMainMenuKeyboard()
  );
});

// /faq command
bot.command('faq', (ctx) => {
  const text = `Choose a question below:`;
  return ctx.replyWithMarkdownV2(
    escapeMarkdown(text),
    getQuestionsListKeyboard()
  );
});

// Reload FAQ command for admins
bot.command('reload', (ctx) => {
  const userId = String(ctx.from.id);
  if (ADMIN_CHAT_ID && userId !== ADMIN_CHAT_ID) {
    return ctx.reply('❌ Unauthorized command.');
  }
  loadFAQ();
  return ctx.reply(`✅ FAQ reloaded! Total items: ${faqList.length}`);
});

// Global error handler to prevent bot crash on Telegram API timeouts or network issues
bot.catch((err) => {
  console.error('⚠️ Telegraf error caught:', err.message || err);
});

// Helper to safely answer callback queries without unhandled rejections if the query expired
function safeAnswerCbQuery(ctx, text) {
  return ctx.answerCbQuery(text).catch((err) => {
    // Ignore "query is too old and response timeout expired"
    if (err.description && err.description.includes('query is too old')) {
      return;
    }
    console.warn('⚠️ Callback query answer failed:', err.message);
  });
}

// ==================== ACTION HANDLERS ====================

// 1. User clicks "❓ FAQs"
bot.action('open_questions_list', async (ctx) => {
  safeAnswerCbQuery(ctx);
  const text = `Choose a question below:`;
  return ctx.replyWithMarkdownV2(
    escapeMarkdown(text),
    getQuestionsListKeyboard()
  );
});

// 2. User selects a specific topic
bot.action(/^faq_(.+)$/, async (ctx) => {
  const faqId = ctx.match[1];
  const item = faqList.find((f) => f.id === faqId);

  if (!item) {
    return safeAnswerCbQuery(ctx, 'Topic not found.');
  }

  safeAnswerCbQuery(ctx);
  return ctx.replyWithMarkdownV2(
    escapeMarkdown(`*${item.question}*\n\n${item.answer}`),
    Markup.inlineKeyboard([
      [Markup.button.callback('↩️ Back', 'open_questions_list')],
      [Markup.button.callback('✏️ Ask a Question', 'ask_custom_question')]
    ])
  );
});

// 3. User selects "✏️ Ask a Question"
bot.action('ask_custom_question', async (ctx) => {
  safeAnswerCbQuery(ctx);
  const userId = ctx.from.id;
  userStates.set(userId, 'WAITING_FOR_CUSTOM_QUESTION');

  return ctx.replyWithMarkdownV2(
    escapeMarkdown(
      `✏️ *Please type your question below.*\n\n` +
      `We will forward it directly to our support team and reply to you as soon as possible.`
    )
  );
});

// 4. Back to Main Menu
bot.action('show_main_menu', async (ctx) => {
  safeAnswerCbQuery(ctx);
  userStates.delete(ctx.from.id);
  const name = ctx.from.first_name || 'there';
  const welcomeText = `✈️ Welcome to Pilot Training Club, ${name}!\n\nHave a question in mind?\nChoose from the options below or tap "Ask a Custom Question" to write to us directly — our team will reply shortly!`;

  return ctx.replyWithMarkdownV2(
    escapeMarkdown(welcomeText),
    getMainMenuKeyboard()
  );
});

// 5. Contact Support button
bot.action('contact_support', async (ctx) => {
  safeAnswerCbQuery(ctx);
  return ctx.replyWithMarkdownV2(
    escapeMarkdown(`📞 You can click *"✏️ Ask a Custom Question"* below to send your question directly to our support team.`),
    getMainMenuKeyboard()
  );
});

// ==================== REPLY KEYBOARD (BOTTOM BUTTONS) HANDLERS ====================

bot.hears('❓ Most Frequent Questions', async (ctx) => {
  userStates.delete(ctx.from.id);
  const text = `Choose a question below:`;
  return ctx.replyWithMarkdownV2(
    escapeMarkdown(text),
    getQuestionsListKeyboard()
  );
});

bot.hears('✏️ Ask a Custom Question', async (ctx) => {
  const userId = ctx.from.id;
  userStates.set(userId, 'WAITING_FOR_CUSTOM_QUESTION');
  return ctx.replyWithMarkdownV2(
    escapeMarkdown(
      `✏️ *Please type your question below.*\n\n` +
      `We will forward it directly to our support team and reply to you as soon as possible.`
    )
  );
});

// ==================== TEXT MESSAGE HANDLER ====================

bot.on('text', async (ctx) => {
  const user = ctx.from;
  const userId = user.id;
  const text = ctx.message.text.trim();

  // Ignore menu buttons text clicks
  if (text === '❓ Most Frequent Questions' || text === '✏️ Ask a Custom Question') return;

  // A. CHECK IF THIS IS AN ADMIN REPLY TO A FORWARDED QUESTION
  if (ctx.message.reply_to_message && ADMIN_CHAT_ID && String(ctx.chat.id) === ADMIN_CHAT_ID) {
    const repliedMsgId = ctx.message.reply_to_message.message_id;
    const targetData = forwardedQuestions.get(repliedMsgId);

    if (targetData) {
      try {
        const replyHeader = `💬 *Response from Support:*\n\n`;
        await bot.telegram.sendMessage(
          targetData.userId,
          replyHeader + text,
          { parse_mode: 'Markdown' }
        );

        await ctx.reply(`✅ *Reply sent to* [${targetData.userFullName}](tg://user?id=${targetData.userId})!`, {
          parse_mode: 'Markdown'
        });
        return;
      } catch (err) {
        console.error('Failed to send admin reply to user:', err.message);
        return ctx.reply(`❌ Failed to send reply to user: ${err.message}`);
      }
    }
  }

  // Ignore bot commands
  if (text.startsWith('/')) return;

  // B. USER SENDS A CUSTOM QUESTION
  userStates.delete(userId);
  await forwardQuestionToAdmin(ctx, text);
});

/**
 * Forward user's custom question to Admin
 */
async function forwardQuestionToAdmin(ctx, userQuestion) {
  const user = ctx.from;
  const username = user.username ? `@${user.username}` : 'No Username';
  const fullName = [user.first_name, user.last_name].filter(Boolean).join(' ');
  const userId = user.id;

  console.log(`[Forwarding Custom Question] User: ${fullName} (${username} / ${userId}) | Question: "${userQuestion}"`);

  // Acknowledge user
  const userNotice = 
    `📨 *Question Received!*\n\n` +
    `Your question has been forwarded to our support team. We will reply to your chat shortly.`;

  await ctx.replyWithMarkdownV2(
    escapeMarkdown(userNotice),
    getMainMenuKeyboard()
  );

  // Send to ADMIN_CHAT_ID if configured
  if (ADMIN_CHAT_ID) {
    try {
      const adminMessageText = 
        `🚨 *NEW USER QUESTION FORWARDED*\n\n` +
        `👤 *From:* ${fullName} (${username})\n` +
        `🆔 *User ID:* \`${userId}\` \n\n` +
        `❓ *Question:* \n"${userQuestion}"\n\n` +
        `👉 *Reply directly to this message to answer the user!*`;

      const sentMsg = await bot.telegram.sendMessage(ADMIN_CHAT_ID, adminMessageText, {
        parse_mode: 'Markdown'
      });

      forwardedQuestions.set(sentMsg.message_id, {
        userId: userId,
        userFullName: fullName,
        username: username,
        originalQuestion: userQuestion,
        timestamp: Date.now()
      });
    } catch (err) {
      console.error('❌ Error forwarding message to ADMIN_CHAT_ID:', err.message);
    }
  } else {
    console.warn('⚠️ ADMIN_CHAT_ID is not set in .env file.');
  }
}

/**
 * Escape MarkdownV2 special characters safely
 */
function escapeMarkdown(text) {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/\_/g, '\\_')
    .replace(/\*/g, '\\*')
    .replace(/\[/g, '\\[')
    .replace(/\]/g, '\\]')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)')
    .replace(/\~/g, '\\~')
    .replace(/\`/g, '\\`')
    .replace(/\>/g, '\\>')
    .replace(/\#/g, '\\#')
    .replace(/\+/g, '\\+')
    .replace(/\-/g, '\\-')
    .replace(/\=/g, '\\=')
    .replace(/\|/g, '\\|')
    .replace(/\{/g, '\\{')
    .replace(/\}/g, '\\}')
    .replace(/\./g, '\\.')
    .replace(/\!/g, '\\!');
}

// Start Bot
bot.launch().then(() => {
  console.log('🚀 Support & FAQ Telegram Bot is running...');
  console.log(`📌 Admin Username configured: ${ADMIN_USERNAME}`);
  console.log(`📌 Admin Chat ID configured: ${ADMIN_CHAT_ID || 'Not Set'}`);
}).catch((err) => {
  console.error('❌ Failed to launch bot:', err.message);
});

// Enable graceful stop
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
