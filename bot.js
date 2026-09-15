require("dotenv").config();

const TelegramBot = require("node-telegram-bot-api");
const fs = require("fs");

const bot = new TelegramBot(process.env.BOT_TOKEN, {
  polling: true
});

const ADMIN_ID = String(process.env.ADMIN_ID);
const DB_FILE = "./database.json";

const DEFAULT_PRICES = {
  1: 15,
  2: 30,
  6: 45,
  12: 65,
  24: 90,
  48: 160,
  168: 500
};

let db = {
  accounts: [
    { id: 1, name: "Rust #1" },
    { id: 2, name: "Rust #2" },
    { id: 3, name: "Rust #3" }
  ],
  prices: DEFAULT_PRICES,
  rentals: []
};

if (fs.existsSync(DB_FILE)) {
  try {
    const saved = JSON.parse(fs.readFileSync(DB_FILE, "utf8"));

    db = {
      ...db,
      ...saved,
      prices: {
        ...DEFAULT_PRICES,
        ...(saved.prices || {})
      }
    };
  } catch (error) {
    console.log("Ошибка чтения базы:", error.message);
  }
}

function save() {
  fs.writeFileSync(
    DB_FILE,
    JSON.stringify(db, null, 2),
    "utf8"
  );
}

function isAdmin(msg) {
  return String(msg.from.id) === ADMIN_ID;
}

function formatTime(ms) {
  if (ms <= 0) return "завершена";

  const totalMinutes = Math.floor(ms / 60000);

  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;

  if (days > 0) {
    return `${days}д ${hours}ч ${minutes}м`;
  }

  if (hours > 0) {
    return `${hours}ч ${minutes}м`;
  }

  return `${minutes}м`;
}

function formatDuration(hours) {
  if (hours === 168) return "7 дней";
  if (hours === 48) return "48 часов";
  if (hours === 24) return "24 часа";
  return `${hours} ч.`;
}

function mainMenu() {
  return {
    reply_markup: {
      inline_keyboard: [
        [
          {
            text: "➕ Новая аренда",
            callback_data: "new_rental"
          }
        ],
        [
          {
            text: "🎮 Мои аккаунты",
            callback_data: "accounts"
          },
          {
            text: "⏱ Активные",
            callback_data: "active"
          }
        ],
        [
          {
            text: "💰 Прибыль сегодня",
            callback_data: "profit"
          },
          {
            text: "📊 Статистика",
            callback_data: "stats"
          }
        ],
        [
          {
            text: "📜 История",
            callback_data: "history"
          }
        ],
        [
          {
            text: "⚙️ Настройки",
            callback_data: "settings"
          }
        ]
      ]
    }
  };
}

function sendMenu(chatId) {
  return bot.sendMessage(
    chatId,
    "🏠 *Управление арендой Rust*\n\nВыбери действие:",
    {
      parse_mode: "Markdown",
      ...mainMenu()
    }
  );
}

bot.onText(/\/start/, (msg) => {
  if (!isAdmin(msg)) {
    return bot.sendMessage(
      msg.chat.id,
      "⛔ Доступ запрещён."
    );
  }

  sendMenu(msg.chat.id);
});

bot.onText(/\/menu/, (msg) => {
  if (!isAdmin(msg)) return;

  sendMenu(msg.chat.id);
});

