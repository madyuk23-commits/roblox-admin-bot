const { Client, GatewayIntentBits, EmbedBuilder, SlashCommandBuilder, REST, Routes } = require('discord.js');
const express = require('express');
const cors = require('cors');

// ============ НАСТРОЙКА ============
const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const ALLOWED_USERS = (process.env.ALLOWED_USERS || '').split(',').map(id => id.trim());
const TEST_GUILD_ID = "1475122481026175059"; // ЗАМЕНИТЕ НА ID ВАШЕГО СЕРВЕРА
const LOG_CHANNEL_ID = "1502235930940145745"; // ID канала для логов XP

// ============ ДАННЫЕ ============
let robloxAdmins = [];      // Список администраторов Roblox
let userBalances = {};      // Балансы монет { "robloxId": количество }
let userXP = {};            // XP пользователей Discord { "discordId": количество_xp }

// ============ API СЕРВЕР ДЛЯ ROBLOX ============
const app = express();
app.use(cors());
app.use(express.json());

// АДМИНКА
app.get('/api/admins', (req, res) => {
    res.json({ admins: robloxAdmins });
});

app.get('/api/check/:userId', (req, res) => {
    const userId = parseInt(req.params.userId);
    const isAdmin = robloxAdmins.includes(userId);
    res.json({ userId, isAdmin });
});

// БАНК (чтение)
app.get('/api/balance/:userId', (req, res) => {
    const userId = parseInt(req.params.userId);
    const balance = userBalances[userId] || 0;
    res.json({ userId, balance });
});

// БАНК (обновление через Roblox)
app.post('/api/roblox/update-balance', (req, res) => {
    const { userId, amount } = req.body;
    if (!userId) return res.status(400).json({ error: 'userId обязателен' });
    
    const current = userBalances[userId] || 0;
    userBalances[userId] = current + amount;
    console.log(`💰 Roblox обновил баланс ${userId}: ${current} → ${userBalances[userId]}`);
    res.json({ success: true, newBalance: userBalances[userId] });
});

// БАНК (Discord команды)
app.post('/api/give-coins', (req, res) => {
    const { userId, amount, discordUserId } = req.body;
    if (!ALLOWED_USERS.includes(discordUserId)) return res.status(403).json({ error: 'Нет прав' });
    
    const current = userBalances[userId] || 0;
    userBalances[userId] = current + amount;
    res.json({ success: true, newBalance: userBalances[userId] });
});

app.post('/api/remove-coins', (req, res) => {
    const { userId, amount, discordUserId } = req.body;
    if (!ALLOWED_USERS.includes(discordUserId)) return res.status(403).json({ error: 'Нет прав' });
    
    const current = userBalances[userId] || 0;
    userBalances[userId] = Math.max(0, current - amount);
    res.json({ success: true, newBalance: userBalances[userId] });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ API сервер запущен на порту ${PORT}`));

// ============ DISCORD БОТ ============
const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
});

async function getRobloxUserInfo(userId) {
    try {
        const res = await fetch(`https://users.roblox.com/v1/users/${userId}`);
        return await res.json();
    } catch {
        return null;
    }
}

// Функция отправки лога в канал (ПУБЛИЧНО)
async function sendLog(embed) {
    const logChannel = client.channels.cache.get(LOG_CHANNEL_ID);
    if (logChannel) {
        await logChannel.send({ embeds: [embed] });
        console.log(`📝 Лог отправлен в канал ${LOG_CHANNEL_ID}`);
    } else {
        console.warn(`⚠️ Канал с ID ${LOG_CHANNEL_ID} не найден! Проверьте ID.`);
    }
}

// ============ КОМАНДЫ ============
const commandsData = [
    // АДМИНКА
    new SlashCommandBuilder().setName('addadmin').setDescription('Добавить администратора в Roblox').addIntegerOption(opt => opt.setName('robloxid').setDescription('Roblox ID').setRequired(true)),
    new SlashCommandBuilder().setName('removeadmin').setDescription('Удалить администратора из Roblox').addIntegerOption(opt => opt.setName('robloxid').setDescription('Roblox ID').setRequired(true)),
    new SlashCommandBuilder().setName('adminlist').setDescription('Список администраторов'),
    new SlashCommandBuilder().setName('finduser').setDescription('Найти пользователя Roblox').addStringOption(opt => opt.setName('username').setDescription('Имя').setRequired(true)),
    
    // БАНК
    new SlashCommandBuilder().setName('bankgive').setDescription('Выдать монеты игроку').addIntegerOption(opt => opt.setName('robloxid').setDescription('Roblox ID').setRequired(true)).addIntegerOption(opt => opt.setName('amount').setDescription('Количество').setRequired(true)),
    new SlashCommandBuilder().setName('bankremove').setDescription('Забрать монеты у игрока').addIntegerOption(opt => opt.setName('robloxid').setDescription('Roblox ID').setRequired(true)).addIntegerOption(opt => opt.setName('amount').setDescription('Количество').setRequired(true)),
    new SlashCommandBuilder().setName('bankinfo').setDescription('Узнать баланс игрока').addIntegerOption(opt => opt.setName('robloxid').setDescription('Roblox ID').setRequired(true)),
    
    // XP СИСТЕМА
    new SlashCommandBuilder().setName('xp_give').setDescription('Выдать XP пользователю').addUserOption(opt => opt.setName('user').setDescription('Пользователь Discord').setRequired(true)).addIntegerOption(opt => opt.setName('amount').setDescription('Количество XP').setRequired(true)).addStringOption(opt => opt.setName('reason').setDescription('Причина выдачи').setRequired(false)),
    new SlashCommandBuilder().setName('xp_info').setDescription('Узнать сколько XP у пользователя').addUserOption(opt => opt.setName('user').setDescription('Пользователь Discord').setRequired(false)),
];

