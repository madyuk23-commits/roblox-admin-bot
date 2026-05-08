const { Client, GatewayIntentBits, EmbedBuilder, SlashCommandBuilder, REST, Routes } = require('discord.js');
const express = require('express');
const cors = require('cors');

// ============ НАСТРОЙКА (ИЗМЕНИТЕ ЭТИ ЗНАЧЕНИЯ!) ============
const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const ALLOWED_USERS = (process.env.ALLOWED_USERS || '').split(',').map(id => id.trim());
const TEST_GUILD_ID = "1475122481026175059"; // ← ВСТАВЬТЕ СВОЙ ID СЕРВЕРА!
const LOG_CHANNEL_ID = "1502235930940145745"; // ← ВСТАВЬТЕ ID КАНАЛА ДЛЯ ЛОГОВ

console.log(`🔧 Настройки:`);
console.log(`   Сервер ID: ${TEST_GUILD_ID}`);
console.log(`   Разрешённые пользователи: ${ALLOWED_USERS.length}`);

// ============ ДАННЫЕ ============
let robloxAdmins = [];
let userBalances = {};
let userXP = {};
let userRanks = {};

// ============ СПИСОК РАНГОВ ============
const POLICE_RANKS = ["Рядовой", "Младший Сержант", "Сержант", "Старший Сержант", "Старшина", "Прапорщик", "Старший Прапорщик", "Младший Лейтенант", "Лейтенант", "Старший Лейтенант", "Капитан", "Майор", "Подполковник", "Полковник", "Генерал-Майор", "Генерал-Лейтенант", "Генерал-Полковник", "Генерал Полиции"];
const RANK_COLORS = {
    "Рядовой": { r: 128, g: 128, b: 128 }, "Младший Сержант": { r: 100, g: 149, b: 237 }, "Сержант": { r: 70, g: 130, b: 180 }, "Старший Сержант": { r: 0, g: 0, b: 139 }, "Старшина": { r: 0, g: 100, b: 0 }, "Прапорщик": { r: 255, g: 215, b: 0 }, "Старший Прапорщик": { r: 255, g: 165, b: 0 }, "Младший Лейтенант": { r: 0, g: 200, b: 200 }, "Лейтенант": { r: 0, g: 150, b: 200 }, "Старший Лейтенант": { r: 0, g: 100, b: 200 }, "Капитан": { r: 255, g: 0, b: 0 }, "Майор": { r: 220, g: 20, b: 60 }, "Подполковник": { r: 200, g: 0, b: 0 }, "Полковник": { r: 180, g: 0, b: 0 }, "Генерал-Майор": { r: 255, g: 100, b: 0 }, "Генерал-Лейтенант": { r: 255, g: 140, b: 0 }, "Генерал-Полковник": { r: 255, g: 180, b: 0 }, "Генерал Полиции": { r: 255, g: 215, b: 0 }
};

// ============ API СЕРВЕР ============
const app = express();
app.use(cors());
app.use(express.json());

app.get('/api/admins', (req, res) => { res.json({ admins: robloxAdmins }); });
app.get('/api/check/:userId', (req, res) => { const id = parseInt(req.params.userId); res.json({ userId: id, isAdmin: robloxAdmins.includes(id) }); });
app.get('/api/balance/:userId', (req, res) => { const id = parseInt(req.params.userId); res.json({ userId: id, balance: userBalances[id] || 0 }); });
app.get('/api/rank/:userId', (req, res) => { const id = parseInt(req.params.userId); const rank = userRanks[id] || "Рядовой"; const color = RANK_COLORS[rank]; res.json({ userId: id, rank, color }); });
app.post('/api/roblox/update-balance', (req, res) => { const { userId, amount } = req.body; userBalances[userId] = (userBalances[userId] || 0) + amount; res.json({ success: true }); });
app.post('/api/give-coins', (req, res) => { const { userId, amount, discordUserId } = req.body; if (!ALLOWED_USERS.includes(discordUserId)) return res.status(403).json({ error: 'Нет прав' }); userBalances[userId] = (userBalances[userId] || 0) + amount; res.json({ success: true }); });
app.post('/api/remove-coins', (req, res) => { const { userId, amount, discordUserId } = req.body; if (!ALLOWED_USERS.includes(discordUserId)) return res.status(403).json({ error: 'Нет прав' }); userBalances[userId] = Math.max(0, (userBalances[userId] || 0) - amount); res.json({ success: true }); });

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ API сервер запущен на порту ${PORT}`));

// ============ DISCORD БОТ ============
const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] });

async function getRobloxUserInfo(userId) { try { const res = await fetch(`https://users.roblox.com/v1/users/${userId}`); return await res.json(); } catch { return null; } }
async function sendLog(embed) { const logChannel = client.channels.cache.get(LOG_CHANNEL_ID); if (logChannel) await logChannel.send({ embeds: [embed] }); else console.warn(`⚠️ Канал с ID ${LOG_CHANNEL_ID} не найден!`); }