bot.on("callback_query", async (query) => {
  const chatId = query.message.chat.id;
  const userId = String(query.from.id);

  if (userId !== ADMIN_ID) {
    return bot.answerCallbackQuery(query.id, {
      text: "⛔ Доступ запрещён"
    });
  }

  await bot.answerCallbackQuery(query.id);

  const action = query.data;

  // =========================
  // НОВАЯ АРЕНДА
  // =========================

  if (action === "new_rental") {
    const buttons = db.accounts.map((account) => {
      const active = db.rentals.find(
        (r) =>
          r.accountId === account.id &&
          r.endTime > Date.now()
      );

      return [
        {
          text: active
            ? `🔴 ${account.name}`
            : `🟢 ${account.name}`,
          callback_data: `account_${account.id}`
        }
      ];
    });

    buttons.push([
      {
        text: "◀️ Назад",
        callback_data: "menu"
      }
    ]);

    return bot.sendMessage(
      chatId,
      "🎮 *Выбери аккаунт:*",
      {
        parse_mode: "Markdown",
        reply_markup: {
          inline_keyboard: buttons
        }
      }
    );
  }

  if (action.startsWith("account_")) {
    const accountId = Number(
      action.split("_")[1]
    );

    const account = db.accounts.find(
      (a) => a.id === accountId
    );

    if (!account) {
      return bot.sendMessage(
        chatId,
        "❌ Аккаунт не найден."
      );
    }

    const active = db.rentals.find(
      (r) =>
        r.accountId === accountId &&
        r.endTime > Date.now()
    );

    if (active) {
      return bot.sendMessage(
        chatId,
        `🔴 *${account.name} уже занят.*\n\n` +
        `⏳ Осталось: ${formatTime(
          active.endTime - Date.now()
        )}`,
        {
          parse_mode: "Markdown",
          ...mainMenu()
        }
      );
    }

    const buttons = [
      [1, 2, 6].map((hours) => ({
        text: `${formatDuration(hours)} — ${db.prices[hours]} ₽`,
        callback_data: `duration_${accountId}_${hours}`
      })),
      [12, 24].map((hours) => ({
        text: `${formatDuration(hours)} — ${db.prices[hours]} ₽`,
        callback_data: `duration_${accountId}_${hours}`
      })),
      [48, 168].map((hours) => ({
        text: `${formatDuration(hours)} — ${db.prices[hours]} ₽`,
        callback_data: `duration_${accountId}_${hours}`
      })),
      [
        {
          text: "◀️ Назад",
          callback_data: "new_rental"
        }
      ]
    ];

    return bot.sendMessage(
      chatId,
      `🎮 *${account.name}*\n\nВыбери срок аренды:`,
      {
        parse_mode: "Markdown",
        reply_markup: {
          inline_keyboard: buttons
        }
      }
    );
  }

  if (action.startsWith("duration_")) {
    const [, accountIdRaw, hoursRaw] =
      action.split("_");

    const accountId = Number(accountIdRaw);
    const hours = Number(hoursRaw);

    const account = db.accounts.find(
      (a) => a.id === accountId
    );

    if (!account) {
      return bot.sendMessage(
        chatId,
        "❌ Аккаунт не найден."
      );
    }

    const active = db.rentals.find(
      (r) =>
        r.accountId === accountId &&
        r.endTime > Date.now()
    );

    if (active) {
      return bot.sendMessage(
        chatId,
        "🔴 Этот аккаунт уже занят."
      );
    }

    const price = Number(db.prices[hours]);

    const startTime = Date.now();
    const endTime =
      startTime +
      hours * 60 * 60 * 1000;

    db.rentals.push({
      id: Date.now(),
      accountId,
      startTime,
      endTime,
      hours,
      profit: price
    });

    save();

    return bot.sendMessage(
      chatId,
      `✅ *Аренда создана!*\n\n` +
      `🎮 ${account.name}\n` +
      `⏱ ${formatDuration(hours)}\n` +
      `💰 +${price} ₽\n\n` +
      `🕐 Начало: ${new Date(
        startTime
      ).toLocaleString("ru-RU")}\n` +
      `🏁 Конец: ${new Date(
        endTime
      ).toLocaleString("ru-RU")}`,
      {
        parse_mode: "Markdown",
        ...mainMenu()
      }
    );
  }

  // =========================
  // АККАУНТЫ
  // =========================

  if (action === "accounts") {
    let text = "🎮 *Мои аккаунты*\n\n";

    for (const account of db.accounts) {
      const active = db.rentals.find(
        (r) =>
          r.accountId === account.id &&
          r.endTime > Date.now()
      );

      if (active) {
        text +=
          `🔴 *${account.name}*\n` +
          `⏳ Осталось: ${formatTime(
            active.endTime - Date.now()
          )}\n` +
          `💰 Эта аренда: +${active.profit} ₽\n\n`;
      } else {
        text +=
          `🟢 *${account.name}* — свободен\n\n`;
      }
    }

    return bot.sendMessage(chatId, text, {
      parse_mode: "Markdown",
      ...mainMenu()
    });
  }

  // =========================
  // АКТИВНЫЕ АРЕНДЫ
  // =========================

  if (action === "active") {
    const activeRentals =
      db.rentals.filter(
        (r) => r.endTime > Date.now()
      );

    if (!activeRentals.length) {
      return bot.sendMessage(
        chatId,
        "🟢 Сейчас активных аренд нет.",
        mainMenu()
      );
    }

    let text = "⏱ *Активные аренды*\n\n";

    for (const rental of activeRentals) {
      const account = db.accounts.find(
        (a) => a.id === rental.accountId
      );

      text +=
        `🎮 *${account.name}*\n` +
        `⏳ ${formatTime(
          rental.endTime - Date.now()
        )}\n` +
        `💰 +${rental.profit} ₽\n` +
        `🏁 ${new Date(
          rental.endTime
        ).toLocaleString("ru-RU")}\n\n`;
    }

    return bot.sendMessage(chatId, text, {
      parse_mode: "Markdown",
      ...mainMenu()
    });
  }

  // =========================
  // ПРИБЫЛЬ СЕГОДНЯ
  // =========================

  if (action === "profit") {
    const now = new Date();

    const startOfDay = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate()
    ).getTime();

    const todayRentals =
      db.rentals.filter(
        (r) => r.startTime >= startOfDay
      );

    const profit =
      todayRentals.reduce(
        (sum, r) => sum + Number(r.profit),
        0
      );

    return bot.sendMessage(
      chatId,
      `💰 *Прибыль сегодня*\n\n` +
      `📦 Аренд: ${todayRentals.length}\n` +
      `💵 Выручка: ${profit} ₽`,
      {
        parse_mode: "Markdown",
        ...mainMenu()
      }
    );
  }

  // =========================
  // СТАТИСТИКА
  // =========================

  if (action === "stats") {
    const totalProfit =
      db.rentals.reduce(
        (sum, r) => sum + Number(r.profit),
        0
      );

    const activeCount =
      db.rentals.filter(
        (r) => r.endTime > Date.now()
      ).length;

    return bot.sendMessage(
      chatId,
      `📊 *Статистика*\n\n` +
      `📦 Всего аренд: ${db.rentals.length}\n` +
      `🟢 Активных сейчас: ${activeCount}\n` +
      `💰 Общая выручка: ${totalProfit} ₽`,
      {
        parse_mode: "Markdown",
        ...mainMenu()
      }
    );
  }

  // =========================
  // ИСТОРИЯ
  // =========================

  if (action === "history") {
    if (!db.rentals.length) {
      return bot.sendMessage(
        chatId,
        "📜 История пока пустая.",
        mainMenu()
      );
    }

    let text = "📜 *Последние аренды*\n\n";

    const last =
      db.rentals
        .slice(-15)
        .reverse();

    for (const rental of last) {
      const account = db.accounts.find(
        (a) => a.id === rental.accountId
      );

      text +=
        `🎮 ${account.name}\n` +
        `⏱ ${formatDuration(rental.hours)}\n` +
        `💰 +${rental.profit} ₽\n` +
        `📅 ${new Date(
          rental.startTime
        ).toLocaleString("ru-RU")}\n\n`;
    }

    return bot.sendMessage(chatId, text, {
      parse_mode: "Markdown",
      ...mainMenu()
    });
  }

  // =========================
  // НАСТРОЙКИ
  // =========================

  if (action === "settings") {
    return bot.sendMessage(
      chatId,
      "⚙️ *Настройки*",
      {
        parse_mode: "Markdown",
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: "💰 Изменить цены",
                callback_data: "prices"
              }
            ],
            [
              {
                text: "◀️ Назад",
                callback_data: "menu"
              }
            ]
          ]
        }
      }
    );
  }

  // =========================
  // ЦЕНЫ
  // =========================

  if (action === "prices") {
    let text =
      "💰 *Текущие цены Rust*\n\n";

    for (const hours of [
      1, 2, 6, 12, 24, 48, 168
    ]) {
      text +=
        `⏱ ${formatDuration(hours)} — ` +
        `${db.prices[hours]} ₽\n`;
    }

    text +=
      "\nВыбери тариф, цену которого хочешь изменить:";

    const buttons = [
      [1, 2, 6].map((hours) => ({
        text: `${formatDuration(hours)}`,
        callback_data: `editprice_${hours}`
      })),
      [12, 24].map((hours) => ({
        text: `${formatDuration(hours)}`,
        callback_data: `editprice_${hours}`
      })),
      [48, 168].map((hours) => ({
        text: `${formatDuration(hours)}`,
        callback_data: `editprice_${hours}`
      })),
      [
        {
          text: "◀️ Назад",
          callback_data: "settings"
        }
      ]
    ];

    return bot.sendMessage(chatId, text, {
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: buttons
      }
    });
  }

  if (action.startsWith("editprice_")) {
    const hours = Number(
      action.split("_")[1]
    );

    db.waitingForPrice = {
      chatId,
      hours
    };

    save();

    return bot.sendMessage(
      chatId,
      `✏️ Введи новую цену для *${formatDuration(
        hours
      )}*.\n\nНапример: 120`,
      {
        parse_mode: "Markdown"
      }
    );
  }

  // =========================
  // МЕНЮ
  // =========================

  if (action === "menu") {
    return sendMenu(chatId);
  }
});

// =========================
// ВВОД НОВОЙ ЦЕНЫ
// =========================

bot.on("message", (msg) => {
  if (!isAdmin(msg)) return;

  if (!msg.text) return;

  if (msg.text.startsWith("/")) return;

  if (!db.waitingForPrice) return;

  const { chatId, hours } =
    db.waitingForPrice;

  if (String(chatId) !== String(msg.chat.id)) {
    return;
  }

  const price = Number(
    msg.text.replace(",", ".")
  );

  if (!Number.isFinite(price) || price < 0) {
    return bot.sendMessage(
      msg.chat.id,
      "❌ Введи корректную цену, например: 100"
    );
  }

  db.prices[hours] = price;

  delete db.waitingForPrice;

  save();

  bot.sendMessage(
    msg.chat.id,
    `✅ Цена изменена!\n\n` +
    `⏱ ${formatDuration(hours)}\n` +
    `💰 Новая цена: ${price} ₽`,
    mainMenu()
  );
});

console.log("🤖 Бот запущен");
