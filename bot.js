require("dotenv").config();

const TelegramBot = require("node-telegram-bot-api");
const fs = require("fs");

const bot = new TelegramBot(process.env.BOT_TOKEN, {
  polling: true
});

const ADMIN_ID = String(process.env.ADMIN_ID);

const DB_FILE = "./database.json";

let db = {
  accounts: [
    { id: 1, name: "Rust #1" },
    { id: 2, name: "Rust #2" },
    { id: 3, name: "Rust #3" }
  ],
  rentals: []
};

if (fs.existsSync(DB_FILE)) {
  db = JSON.parse(fs.readFileSync(DB_FILE, "utf8"));
}

function save() {
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
}

function isAdmin(msg) {
  return String(msg.from.id) === ADMIN_ID;
}

function menu() {
  return {
    reply_markup: {
      inline_keyboard: [
        [
          { text: "➕ Новая аренда", callback_data: "new_rental" }
        ],
        [
          { text: "🎮 Мои аккаунты", callback_data: "accounts" },
          { text: "⏱ Активные", callback_data: "active" }
        ],
        [
          { text: "💰 Прибыль сегодня", callback_data: "profit" },
          { text: "📊 Статистика", callback_data: "stats" }
        ],
        [
          { text: "📜 История", callback_data: "history" }
        ]
      ]
    }
  };
}

function mainMenu(chatId) {
  bot.sendMessage(
    chatId,
    "🏠 *Управление арендой Rust*\n\nВыбери действие:",
    {
      parse_mode: "Markdown",
      ...menu()
    }
  );
}

function formatTime(ms) {
  if (ms <= 0) return "завершена";

  const totalMinutes = Math.floor(ms / 60000);

  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours > 0) {
    return `${hours}ч ${minutes}м`;
  }

  return `${minutes}м`;
}

bot.onText(/\/start/, (msg) => {
  if (!isAdmin(msg)) {
    return bot.sendMessage(msg.chat.id, "⛔ Доступ запрещён.");
  }

  mainMenu(msg.chat.id);
});

