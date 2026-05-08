const { Client, GatewayIntentBits, EmbedBuilder, SlashCommandBuilder, REST, Routes } = require('discord.js');
const express = require('express');
const cors = require('cors');

// ============ НАСТРОЙКА ============
const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const ALLOWED_USERS = (process.env.ALLOWED_USERS || '').split(',').map(id => id.trim()).filter(id => id.length > 0);
const TEST_GUILD_ID = "1475122481026175059"; // ← ВСТАВЬТЕ ID ВАШЕГО СЕРВЕРА!
const LOG_CHANNEL_ID = "1502235930940145745"; // ← ВСТАВЬТЕ ID КАНАЛА

console.log(`🚀 Запуск бота...`);
console.log(`📋 Разрешённые пользователи Discord: ${ALLOWED_USERS.length > 0 ? ALLOWED_USERS.join(', ') : 'НЕТ?! Добавьте ID в переменную ALLOWED_USERS на Render'}`);

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

// ============ КОМАНДЫ (ТОЛЬКО РАБОЧИЕ) ============
const commandsData = [
    new SlashCommandBuilder().setName('addadmin').setDescription('Добавить администратора').addIntegerOption(opt => opt.setName('robloxid').setDescription('Roblox ID').setRequired(true)),
    new SlashCommandBuilder().setName('removeadmin').setDescription('Удалить администратора').addIntegerOption(opt => opt.setName('robloxid').setDescription('Roblox ID').setRequired(true)),
    new SlashCommandBuilder().setName('adminlist').setDescription('Список администраторов'),
    new SlashCommandBuilder().setName('finduser').setDescription('Найти пользователя').addStringOption(opt => opt.setName('username').setDescription('Имя').setRequired(true)),
    new SlashCommandBuilder().setName('bankgive').setDescription('Выдать монеты').addIntegerOption(opt => opt.setName('robloxid').setDescription('Roblox ID').setRequired(true)).addIntegerOption(opt => opt.setName('amount').setDescription('Кол-во').setRequired(true)),
    new SlashCommandBuilder().setName('bankremove').setDescription('Забрать монеты').addIntegerOption(opt => opt.setName('robloxid').setDescription('Roblox ID').setRequired(true)).addIntegerOption(opt => opt.setName('amount').setDescription('Кол-во').setRequired(true)),
    new SlashCommandBuilder().setName('bankinfo').setDescription('Баланс игрока').addIntegerOption(opt => opt.setName('robloxid').setDescription('Roblox ID').setRequired(true)),
    new SlashCommandBuilder().setName('gamerole').setDescription('Выдать ранг полиции').addIntegerOption(opt => opt.setName('robloxid').setDescription('Roblox ID').setRequired(true)).addStringOption(opt => opt.setName('rank').setDescription('Название ранга').setRequired(true))
];

async function registerCommands() {
    const rest = new REST({ version: '10' }).setToken(DISCORD_TOKEN);
    try {
        console.log('🧹 Очищаю старые команды...');
        await rest.put(Routes.applicationCommands(client.user.id), { body: [] });
        await rest.put(Routes.applicationGuildCommands(client.user.id, TEST_GUILD_ID), { body: [] });
        await new Promise(r => setTimeout(r, 2000));
        console.log('📝 Регистрирую новые команды...');
        const result = await rest.put(Routes.applicationGuildCommands(client.user.id, TEST_GUILD_ID), { body: commandsData });
        console.log(`✅ Зарегистрировано ${result.length} команд:`);
        result.forEach(cmd => console.log(`   /${cmd.name}`));
    } catch (error) { console.error('❌ Ошибка:', error); }
}

client.once('ready', async () => {
    console.log(`✅ Бот ${client.user.tag} запущен!`);
    await registerCommands();
});

// ============ ОБРАБОТЧИК КОМАНД ============
client.on('interactionCreate', async interaction => {
    if (!interaction.isCommand()) return;
    if (!ALLOWED_USERS.includes(interaction.user.id)) return interaction.reply({ content: '⛔ Нет прав!', ephemeral: true });
    
    const { commandName } = interaction;
    const robloxId = interaction.options.getInteger('robloxid');
    const amount = interaction.options.getInteger('amount');

    if (commandName === 'addadmin') {
        if (robloxAdmins.includes(robloxId)) return interaction.reply({ content: '⚠️ Уже в списке!', ephemeral: true });
        robloxAdmins.push(robloxId);
        interaction.reply({ content: `✅ Администратор ${robloxId} добавлен!`, ephemeral: true });
    }
    else if (commandName === 'removeadmin') {
        const idx = robloxAdmins.indexOf(robloxId);
        if (idx === -1) return interaction.reply({ content: '⚠️ Не найден!', ephemeral: true });
        robloxAdmins.splice(idx, 1);
        interaction.reply({ content: `❌ Администратор ${robloxId} удалён!`, ephemeral: true });
    }
    else if (commandName === 'adminlist') {
        if (!robloxAdmins.length) return interaction.reply({ content: '📋 Список администраторов пуст!', ephemeral: true });
        const list = []; for (const id of robloxAdmins) { const info = await getRobloxUserInfo(id); list.push(`🔹 **${info?.name || 'Неизвестно'}** (ID: ${id})`); }
        interaction.reply({ content: `📋 **Список администраторов:**\n${list.join('\n')}`, ephemeral: true });
    }
    else if (commandName === 'finduser') {
        const username = interaction.options.getString('username');
        try { const res = await fetch(`https://users.roblox.com/v1/users/search?keyword=${encodeURIComponent(username)}&limit=1`); const data = await res.json();
        if (data.data?.length) { const user = data.data[0]; interaction.reply({ content: `🔍 **${user.name}**\nID: ${user.id}\nСсылка: https://www.roblox.com/users/${user.id}/profile`, ephemeral: true }); }
        else { interaction.reply({ content: `❌ Пользователь ${username} не найден!`, ephemeral: true }); }
        } catch { interaction.reply({ content: '❌ Ошибка поиска!', ephemeral: true }); }
    }
    else if (commandName === 'bankgive') { userBalances[robloxId] = (userBalances[robloxId] || 0) + amount; interaction.reply({ content: `💰 Выдано ${amount} монет игроку ${robloxId}. Новый баланс: ${userBalances[robloxId]}`, ephemeral: true }); }
    else if (commandName === 'bankremove') { userBalances[robloxId] = Math.max(0, (userBalances[robloxId] || 0) - amount); interaction.reply({ content: `💰 Забрано ${amount} монет у игрока ${robloxId}. Новый баланс: ${userBalances[robloxId]}`, ephemeral: true }); }
    else if (commandName === 'bankinfo') { const balance = userBalances[robloxId] || 0; interaction.reply({ content: `💰 Баланс игрока ${robloxId}: ${balance} монет`, ephemeral: true }); }
    else if (commandName === 'gamerole') { const rank = interaction.options.getString('rank'); if (!POLICE_RANKS.includes(rank)) return interaction.reply({ content: `❌ Ранг "${rank}" не найден! Доступные ранги: ${POLICE_RANKS.join(', ')}`, ephemeral: true }); userRanks[robloxId] = rank; interaction.reply({ content: `👮‍♂️ Игроку ${robloxId} выдан ранг "${rank}"!`, ephemeral: true }); }
});

client.login(DISCORD_TOKEN);
console.log('🚀 Бот запускается...');
