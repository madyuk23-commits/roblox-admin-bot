const { Client, GatewayIntentBits, EmbedBuilder, SlashCommandBuilder, REST, Routes } = require('discord.js');
const express = require('express');
const cors = require('cors');

// ============ НАСТРОЙКА ============
const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const ALLOWED_USERS = (process.env.ALLOWED_USERS || '').split(',').map(id => id.trim());
const TEST_GUILD_ID = "1475122481026175059"; // ЗАМЕНИТЕ НА ID ВАШЕГО СЕРВЕРА

// ============ ДАННЫЕ ============
let robloxAdmins = [];      // Список администраторов Roblox (ID)
let userBalances = {};      // Балансы игроков { "robloxId": количество_монет }

// ============ API СЕРВЕР ДЛЯ ROBLOX ============
const app = express();
app.use(cors());
app.use(express.json());

// ----- АДМИНКА -----
app.get('/api/admins', (req, res) => {
    res.json({ admins: robloxAdmins });
});

app.get('/api/check/:userId', (req, res) => {
    const userId = parseInt(req.params.userId);
    const isAdmin = robloxAdmins.includes(userId);
    res.json({ userId, isAdmin });
});

// ----- БАНК (чтение для Roblox) -----
app.get('/api/balance/:userId', (req, res) => {
    const userId = parseInt(req.params.userId);
    const balance = userBalances[userId] || 0;
    res.json({ userId, balance });
});

// ----- БАНК (обновление через Roblox) -----
app.post('/api/roblox/update-balance', (req, res) => {
    const { userId, amount } = req.body;
    if (!userId) return res.status(400).json({ error: 'userId обязателен' });
    
    const current = userBalances[userId] || 0;
    userBalances[userId] = current + amount;
    console.log(`💰 Roblox обновил баланс ${userId}: ${current} → ${userBalances[userId]}`);
    res.json({ success: true, newBalance: userBalances[userId] });
});

// ----- БАНК (Discord команды с проверкой прав) -----
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