async function registerCommands() {
    const rest = new REST({ version: '10' }).setToken(DISCORD_TOKEN);
    try {
        console.log('🧹 Очищаю старые команды...');
        await rest.put(Routes.applicationCommands(client.user.id), { body: [] });
        await rest.put(Routes.applicationGuildCommands(client.user.id, TEST_GUILD_ID), { body: [] });
        console.log('📝 Регистрирую новые команды...');
        await rest.put(Routes.applicationGuildCommands(client.user.id, TEST_GUILD_ID), { body: commandsData });
        console.log('✅ Команды зарегистрированы!');
    } catch (e) { console.error('❌ Ошибка:', e); }
}

client.once('ready', async () => {
    console.log(`✅ Бот ${client.user.tag} запущен!`);
    await registerCommands();
});

// ============ ОБРАБОТЧИК КОМАНД (ВСЕ ОТВЕТЫ ТОЛЬКО ДЛЯ ОТПРАВИТЕЛЯ) ============
client.on('interactionCreate', async interaction => {
    if (!interaction.isCommand()) return;
    if (!ALLOWED_USERS.includes(interaction.user.id)) {
        return interaction.reply({ 
            embeds: [new EmbedBuilder().setColor(0xFF0000).setTitle('⛔ ДОСТУП ЗАПРЕЩЁН')], 
            ephemeral: true 
        });
    }
    
    const { commandName } = interaction;
    const robloxId = interaction.options.getInteger('robloxid');
    const amount = interaction.options.getInteger('amount');
    
    // ========== АДМИНКА (ТОЛЬКО ДЛЯ ОТПРАВИТЕЛЯ) ==========
    if (commandName === 'addadmin') {
        if (robloxAdmins.includes(robloxId)) return interaction.reply({ 
            embeds: [new EmbedBuilder().setColor(0xFFAA00).setTitle('⚠️ Уже в списке').setDescription(`ID ${robloxId} уже добавлен!`)], 
            ephemeral: true 
        });
        robloxAdmins.push(robloxId);
        const info = await getRobloxUserInfo(robloxId);
        interaction.reply({ 
            embeds: [new EmbedBuilder().setColor(0x00FF00).setTitle('✅ АДМИНИСТРАТОР ДОБАВЛЕН').setDescription(`**ID:** ${robloxId}\n**Имя:** ${info?.name || 'Неизвестно'}\n**Добавил:** ${interaction.user.tag}`).setTimestamp()], 
            ephemeral: true 
        });
    }
    
    if (commandName === 'removeadmin') {
        const idx = robloxAdmins.indexOf(robloxId);
        if (idx === -1) return interaction.reply({ 
            embeds: [new EmbedBuilder().setColor(0xFFAA00).setTitle('⚠️ Не найден').setDescription(`ID ${robloxId} не найден!`)], 
            ephemeral: true 
        });
        robloxAdmins.splice(idx, 1);
        const info = await getRobloxUserInfo(robloxId);
        interaction.reply({ 
            embeds: [new EmbedBuilder().setColor(0xFF0000).setTitle('❌ АДМИНИСТРАТОР УДАЛЁН').setDescription(`**ID:** ${robloxId}\n**Имя:** ${info?.name || 'Неизвестно'}\n**Удалил:** ${interaction.user.tag}`).setTimestamp()], 
            ephemeral: true 
        });
    }
    
    if (commandName === 'adminlist') {
        if (!robloxAdmins.length) return interaction.reply({ 
            embeds: [new EmbedBuilder().setColor(0xFFAA00).setTitle('📋 СПИСОК АДМИНИСТРАТОРОВ').setDescription('Список пуст!')], 
            ephemeral: true 
        });
        const list = [];
        for (const id of robloxAdmins) {
            const info = await getRobloxUserInfo(id);
            list.push(`🔹 **${info?.name || 'Неизвестно'}** (ID: ${id})`);
        }
        interaction.reply({ 
            embeds: [new EmbedBuilder().setColor(0x00AAFF).setTitle('📋 СПИСОК АДМИНИСТРАТОРОВ').setDescription(list.join('\n')).addFields({ name: '📊 Всего', value: `${robloxAdmins.length}` })], 
            ephemeral: true 
        });
    }
    
    if (commandName === 'finduser') {
        const username = interaction.options.getString('username');
        try {
            const res = await fetch(`https://users.roblox.com/v1/users/search?keyword=${encodeURIComponent(username)}&limit=1`);
            const data = await res.json();
            if (data.data?.length) {
                const user = data.data[0];
                const isAdmin = robloxAdmins.includes(user.id);
                interaction.reply({ 
                    embeds: [new EmbedBuilder().setColor(isAdmin ? 0x00FF00 : 0xAAAAAA).setTitle('
