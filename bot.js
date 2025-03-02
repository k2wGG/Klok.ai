const fs = require('fs');
const axios = require('axios');
const { v4: uuidv4 } = require('uuid');
const inquirer = require('inquirer').default || require('inquirer');
const { exec } = require('child_process');
const { HttpsProxyAgent } = require('https-proxy-agent');

// Цвета для консоли
const colors = {
  reset: "\x1b[0m",
  bright: "\x1b[1m",
  fg: {
    red: "\x1b[31m",
    green: "\x1b[32m",
    yellow: "\x1b[33m",
    cyan: "\x1b[36m",
    magenta: "\x1b[35m",
    white: "\x1b[37m"
  }
};

// Баннер
function showBanner() {
  console.log(
    '\n' +
    colors.fg.cyan + colors.bright + `
███    ██  ██████  ██████  ██████  ██████  
████   ██ ██    ██ ██   ██      ██ ██   ██ 
██ ██  ██ ██    ██ ██   ██  █████  ██████  
██  ██ ██ ██    ██ ██   ██      ██ ██   ██ 
██   ████  ██████  ██████  ██████  ██   ██ 
                                           
                 Nod3r Bot
` + colors.reset + '\n'
  );
}

// ============ Работа с аккаунтами ============
const ACCOUNTS_FILE = 'config.json';

