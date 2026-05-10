const { Client, GatewayIntentBits, EmbedBuilder, SlashCommandBuilder, REST, Routes } = require('discord.js');
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

// ============ НАСТРОЙКА ============
const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const ALLOWED_USERS = (process.env.ALLOWED_USERS || '').split(',').map(id => id.trim()).filter(id => id.length > 0);
const TEST_GUILD_ID = "1502941635154149480"; // ← ЗАМЕНИТЕ НА ВАШ ID!

console.log(`🚀 Запуск бота...`);
console.log(`📡 Сервер ID: ${TEST_GUILD_ID}`);

// ============ ДАННЫЕ ============
let robloxAdmins = {};
let userExp = {};

// ============ АДМИН РАНГИ ============
const ADMIN_RANKS = ["Модератор", "Администратор", "Старший Администратор", "Главный Администратор", "Основатель"];

const RANK_COLORS = {
    "Модератор": { r: 0, g: 255, b: 0 },
    "Администратор": { r: 0, g: 150, b: 255 },
    "Старший Администратор": { r: 255, g: 100, b: 0 },
    "Главный Администратор": { r: 255, g: 0, b: 0 },
    "Основатель": { r: 255, g: 215, b: 0 }
};

// ============ ФУНКЦИИ XP ============
function getLevel(xp) {
    return Math.floor(xp / 100) + 1;
}

function addExp(userId, amount) {
    if (!userExp[userId]) userExp[userId] = 0;
    userExp[userId] += amount;
    return { xp: userExp[userId], level: getLevel(userExp[userId]) };
}

function getUserData(userId) {
    const xp = userExp[userId] || 0;
    return { xp: xp, level: getLevel(xp) };
}

// ============ ПАПКА DATA ============
const DATA_DIR = path.join(__dirname, 'data');

function ensureDataDir() {
    try {
        if (!fs.existsSync(DATA_DIR)) {
            fs.mkdirSync(DATA_DIR, { recursive: true });
            console.log('✅ Папка data создана');
        }
    } catch(e) { console.error('❌ Ошибка:', e); }
}
ensureDataDir();

function loadData() {
    try {
        if (fs.existsSync(path.join(DATA_DIR, 'admins.json'))) robloxAdmins = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'admins.json'), 'utf8'));
        if (fs.existsSync(path.join(DATA_DIR, 'exp.json'))) userExp = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'exp.json'), 'utf8'));
        console.log('✅ Данные загружены');
    } catch(e) { console.error('Ошибка загрузки:', e); }
}

function saveData() {
    try {
        fs.writeFileSync(path.join(DATA_DIR, 'admins.json'), JSON.stringify(robloxAdmins, null, 2));
        fs.writeFileSync(path.join(DATA_DIR, 'exp.json'), JSON.stringify(userExp, null, 2));
        console.log('✅ Данные сохранены');
    } catch(e) { console.error('Ошибка сохранения:', e); }
}

loadData();
setInterval(saveData, 5 * 1000);

// ============ API СЕРВЕР ============
const app = express();
app.use(cors());
app.use(express.json());

