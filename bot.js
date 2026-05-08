const { Client, GatewayIntentBits, EmbedBuilder, SlashCommandBuilder, REST, Routes } = require('discord.js');
const express = require('express');
const cors = require('cors');

// ============ НАСТРОЙКА ============
const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const ALLOWED_USERS = (process.env.ALLOWED_USERS || '').split(',').map(id => id.trim());
const TEST_GUILD_ID = "1475122481026175059";
const LOG_CHANNEL_ID = "1502235930940145745";

// ============ ДАННЫЕ ============
let robloxAdmins = [];
let userBalances = {};
let userXP = {};
let userRanks = {};

// ============ СПИСОК РАНГОВ ПОЛИЦИИ ============
const POLICE_RANKS = [
    "Рядовой", "Младший Сержант", "Сержант", "Старший Сержант", "Старшина",
    "Прапорщик", "Старший Прапорщик", "Младший Лейтенант", "Лейтенант", "Старший Лейтенант",
    "Капитан", "Майор", "Подполковник", "Полковник", "Генерал-Майор",
    "Генерал-Лейтенант", "Генерал-Полковник", "Генерал Полиции"
];

const RANK_COLORS = {
    "Рядовой": { r: 128, g: 128, b: 128 },
    "Младший Сержант": { r: 100, g: 149, b: 237 },
    "Сержант": { r: 70, g: 130, b: 180 },
    "Старший Сержант": { r: 0, g: 0, b: 139 },
    "Старшина": { r: 0, g: 100, b: 0 },
    "Прапорщик": { r: 255, g: 215, b: 0 },
    "Старший Прапорщик": { r: 255, g: 165, b: 0 },
    "Младший Лейтенант": { r: 0, g: 200, b: 200 },
    "Лейтенант": { r: 0, g: 150, b: 200 },
    "Старший Лейтенант": { r: 0, g: 100, b: 200 },
    "Капитан": { r: 255, g: 0, b: 0 },
    "Майор": { r: 220, g: 20, b: 60 },
    "Подполковник": { r: 200, g: 0, b: 0 },
    "Полковник": { r: 180, g: 0, b: 0 },
    "Генерал-Майор": { r: 255, g: 100, b: 0 },
    "Генерал-Лейтенант": { r: 255, g: 140, b: 0 },
    "Генерал-Полковник": { r: 255, g: 180, b: 0 },
    "Генерал Полиции": { r: 255, g: 215, b: 0 }
};

// ============ API СЕРВЕР ============
const app = express();
app.use(cors());
app.use(express.json());

app.get('/api/admins', (req, res) => { res.json({ admins: robloxAdmins }); });
app.get('/api/check/:userId', (req, res) => {
    res.json({ userId: parseInt(req.params.userId), isAdmin: robloxAdmins.includes(parseInt(req.params.userId)) });
});
app.get('/api/balance/:userId', (req, res) => {
    res.json({ userId: parseInt(req.params.userId), balance: userBalances[parseInt(req.params.userId)] || 0 });
});
app.get('/api/rank/:userId', (req, res) => {
    const userId = parseInt(req.params.userId);
    const rank = userRanks[userId] || "Рядовой";
    const color = RANK_COLORS[rank] || { r: 128, g: 128, b: 128 };
    res.json({ userId, rank, color });
});
app.post('/api/roblox/update-balance', (req, res) => {
    const { userId, amount } = req.body;
    if (!userId) return res.status(400).json({ error: 'userId обязателен' });
    userBalances[userId] = (userBalances[userId] || 0) + amount;
    res.json({ success: true, newBalance: userBalances[userId] });
});
app.post('/api/give-coins', (req, res) => {
    const { userId, amount, discordUserId } = req.body;
    if (!ALLOWED_USERS.includes(discordUserId)) return res.status(403).json({ error: 'Нет прав' });
    userBalances[userId] = (userBalances[userId] || 0) + amount;
    res.json({ success: true });
});
app.post('/api/remove-coins', (req, res) => {
    const { userId, amount, discordUserId } = req.body;
    if (!ALLOWED_USERS.includes(discordUserId)) return res.status(403).json({ error: 'Нет прав' });
    userBalances[userId] = Math.max(0, (userBalances[userId] || 0) - amount);
    res.json({ success: true });
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
    } catch { return null; }
}

async function sendLog(embed) {
    const logChannel = client.channels.cache.get(LOG_CHANNEL_ID);
    if (logChannel) await logChannel.send({ embeds: [embed] });
    else console.warn(`⚠️ Канал с ID ${LOG_CHANNEL_ID} не найден!`);
}