bot.on("callback_query", async (query) => {
  const chatId = query.message.chat.id;

  if (String(query.from.id) !== ADMIN_ID) {
    return bot.answerCallbackQuery(query.id, {
      text: "⛔ Доступ запрещён"
    });
  }

  const action = query.data;

  await bot.answerCallbackQuery(query.id);

  if (action === "accounts") {
    let text = "🎮 *Мои аккаунты*\n\n";

    for (const account of db.accounts) {
      const active = db.rentals.find(
        r => r.accountId === account.id && r.endTime > Date.now()
      );

      if (active) {
        text += `🔴 ${account.name} — осталось ${formatTime(active.endTime - Date.now())}\n`;
      } else {
        text += `🟢 ${account.name} — свободен\n`;
      }
    }

    return bot.sendMessage(chatId, text, {
      parse_mode: "Markdown",
      ...menu()
    });
  }

  if (action === "new_rental") {
    const buttons = db.accounts.map(account => [
      {
        text: `🎮 ${account.name}`,
        callback_data: `account_${account.id}`
      }
    ]);

    return bot.sendMessage(chatId, "Выбери аккаунт:", {
      reply_markup: {
        inline_keyboard: buttons
      }
    });
  }

  if (action.startsWith("account_")) {
    const accountId = Number(action.split("_")[1]);

    const active = db.rentals.find(
      r => r.accountId === accountId && r.endTime > Date.now()
    );

    if (active) {
      return bot.sendMessage(
        chatId,
        "🔴 Этот аккаунт уже находится в аренде."
      );
    }

    return bot.sendMessage(chatId, "Выбери длительность:", {
      reply_markup: {
        inline_keyboard: [
          [
            { text: "1 час", callback_data: `duration_${accountId}_1` },
            { text: "2 часа", callback_data: `duration_${accountId}_2` }
          ],
          [
            { text: "6 часов", callback_data: `duration_${accountId}_6` },
            { text: "12 часов", callback_data: `duration_${accountId}_12` }
          ],
          [
            { text: "24 часа", callback_data: `duration_${accountId}_24` }
          ]
        ]
      }
    });
  }

  if (action.startsWith("duration_")) {
    const [, accountId, hours] = action.split("_");

    const account = db.accounts.find(
      a => a.id === Number(accountId)
    );

    const prices = {
      1: 15,
      2: 30,
      6: 45,
      12: 65,
      24: 90
    };

    const price = prices[hours];

    const startTime = Date.now();
    const endTime = startTime + Number(hours) * 60 * 60 * 1000;

    db.rentals.push({
      id: Date.now(),
      accountId: Number(accountId),
      startTime,
      endTime,
      hours: Number(hours),
      profit: price
    });

    save();

    return bot.sendMessage(
      chatId,
      `✅ *Аренда создана!*\n\n` +
      `🎮 ${account.name}\n` +
      `⏱ ${hours} ч.\n` +
      `💰 +${price} ₽\n\n` +
      `Окончание: ${new Date(endTime).toLocaleString("ru-RU")}`,
      {
        parse_mode: "Markdown",
        ...menu()
      }
    );
  }

  if (action === "active") {
    const active = db.rentals.filter(
      r => r.endTime > Date.now()
    );

    if (!active.length) {
      return bot.sendMessage(chatId, "🟢 Сейчас активных аренд нет.", menu());
    }

    let text = "⏱ *Активные аренды*\n\n";

    for (const rental of active) {
      const account = db.accounts.find(
        a => a.id === rental.accountId
      );

      text +=
        `🎮 ${account.name}\n` +
        `⏳ Осталось: ${formatTime(rental.endTime - Date.now())}\n` +
        `💰 Доход: +${rental.profit} ₽\n\n`;
    }

    return bot.sendMessage(chatId, text, {
      parse_mode: "Markdown",
      ...menu()
    });
  }

  if (action === "profit") {
    const today = new Date();

    const startOfDay = new Date(
      today.getFullYear(),
      today.getMonth(),
      today.getDate()
    ).getTime();

    const todayRentals = db.rentals.filter(
      r => r.startTime >= startOfDay
    );

    const profit = todayRentals.reduce(
      (sum, r) => sum + r.profit,
      0
    );

    return bot.sendMessage(
      chatId,
      `💰 *Прибыль сегодня*\n\n` +
      `Аренд: ${todayRentals.length}\n` +
      `Выручка: ${profit} ₽`,
      {
        parse_mode: "Markdown",
        ...menu()
      }
    );
  }

  if (action === "stats") {
    const totalProfit = db.rentals.reduce(
      (sum, r) => sum + r.profit,
      0
    );

    return bot.sendMessage(
      chatId,
      `📊 *Статистика*\n\n` +
      `Всего аренд: ${db.rentals.length}\n` +
      `Общая выручка: ${totalProfit} ₽`,
      {
        parse_mode: "Markdown",
        ...menu()
      }
    );
  }

  if (action === "history") {
    if (!db.rentals.length) {
      return bot.sendMessage(chatId, "📜 История пока пустая.", menu());
    }

    let text = "📜 *Последние аренды*\n\n";

    const last = db.rentals.slice(-10).reverse();

    for (const rental of last) {
      const account = db.accounts.find(
        a => a.id === rental.accountId
      );

      text +=
        `🎮 ${account.name}\n` +
        `⏱ ${rental.hours} ч.\n` +
        `💰 +${rental.profit} ₽\n` +
        `📅 ${new Date(rental.startTime).toLocaleString("ru-RU")}\n\n`;
    }

    return bot.sendMessage(chatId, text, {
      parse_mode: "Markdown",
      ...menu()
    });
  }
});

console.log("🤖 Бот запущен");