app.get('/api/admins', (req, res) => { res.json({ admins: robloxAdmins }); });
app.get('/api/exp/:userId', (req, res) => { 
    const id = parseInt(req.params.userId);
    const data = getUserData(id);
    res.json({ xp: data.xp, level: data.level });
});
app.get('/api/rank/:userId', (req, res) => {
    const id = parseInt(req.params.userId);
    const adminRank = robloxAdmins[id];
    const displayRank = adminRank || "Игрок";
    const color = adminRank ? RANK_COLORS[adminRank] : { r: 128, g: 128, b: 128 };
    res.json({ rank: displayRank, color: color, isAdmin: !!adminRank });
});
app.post('/api/give-exp', (req, res) => { 
    const { userId, amount } = req.body; 
    const result = addExp(userId, amount);
    saveData();
    res.json({ success: true, xp: result.xp, level: result.level });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ API сервер на порту ${PORT}`));

// ============ DISCORD БОТ ============
const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] });

async function getRobloxUserInfo(userId) {
    try { const res = await fetch(`https://users.roblox.com/v1/users/${userId}`); return await res.json(); } catch { return null; }
}

const commandsData = [
    new SlashCommandBuilder().setName('addadmin').setDescription('Добавить администратора').addIntegerOption(opt => opt.setName('robloxid').setDescription('Roblox ID').setRequired(true)).addStringOption(opt => opt.setName('rank').setDescription('Ранг').setRequired(true).addChoices(...ADMIN_RANKS.map(r => ({ name: r, value: r })))),
    new SlashCommandBuilder().setName('removeadmin').setDescription('Удалить администратора').addIntegerOption(opt => opt.setName('robloxid').setDescription('Roblox ID').setRequired(true)),
    new SlashCommandBuilder().setName('adminlist').setDescription('Список администраторов'),
    new SlashCommandBuilder().setName('finduser').setDescription('Найти пользователя Roblox').addStringOption(opt => opt.setName('username').setDescription('Имя').setRequired(true)),
    new SlashCommandBuilder().setName('expgive').setDescription('Выдать опыт игроку').addIntegerOption(opt => opt.setName('robloxid').setDescription('Roblox ID').setRequired(true)).addIntegerOption(opt => opt.setName('amount').setDescription('Количество опыта').setRequired(true)),
    new SlashCommandBuilder().setName('expinfo').setDescription('Информация об опыте игрока').addIntegerOption(opt => opt.setName('robloxid').setDescription('Roblox ID').setRequired(true))
];

async function registerCommands() {
    const rest = new REST({ version: '10' }).setToken(DISCORD_TOKEN);
    try {
        console.log('🧹 Очищаю глобальные команды...');
        await rest.put(Routes.applicationCommands(client.user.id), { body: [] });
        
        console.log('📝 Регистрирую команды для сервера...');
        const result = await rest.put(Routes.applicationGuildCommands(client.user.id, TEST_GUILD_ID), { body: commandsData });
        
        console.log(`✅ ЗАРЕГИСТРИРОВАНО ${result.length} КОМАНД:`);
        result.forEach(cmd => console.log(`   /${cmd.name}`));
    } catch (error) { console.error('❌ ОШИБКА:', error); }
}

client.once('ready', async () => {
    console.log(`✅ Бот ${client.user.tag} запущен!`);
    await registerCommands();
    console.log('🎉 Бот готов!');
});

client.on('interactionCreate', async interaction => {
    if (!interaction.isCommand()) return;
    
    if (!ALLOWED_USERS.includes(interaction.user.id)) {
        return interaction.reply({ content: '⛔ У вас нет прав!', ephemeral: true });
    }
    
    const { commandName } = interaction;
    const robloxId = interaction.options.getInteger('robloxid');
    const amount = interaction.options.getInteger('amount');

    if (commandName === 'addadmin') {
        const rank = interaction.options.getString('rank');
        robloxAdmins[robloxId] = rank;
        saveData();
        const info = await getRobloxUserInfo(robloxId);
        interaction.reply({ content: `✅ ${info?.name || robloxId} назначен **${rank}**!`, ephemeral: true });
    }
    else if (commandName === 'removeadmin') {
        if (!robloxAdmins[robloxId]) return interaction.reply({ content: '⚠️ Не найден!', ephemeral: true });
        delete robloxAdmins[robloxId];
        saveData();
        interaction.reply({ content: `❌ Администратор ${robloxId} удалён!`, ephemeral: true });
    }
    else if (commandName === 'adminlist') {
        const ids = Object.keys(robloxAdmins);
        if (!ids.length) return interaction.reply({ content: '📋 Список пуст!', ephemeral: true });
        const list = []; 
        for (const id of ids) { 
            const info = await getRobloxUserInfo(parseInt(id)); 
            list.push(`🔹 **${info?.name || 'Неизвестно'}** (${id}) — ${robloxAdmins[id]}`); 
        }
        interaction.reply({ content: `📋 **Администраторы:**\n${list.join('\n')}`, ephemeral: true });
    }
    else if (commandName === 'finduser') {
        const username = interaction.options.getString('username');
        try { 
            const res = await fetch(`https://users.roblox.com/v1/users/search?keyword=${encodeURIComponent(username)}&limit=1`); 
            const data = await res.json();
            if (data.data && data.data.length > 0) { 
                const user = data.data[0]; 
                interaction.reply({ content: `🔍 **${user.name}**\nID: ${user.id}\nhttps://www.roblox.com/users/${user.id}/profile`, ephemeral: true }); 
            } else { 
                interaction.reply({ content: `❌ Пользователь "${username}" не найден!`, ephemeral: true }); 
            }
        } catch(e) { 
            interaction.reply({ content: '❌ Ошибка поиска!', ephemeral: true }); 
        }
    }
    else if (commandName === 'expgive') { 
        const result = addExp(robloxId, amount);
        saveData();
        const info = await getRobloxUserInfo(robloxId);
        interaction.reply({ content: `✨ ${info?.name || robloxId} получил ${amount} XP!\n📊 Всего XP: ${result.xp}\n🎚️ Уровень: ${result.level}`, ephemeral: true });
    }
    else if (commandName === 'expinfo') { 
        const data = getUserData(robloxId);
        const info = await getRobloxUserInfo(robloxId);
        interaction.reply({ content: `📊 **${info?.name || robloxId}**\n✨ XP: ${data.xp}\n🎚️ Уровень: ${data.level}`, ephemeral: true });
    }
});

client.login(DISCORD_TOKEN);
console.log('🚀 Бот запускается...');