function loadAccounts() {
  if (!fs.existsSync(ACCOUNTS_FILE)) {
    return { accounts: [] };
  }
  try {
    const data = fs.readFileSync(ACCOUNTS_FILE, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.error(colors.fg.red + 'Ошибка чтения accounts.json: ' + error + colors.reset);
    return { accounts: [] };
  }
}

function saveAccounts(accountsObj) {
  fs.writeFileSync(ACCOUNTS_FILE, JSON.stringify(accountsObj, null, 2), 'utf8');
}

async function addAccount() {
  const answers = await inquirer.prompt([
    {
      type: 'input',
      name: 'token',
      message: 'Введите токен аккаунта:'
    },
    {
      type: 'input',
      name: 'ai_id',
      message: 'Введите ID чата (ai_id):'
    },
    {
      type: 'input',
      name: 'proxy',
      message: 'Введите прокси (оставьте пустым, если не требуется):'
    }
  ]);
  const accountsObj = loadAccounts();
  accountsObj.accounts.push({
    token: answers.token.trim(),
    ai_id: answers.ai_id.trim(),
    proxy: answers.proxy.trim()
  });
  saveAccounts(accountsObj);
  console.log(colors.fg.green + 'Аккаунт успешно добавлен в ' + ACCOUNTS_FILE + colors.reset);
}

function listAccounts() {
  const accountsObj = loadAccounts();
  if (!accountsObj.accounts.length) {
    console.log(colors.fg.yellow + 'Аккаунты не найдены. Добавьте хотя бы один аккаунт.' + colors.reset);
    return;
  }
  console.log(colors.fg.cyan + 'Список аккаунтов:' + colors.reset);
  accountsObj.accounts.forEach((acc, idx) => {
    console.log(`${idx + 1}) ${acc.token.slice(0, 6)}..., чат: ${acc.ai_id}, прокси: ${acc.proxy || 'без прокси'}`);
  });
}

// ============ Основные функции бота ============

const CONFIG = {
  API_BASE_URL: 'https://api1-pp.klokapp.ai/v1',
  CHAT_INTERVAL: 60000, // 1 минута
  RANDOM_MESSAGES: [
    "Hey there!",
    "What's new?",
    "How's it going?",
    "Tell me something interesting",
    "What do you think about AI?",
    "Have you heard the latest news?",
    "What's your favorite topic?",
    "Let's discuss something fun",
  ]
};

function getRandomMessage() {
  const index = Math.floor(Math.random() * CONFIG.RANDOM_MESSAGES.length);
  return CONFIG.RANDOM_MESSAGES[index];
}

// Создание клиента для API с поддержкой прокси
function createApiClient(token, proxyUrl = '') {
  let agent = null;
  if (proxyUrl) {
    try {
      agent = new HttpsProxyAgent(proxyUrl);
      console.log(colors.fg.cyan + `Используется прокси: ${proxyUrl}` + colors.reset);
    } catch (e) {
      console.error(colors.fg.red + `Ошибка создания агента для прокси ${proxyUrl}:`, e, colors.reset);
    }
  }
  return axios.create({
    baseURL: CONFIG.API_BASE_URL,
    headers: {
      'x-session-token': token,
      'accept': '*/*',
      'accept-encoding': 'gzip, deflate, br, zstd',
      'accept-language': 'en-US,en;q=0.9',
      'origin': 'https://klokapp.ai',
      'referer': 'https://klokapp.ai/',
      'sec-ch-ua': '"Not(A:Brand";v="99", "Microsoft Edge";v="133", "Chromium";v="133"',
      'sec-ch-ua-mobile': '?0',
      'sec-ch-ua-platform': '"Windows"',
      'sec-fetch-dest': 'empty',
      'sec-fetch-mode': 'cors',
      'sec-fetch-site': 'same-site',
      'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36 Edg/133.0.0.0'
    },
    httpsAgent: agent,
    httpAgent: agent
  });
}

// Отправка сообщения в указанный чат (ai_id)
async function sendMessageToThread(apiClient, chatId, message) {
  try {
    const chatData = {
      id: chatId,
      title: "New Chat",
      messages: [
        {
          role: "user",
          content: message
        }
      ],
      sources: [],
      model: "llama-3.3-70b-instruct",
      created_at: new Date().toISOString(),
      language: "english"
    };
    const response = await apiClient.post('/chat', chatData);
    console.log(colors.fg.green + `Сообщение успешно отправлено в чат: ${chatId}` + colors.reset);
    return response.data;
  } catch (error) {
    if (error.message.includes('stream has been aborted')) {
      console.log(colors.fg.yellow + 'Поток прерван, но сообщение могло быть отправлено' + colors.reset);
      return true;
    }
    console.error(
      colors.fg.red +
      'Ошибка отправки сообщения: ' +
      (error.response?.status || '') +
      ' ' +
      (error.response?.data || error.message) +
      colors.reset
    );
    return null;
  }
}

// Проверка баллов
async function checkPoints(apiClient) {
  try {
    const response = await apiClient.get('/points');
    const pointsData = response.data;
    const pointsBalance = typeof pointsData.points === 'object'
      ? JSON.stringify(pointsData.points)
      : pointsData.points || 0;
    console.log(colors.fg.green + '\n=== Информация о баллах ===' + colors.reset);
    console.log(colors.fg.green + `Баланс баллов: ${pointsBalance}` + colors.reset);
    console.log(colors.fg.green + `Реферальные баллы: ${pointsData.referral_points || 0}` + colors.reset);
    console.log(colors.fg.green + `Общее количество баллов: ${pointsData.total_points || 0}` + colors.reset);
    console.log(colors.fg.green + '===========================' + colors.reset + '\n');
    return pointsData;
  } catch (error) {
    console.error(
      colors.fg.red +
      'Ошибка проверки баллов: ' +
      (error.response?.status || '') +
      ' ' +
      (error.response?.data || error.message) +
      colors.reset
    );
    return null;
  }
}

// Запуск бота для одного аккаунта
async function runSingleBot(account) {
  console.log(colors.fg.cyan + `Запуск бота для токена: ${account.token.slice(0, 6)}...` + colors.reset);
  const apiClient = createApiClient(account.token, account.proxy);
  const chatId = account.ai_id;
  if (!chatId) {
    console.error(colors.fg.red + 'Для этого аккаунта не указан ID чата (ai_id).' + colors.reset);
    return;
  }
  // Первичная проверка баллов
  await checkPoints(apiClient);
  
  // Основной цикл отправки сообщений
  setInterval(async () => {
    const points = await checkPoints(apiClient);
    if (!points || points.total_points <= 0) {
      console.log(colors.fg.yellow + 'Недостаточно баллов. Ожидание следующего интервала...' + colors.reset);
      return;
    }
    const message = getRandomMessage();
    const result = await sendMessageToThread(apiClient, chatId, message);
    if (!result) {
      console.log(colors.fg.red + 'Не удалось отправить сообщение.' + colors.reset);
    }
    await checkPoints(apiClient);
  }, CONFIG.CHAT_INTERVAL);
}

// Запуск ботов для всех аккаунтов
async function runAllBots() {
  const accountsObj = loadAccounts();
  if (!accountsObj.accounts.length) {
    console.log(colors.fg.red + 'Аккаунты не найдены. Сначала добавьте хотя бы один аккаунт.' + colors.reset);
    return;
  }
  // Запускаем бота для каждого аккаунта параллельно
  for (const account of accountsObj.accounts) {
    runSingleBot(account);
  }
  console.log(colors.fg.yellow + 'Все боты запущены. Нажмите CTRL+C, чтобы остановить.' + colors.reset);
  while (true) {
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
}

// Главное меню
async function mainMenu() {
  const choices = [
    { name: 'Установить зависимости (npm install axios uuid fs inquirer)', value: 'install' },
    { name: 'Добавить/Изменить аккаунт (токен, ai_id, proxy)', value: 'addAccount' },
    { name: 'Посмотреть список аккаунтов', value: 'listAccounts' },
    { name: 'Запустить чат-бот(ы) для всех аккаунтов', value: 'startBots' },
    { name: 'Выход', value: 'exit' }
  ];
  const answer = await inquirer.prompt([
    {
      type: 'list',
      name: 'action',
      message: 'Выберите действие:',
      choices
    }
  ]);
  return answer.action;
}

// Основная функция
async function main() {
  showBanner();
  const action = await mainMenu();
  switch (action) {
    case 'install':
      exec('npm install axios uuid fs inquirer', (error, stdout, stderr) => {
        if (error) {
          console.error(colors.fg.red + `Ошибка установки: ${error.message}` + colors.reset);
          return;
        }
        if (stderr) {
          console.error(colors.fg.red + `stderr: ${stderr}` + colors.reset);
          return;
        }
        console.log(colors.fg.green + 'Зависимости успешно установлены!' + colors.reset);
      });
      break;
    case 'addAccount':
      await addAccount();
      break;
    case 'listAccounts':
      listAccounts();
      break;
    case 'startBots':
      await runAllBots();
      break;
    case 'exit':
      console.log(colors.fg.cyan + 'Выход из программы.' + colors.reset);
      process.exit(0);
  }
}

main().catch(error => {
  console.error(colors.fg.red + 'Произошла ошибка в main():', error + colors.reset);
  process.exit(1);
});