// ============ КОМАНДЫ ============
const commandsData = [
    new SlashCommandBuilder().setName('addadmin').setDescription('Добавить администратора в Roblox').addIntegerOption(opt => opt.setName('robloxid').setDescription('Roblox ID').setRequired(true)),
    new SlashCommandBuilder().setName('removeadmin').setDescription('Удалить администратора из Roblox').addIntegerOption(opt => opt.setName('robloxid').setDescription('Roblox ID').setRequired(true)),
    new SlashCommandBuilder().setName('adminlist').setDescription('Список администраторов'),
    new SlashCommandBuilder().setName('finduser').setDescription('Найти пользователя Roblox').addStringOption(opt => opt.setName('username').setDescription('Имя').setRequired(true)),
    new SlashCommandBuilder().setName('bankgive').setDescription('Выдать монеты игроку').addIntegerOption(opt => opt.setName('robloxid').setDescription('Roblox ID').setRequired(true)).addIntegerOption(opt => opt.setName('amount').setDescription('Количество').setRequired(true)),
    new SlashCommandBuilder().setName('bankremove').setDescription('Забрать монеты у игрока').addIntegerOption(opt => opt.setName('robloxid').setDescription('Roblox ID').setRequired(true)).addIntegerOption(opt => opt.setName('amount').setDescription('Количество').setRequired(true)),
    new SlashCommandBuilder().setName('bankinfo').setDescription('Узнать баланс игрока').addIntegerOption(opt => opt.setName('robloxid').setDescription('Roblox ID').setRequired(true)),
    new SlashCommandBuilder().setName('xp_give').setDescription('Выдать XP пользователю').addUserOption(opt => opt.setName('user').setDescription('Пользователь Discord').setRequired(true)).addIntegerOption(opt => opt.setName('amount').setDescription('Количество XP').setRequired(true)).addStringOption(opt => opt.setName('reason').setDescription('Причина').setRequired(false)),
    new SlashCommandBuilder().setName('xp_info').setDescription('Узнать XP пользователя').addUserOption(opt => opt.setName('user').setDescription('Пользователь Discord').setRequired(false)),
    new SlashCommandBuilder().setName('gamerole').setDescription('Изменить ранг полиции игроку').addIntegerOption(opt => opt.setName('robloxid').setDescription('Roblox ID').setRequired(true)).addStringOption(opt => opt.setName('rank').setDescription('Название ранга').setRequired(true))
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

    // АДМИНКА
    if (commandName === 'addadmin') {
        if (robloxAdmins.includes(robloxId)) return interaction.reply({ embeds: [new EmbedBuilder().setColor(0xFFAA00).setTitle('⚠️ Уже в списке')], ephemeral: true });
        robloxAdmins.push(robloxId);
        const info = await getRobloxUserInfo(robloxId);
        interaction.reply({ embeds: [new EmbedBuilder().setColor(0x00FF00).setTitle('✅ АДМИНИСТРАТОР ДОБАВЛЕН').setDescription(`**ID:** ${robloxId}\n**Имя:** ${info?.name || 'Неизвестно'}\n**Добавил:** ${interaction.user.tag}`)], ephemeral: true });
    }
    if (commandName === 'removeadmin') {
        const idx = robloxAdmins.indexOf(robloxId);
        if (idx === -1) return interaction.reply({ embeds: [new EmbedBuilder().setColor(0xFFAA00).setTitle('⚠️ Не найден')], ephemeral: true });
        robloxAdmins.splice(idx, 1);
        const info = await getRobloxUserInfo(robloxId);
        interaction.reply({ embeds: [new EmbedBuilder().setColor(0xFF0000).setTitle('❌ АДМИНИСТРАТОР УДАЛЁН').setDescription(`**ID:** ${robloxId}\n**Имя:** ${info?.name || 'Неизвестно'}\n**Удалил:** ${interaction.user.tag}`)], ephemeral: true });
    }
    if (commandName === 'adminlist') {
        if (!robloxAdmins.length) return interaction.reply({ embeds: [new EmbedBuilder().setColor(0xFFAA00).setTitle('📋 СПИСОК АДМИНИСТРАТОРОВ').setDescription('Список пуст!')], ephemeral: true });
        const list = [];
        for (const id of robloxAdmins) {
            const info = await getRobloxUserInfo(id);
            list.push(`🔹 **${info?.name || 'Неизвестно'}** (ID: ${id})`);
        }
        interaction.reply({ embeds: [new EmbedBuilder().setColor(0x00AAFF).setTitle('📋 СПИСОК АДМИНИСТРАТОРОВ').setDescription(list.join('\n')).addFields({ name: '📊 Всего', value: `${robloxAdmins.length}` })], ephemeral: true });
    }
    if (commandName === 'finduser') {
        const username = interaction.options.getString('username');
        try {
            const res = await fetch(`https://users.roblox.com/v1/users/search?keyword=${encodeURIComponent(username)}&limit=1`);
            const data = await res.json();
            if (data.data?.length) {
                const user = data.data[0];
                const isAdmin = robloxAdmins.includes(user.id);
                interaction.reply({ embeds: [new EmbedBuilder().setColor(isAdmin ? 0x00FF00 : 0xAAAAAA).setTitle('🔍 РЕЗУЛЬТАТ ПОИСКА').setDescription(`**Имя:** ${user.name}\n**ID:** ${user.id}\n**Статус:** ${isAdmin ? '✅ Администратор' : '❌ Не администратор'}\n**Ссылка:** https://www.roblox.com/users/${user.id}/profile`)], ephemeral: true });
            } else {
                interaction.reply({ embeds: [new EmbedBuilder().setColor(0xFF0000).setTitle('❌ Не найдено').setDescription(`Пользователь ${username} не найден!`)], ephemeral: true });
            }
        } catch { interaction.reply({ embeds: [new EmbedBuilder().setColor(0xFF0000).setTitle('❌ Ошибка').setDescription('Ошибка поиска')], ephemeral: true }); }
    }

    // БАНК
    if (commandName === 'bankgive') {
        const current = userBalances[robloxId] || 0;
        userBalances[robloxId] = current + amount;
        const info = await getRobloxUserInfo(robloxId);
        interaction.reply({ embeds: [new EmbedBuilder().setColor(0x00FF00).setTitle('💰 МОНЕТЫ ВЫДАНЫ').setDescription(`**Игрок:** ${info?.name || robloxId}\n**Выдано:** ${amount} 💎\n**Новый баланс:** ${userBalances[robloxId]} 💎`)], ephemeral: true });
    }
    if (commandName === 'bankremove') {
        const current = userBalances[robloxId] || 0;
        userBalances[robloxId] = Math.max(0, current - amount);
        const info = await getRobloxUserInfo(robloxId);
        interaction.reply({ embeds: [new EmbedBuilder().setColor(0xFF0000).setTitle('💰 МОНЕТЫ ЗАБРАНЫ').setDescription(`**Игрок:** ${info?.name || robloxId}\n**Забрано:** ${amount} 💎\n**Новый баланс:** ${userBalances[robloxId]} 💎`)], ephemeral: true });
    }
    if (commandName === 'bankinfo') {
        const balance = userBalances[robloxId] || 0;
        const info = await getRobloxUserInfo(robloxId);
        interaction.reply({ embeds: [new EmbedBuilder().setColor(0x00AAFF).setTitle('💰 БАЛАНС ИГРОКА').setDescription(`**Игрок:** ${info?.name || robloxId}\n**Баланс:** ${balance} 💎`)], ephemeral: true });
    }

    // XP
    if (commandName === 'xp_give') {
        const targetUser = interaction.options.getUser('user');
        const xpAmount = interaction.options.getInteger('amount');
        const reason = interaction.options.getString('reason') || 'Без причины';
        userXP[targetUser.id] = (userXP[targetUser.id] || 0) + xpAmount;
        await interaction.reply({ embeds: [new EmbedBuilder().setColor(0x00FF00).setTitle('✨ XP ВЫДАНЫ').setDescription(`**Кому:** ${targetUser}\n**Количество:** ${xpAmount} XP\n**Причина:** ${reason}`)], ephemeral: true });
        await sendLog(new EmbedBuilder().setColor(0x00AAFF).setTitle('📝 ЛОГ ВЫДАЧИ XP').setDescription(`**Кому:** ${targetUser} (${targetUser.id})\n**Количество:** ${xpAmount} XP\n**Причина:** ${reason}\n**Выдал:** ${interaction.user.tag}`).setTimestamp());
    }
    if (commandName === 'xp_info') {
        const targetUser = interaction.options.getUser('user') || interaction.user;
        const xp = userXP[targetUser.id] || 0;
        interaction.reply({ embeds: [new EmbedBuilder().setColor(0x00AAFF).setTitle('📊 ИНФОРМАЦИЯ О XP').setDescription(`**Пользователь:** ${targetUser}\n**Всего XP:** ${xp}`)], ephemeral: true });
    }

    // РАНГИ ПОЛИЦИИ
    if (commandName === 'gamerole') {
        const rankName = interaction.options.getString('rank');
        if (!POLICE_RANKS.includes(rankName)) {
            return interaction.reply({ embeds: [new EmbedBuilder().setColor(0xFF0000).setTitle('❌ Ошибка').setDescription(`Ранг "${rankName}" не найден!\nДоступные ранги:\n${POLICE_RANKS.join(', ')}`)], ephemeral: true });
        }
        userRanks[robloxId] = rankName;
        const info = await getRobloxUserInfo(robloxId);
        const color = RANK_COLORS[rankName];
        await interaction.reply({ embeds: [new EmbedBuilder().setColor(0x00AAFF).setTitle('👮‍♂️ РАНГ ПОЛИЦИИ ИЗМЕНЁН').setDescription(`**Игрок:** ${info?.name || robloxId} (ID: ${robloxId})\n**Новый ранг:** ${rankName}\n**Цвет:** RGB(${color.r}, ${color.g}, ${color.b})\n**Выдал:** ${interaction.user.tag}`).setTimestamp()], ephemeral: true });
        await sendLog(new EmbedBuilder().setColor(0x00AAFF).setTitle('📝 ЛОГ ВЫДАЧИ РАНГА ПОЛИЦИИ').setDescription(`**Игрок:** ${info?.name || robloxId} (ID: ${robloxId})\n**Новый ранг:** ${rankName}\n**Выдал:** ${interaction.user.tag} (${interaction.user.id})`).setTimestamp());
        console.log(`👮‍♂️ Игроку ${robloxId} выдан ранг ${rankName}`);
    }
});

client.login(DISCORD_TOKEN);
console.log('🚀 Бот запускается...');