// ============ ОПРЕДЕЛЕНИЕ КОМАНД ============
const commandsData = [
    new SlashCommandBuilder().setName('addadmin').setDescription('Добавить администратора в Roblox').addIntegerOption(opt => opt.setName('robloxid').setDescription('Roblox ID').setRequired(true)),
    new SlashCommandBuilder().setName('removeadmin').setDescription('Удалить администратора из Roblox').addIntegerOption(opt => opt.setName('robloxid').setDescription('Roblox ID').setRequired(true)),
    new SlashCommandBuilder().setName('adminlist').setDescription('Список администраторов'),
    new SlashCommandBuilder().setName('finduser').setDescription('Найти пользователя Roblox по имени').addStringOption(opt => opt.setName('username').setDescription('Имя').setRequired(true)),
    new SlashCommandBuilder().setName('bankgive').setDescription('Выдать монеты игроку').addIntegerOption(opt => opt.setName('robloxid').setDescription('Roblox ID').setRequired(true)).addIntegerOption(opt => opt.setName('amount').setDescription('Количество').setRequired(true)),
    new SlashCommandBuilder().setName('bankremove').setDescription('Забрать монеты у игрока').addIntegerOption(opt => opt.setName('robloxid').setDescription('Roblox ID').setRequired(true)).addIntegerOption(opt => opt.setName('amount').setDescription('Количество').setRequired(true)),
    new SlashCommandBuilder().setName('bankinfo').setDescription('Узнать баланс игрока').addIntegerOption(opt => opt.setName('robloxid').setDescription('Roblox ID').setRequired(true)),
    new SlashCommandBuilder().setName('xp_give').setDescription('Выдать XP пользователю').addUserOption(opt => opt.setName('user').setRequired(true)).addIntegerOption(opt => opt.setName('amount').setRequired(true)).addStringOption(opt => opt.setName('reason')),
    new SlashCommandBuilder().setName('xp_info').setDescription('Узнать XP пользователя').addUserOption(opt => opt.setName('user')),
    new SlashCommandBuilder().setName('gamerole').setDescription('Изменить ранг полиции игроку').addIntegerOption(opt => opt.setName('robloxid').setDescription('Roblox ID').setRequired(true)).addStringOption(opt => opt.setName('rank').setDescription('Название ранга').setRequired(true))
];

// ============ РЕГИСТРАЦИЯ КОМАНД ============
async function registerCommands() {
    const rest = new REST({ version: '10' }).setToken(DISCORD_TOKEN);
    try {
        console.log('🧹 Очищаю ВСЕ старые команды...');
        await rest.put(Routes.applicationCommands(client.user.id), { body: [] });
        await rest.put(Routes.applicationGuildCommands(client.user.id, TEST_GUILD_ID), { body: [] });
        
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        console.log('📝 Регистрирую команды для сервера...');
        const result = await rest.put(Routes.applicationGuildCommands(client.user.id, TEST_GUILD_ID), { body: commandsData });
        console.log(`✅ Зарегистрировано ${result.length} команд:`);
        result.forEach(cmd => console.log(`   /${cmd.name}`));
        
    } catch (error) {
        console.error('❌ Ошибка:', error);
    }
}

// ============ ЗАПУСК БОТА ============
client.once('ready', async () => {
    console.log(`✅ Бот ${client.user.tag} запущен!`);
    await registerCommands();
    console.log(`🎉 Бот готов к работе!`);