// ============ РЕГИСТРАЦИЯ КОМАНД ============
const commandsData = [
    new SlashCommandBuilder().setName('addadmin').setDescription('Добавить администратора в Roblox').addIntegerOption(opt => opt.setName('robloxid').setDescription('Roblox ID').setRequired(true)),
    new SlashCommandBuilder().setName('removeadmin').setDescription('Удалить администратора из Roblox').addIntegerOption(opt => opt.setName('robloxid').setDescription('Roblox ID').setRequired(true)),
    new SlashCommandBuilder().setName('adminlist').setDescription('Список администраторов'),
    new SlashCommandBuilder().setName('finduser').setDescription('Найти пользователя Roblox').addStringOption(opt => opt.setName('username').setDescription('Имя').setRequired(true)),
    new SlashCommandBuilder().setName('bankgive').setDescription('Выдать монеты игроку').addIntegerOption(opt => opt.setName('robloxid').setDescription('Roblox ID').setRequired(true)).addIntegerOption(opt => opt.setName('amount').setDescription('Количество').setRequired(true)),
    new SlashCommandBuilder().setName('bankremove').setDescription('Забрать монеты у игрока').addIntegerOption(opt => opt.setName('robloxid').setDescription('Roblox ID').setRequired(true)).addIntegerOption(opt => opt.setName('amount').setDescription('Количество').setRequired(true)),
    new SlashCommandBuilder().setName('bankinfo').setDescription('Узнать баланс игрока').addIntegerOption(opt => opt.setName('robloxid').setDescription('Roblox ID').setRequired(true)),
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

// ============ ОБРАБОТЧИК КОМАНД ============
client.on('interactionCreate', async interaction => {
    if (!interaction.isCommand()) return;
    if (!ALLOWED_USERS.includes(interaction.user.id)) {
        return interaction.reply({ embeds: [new EmbedBuilder().setColor(0xFF0000).setTitle('⛔ ДОСТУП ЗАПРЕЩЁН')], ephemeral: true });
    }
    
    const { commandName } = interaction;
    const robloxId = interaction.options.getInteger('robloxid');
    const amount = interaction.options.getInteger('amount');
    
    // addadmin
    if (commandName === 'addadmin') {
        if (robloxAdmins.includes(robloxId)) return interaction.reply({ embeds: [new EmbedBuilder().setColor(0xFFAA00).setTitle('⚠️ Уже в списке').setDescription(`ID ${robloxId} уже добавлен!`)] });
        robloxAdmins.push(robloxId);
        const info = await getRobloxUserInfo(robloxId);
        interaction.reply({ embeds: [new EmbedBuilder().setColor(0x00FF00).setTitle('✅ АДМИНИСТРАТОР ДОБАВЛЕН').setDescription(`**ID:** ${robloxId}\n**Имя:** ${info?.name || 'Неизвестно'}\n**Добавил:** ${interaction.user.tag}`).setTimestamp()] });
    }
    
    // removeadmin
    if (commandName === 'removeadmin') {
        const idx = robloxAdmins.indexOf(robloxId);
        if (idx === -1) return interaction.reply({ embeds: [new EmbedBuilder().setColor(0xFFAA00).setTitle('⚠️ Не найден').setDescription(`ID ${robloxId} не найден!`)] });
        robloxAdmins.splice(idx, 1);
        const info = await getRobloxUserInfo(robloxId);
        interaction.reply({ embeds: [new EmbedBuilder().setColor(0xFF0000).setTitle('❌ АДМИНИСТРАТОР УДАЛЁН').setDescription(`**ID:** ${robloxId}\n**Имя:** ${info?.name || 'Неизвестно'}\n**Удалил:** ${interaction.user.tag}`).setTimestamp()] });
    }
    
    // adminlist
    if (commandName === 'adminlist') {
        if (!robloxAdmins.length) return interaction.reply({ embeds: [new EmbedBuilder().setColor(0xFFAA00).setTitle('📋 СПИСОК АДМИНИСТРАТОРОВ').setDescription('Список пуст!')] });
        const list = [];
        for (const id of robloxAdmins) {
            const info = await getRobloxUserInfo(id);
            list.push(`🔹 **${info?.name || 'Неизвестно'}** (ID: ${id})`);
        }
        interaction.reply({ embeds: [new EmbedBuilder().setColor(0x00AAFF).setTitle('📋 СПИСОК АДМИНИСТРАТОРОВ').setDescription(list.join('\n')).addFields({ name: '📊 Всего', value: `${robloxAdmins.length}` })] });
    }
    
    // finduser
    if (commandName === 'finduser') {
        const username = interaction.options.getString('username');
        try {
            const res = await fetch(`https://users.roblox.com/v1/users/search?keyword=${encodeURIComponent(username)}&limit=1`);
            const data = await res.json();
            if (data.data?.length) {
                const user = data.data[0];
                const isAdmin = robloxAdmins.includes(user.id);
                interaction.reply({ embeds: [new EmbedBuilder().setColor(isAdmin ? 0x00FF00 : 0xAAAAAA).setTitle('🔍 РЕЗУЛЬТАТ ПОИСКА').setDescription(`**Имя:** ${user.name}\n**ID:** ${user.id}\n**Статус:** ${isAdmin ? '✅ Администратор' : '❌ Не администратор'}\n**Ссылка:** https://www.roblox.com/users/${user.id}/profile`)] });
            } else {
                interaction.reply({ embeds: [new EmbedBuilder().setColor(0xFF0000).setTitle('❌ Не найдено').setDescription(`Пользователь ${username} не найден!`)] });
            }
        } catch { interaction.reply({ embeds: [new EmbedBuilder().setColor(0xFF0000).setTitle('❌ Ошибка').setDescription('Ошибка поиска')] }); }
    }
    
    // bankgive
    if (commandName === 'bankgive') {
        const current = userBalances[robloxId] || 0;
        userBalances[robloxId] = current + amount;
        const info = await getRobloxUserInfo(robloxId);
        interaction.reply({ embeds: [new EmbedBuilder().setColor(0x00FF00).setTitle('💰 МОНЕТЫ ВЫДАНЫ').setDescription(`**Игрок:** ${info?.name || robloxId}\n**Выдано:** ${amount} 💎\n**Новый баланс:** ${userBalances[robloxId]} 💎`).setTimestamp()] });
    }
    
    // bankremove
    if (commandName === 'bankremove') {
        const current = userBalances[robloxId] || 0;
        userBalances[robloxId] = Math.max(0, current - amount);
        const info = await getRobloxUserInfo(robloxId);
        interaction.reply({ embeds: [new EmbedBuilder().setColor(0xFF0000).setTitle('💰 МОНЕТЫ ЗАБРАНЫ').setDescription(`**Игрок:** ${info?.name || robloxId}\n**Забрано:** ${amount} 💎\n**Новый баланс:** ${userBalances[robloxId]} 💎`).setTimestamp()] });
    }
    
    // bankinfo
    if (commandName === 'bankinfo') {
        const balance = userBalances[robloxId] || 0;
        const info = await getRobloxUserInfo(robloxId);
        interaction.reply({ embeds: [new EmbedBuilder().setColor(0x00AAFF).setTitle('💰 БАЛАНС ИГРОКА').setDescription(`**Игрок:** ${info?.name || robloxId}\n**Баланс:** ${balance} 💎`).setTimestamp()] });
    }
});

client.login(DISCORD_TOKEN);
console.log('🚀 Бот запускается...');
