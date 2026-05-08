const { Client, GatewayIntentBits, EmbedBuilder, SlashCommandBuilder, REST, Routes } = require('discord.js');
const express = require('express');
const cors = require('cors');

// ============ НАСТРОЙКА ============
const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const ALLOWED_USERS = (process.env.ALLOWED_USERS || '').split(',').map(id => id.trim());
const TEST_GUILD_ID = "ВАШ_ID_СЕРВЕРА"; // ЗАМЕНИТЕ НА ВАШ ID

// ============ ДАННЫЕ (в памяти) ============
let robloxAdmins = [];      // Список администраторов Roblox (ID)
let userBalances = {};      // { "robloxId": количество_монет }

// ============ API СЕРВЕР ДЛЯ ROBLOX ============
const app = express();
app.use(cors());
app.use(express.json());

// ---------- АДМИНКА ----------
app.get('/api/admins', (req, res) => {
    res.json({ admins: robloxAdmins });
});

app.get('/api/check/:userId', (req, res) => {
    const userId = parseInt(req.params.userId);
    const isAdmin = robloxAdmins.includes(userId);
    res.json({ userId, isAdmin });
});

// ---------- БАНКОВСКАЯ СИСТЕМА ----------
app.get('/api/balance/:userId', (req, res) => {
    const userId = parseInt(req.params.userId);
    const balance = userBalances[userId] || 0;
    res.json({ userId, balance });
});

app.post('/api/give-coins', (req, res) => {
    const { userId, amount, discordUserId } = req.body;
    
    if (!ALLOWED_USERS.includes(discordUserId)) {
        return res.status(403).json({ error: 'Нет прав' });
    }
    
    const current = userBalances[userId] || 0;
    userBalances[userId] = current + amount;
    
    res.json({ success: true, newBalance: userBalances[userId] });
});

app.post('/api/remove-coins', (req, res) => {
    const { userId, amount, discordUserId } = req.body;
    
    if (!ALLOWED_USERS.includes(discordUserId)) {
        return res.status(403).json({ error: 'Нет прав' });
    }
    
    const current = userBalances[userId] || 0;
    userBalances[userId] = Math.max(0, current - amount);
    
    res.json({ success: true, newBalance: userBalances[userId] });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`✅ API сервер запущен на порту ${PORT}`);
});

// ============ DISCORD БОТ ============
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
    ],
});

// ============ ВСПОМОГАТЕЛЬНАЯ ФУНКЦИЯ ============
async function getRobloxUserInfo(userId) {
    try {
        const response = await fetch(`https://users.roblox.com/v1/users/${userId}`);
        const data = await response.json();
        return data;
    } catch(e) {
        return null;
    }
}

// ============ РЕГИСТРАЦИЯ ВСЕХ КОМАНД ============
const commandsData = [
    // АДМИНКА
    new SlashCommandBuilder()
        .setName('addadmin')
        .setDescription('Добавить администратора в Roblox админку')
        .addIntegerOption(option => option.setName('robloxid').setDescription('Roblox User ID').setRequired(true)),
    
    new SlashCommandBuilder()
        .setName('removeadmin')
        .setDescription('Удалить администратора из Roblox админки')
        .addIntegerOption(option => option.setName('robloxid').setDescription('Roblox User ID').setRequired(true)),
    
    new SlashCommandBuilder()
        .setName('adminlist')
        .setDescription('Показать список администраторов'),
    
    new SlashCommandBuilder()
        .setName('finduser')
        .setDescription('Найти пользователя Roblox по имени')
        .addStringOption(option => option.setName('username').setDescription('Имя пользователя Roblox').setRequired(true)),
    
    // БАНКОВСКАЯ СИСТЕМА
    new SlashCommandBuilder()
        .setName('bankgive')
        .setDescription('Выдать монеты игроку')
        .addIntegerOption(option => option.setName('robloxid').setDescription('Roblox User ID').setRequired(true))
        .addIntegerOption(option => option.setName('amount').setDescription('Количество монет').setRequired(true)),
    
    new SlashCommandBuilder()
        .setName('bankremove')
        .setDescription('Забрать монеты у игрока')
        .addIntegerOption(option => option.setName('robloxid').setDescription('Roblox User ID').setRequired(true))
        .addIntegerOption(option => option.setName('amount').setDescription('Количество монет').setRequired(true)),
    
    new SlashCommandBuilder()
        .setName('bankinfo')
        .setDescription('Узнать баланс игрока')
        .addIntegerOption(option => option.setName('robloxid').setDescription('Roblox User ID').setRequired(true)),
];

async function registerCommands() {
    const rest = new REST({ version: '10' }).setToken(DISCORD_TOKEN);
    try {
        console.log('🧹 Очищаю старые команды...');
        await rest.put(Routes.applicationCommands(client.user.id), { body: [] });
        await rest.put(Routes.applicationGuildCommands(client.user.id, TEST_GUILD_ID), { body: [] });
        
        console.log('📝 Регистрирую новые команды...');
        await rest.put(Routes.applicationGuildCommands(client.user.id, TEST_GUILD_ID), { body: commandsData });
        
        console.log('✅ Все команды зарегистрированы!');
    } catch (error) {
        console.error('❌ Ошибка регистрации команд:', error);
    }
}

// ============ ЗАПУСК БОТА ============
client.once('ready', async () => {
    console.log(`✅ Бот ${client.user.tag} запущен!`);
    await registerCommands();
    console.log(`🤖 Бот готов на сервере: ${client.guilds.cache.get(TEST_GUILD_ID)?.name || 'неизвестно'}`);
});

// ============ ОБРАБОТЧИК КОМАНД ============
client.on('interactionCreate', async interaction => {
    if (!interaction.isCommand()) return;
    
    // Проверка прав (только владельцы)
    if (!ALLOWED_USERS.includes(interaction.user.id)) {
        const embed = new EmbedBuilder()
            .setColor(0xFF0000)
            .setTitle('⛔ ДОСТУП ЗАПРЕЩЁН')
            .setDescription('У вас нет прав на использование этого бота!')
            .setTimestamp();
        return interaction.reply({ embeds: [embed], ephemeral: true });
    }
    
    const { commandName } = interaction;
    const robloxId = interaction.options.getInteger('robloxid');
    const amount = interaction.options.getInteger('amount');
    
    // ========== АДМИНКА ==========
    if (commandName === 'addadmin') {
        if (robloxAdmins.includes(robloxId)) {
            const embed = new EmbedBuilder()
                .setColor(0xFFAA00)
                .setTitle('⚠️ Уже в списке')
                .setDescription(`Администратор с ID **${robloxId}** уже добавлен!`)
                .setTimestamp();
            return interaction.reply({ embeds: [embed] });
        }
        
        robloxAdmins.push(robloxId);
        const userInfo = await getRobloxUserInfo(robloxId);
        const username = userInfo ? userInfo.name : 'Неизвестно';
        
        const embed = new EmbedBuilder()
            .setColor(0x00FF00)
            .setTitle('✅ АДМИНИСТРАТОР ДОБАВЛЕН')
            .setDescription(`**Roblox ID:** ${robloxId}\n**Имя:** ${username}\n**Добавил:** ${interaction.user.tag}`)
            .setTimestamp()
            .setFooter({ text: 'Изменения вступят в силу через 1 минуту' });
        
        await interaction.reply({ embeds: [embed] });
        console.log(`✅ Добавлен администратор: ${robloxId} (${username})`);
    }
    
    if (commandName === 'removeadmin') {
        const index = robloxAdmins.indexOf(robloxId);
        if (index === -1) {
            const embed = new EmbedBuilder()
                .setColor(0xFFAA00)
                .setTitle('⚠️ Не найден')
                .setDescription(`Администратор с ID **${robloxId}** не найден в списке!`)
                .setTimestamp();
            return interaction.reply({ embeds: [embed] });
        }
        
        robloxAdmins.splice(index, 1);
        const userInfo = await getRobloxUserInfo(robloxId);
        const username = userInfo ? userInfo.name : 'Неизвестно';
        
        const embed = new EmbedBuilder()
            .setColor(0xFF0000)
            .setTitle('❌ АДМИНИСТРАТОР УДАЛЁН')
            .setDescription(`**Roblox ID:** ${robloxId}\n**Имя:** ${username}\n**Удалил:** ${interaction.user.tag}`)
            .setTimestamp()
            .setFooter({ text: 'Изменения вступят в силу через 1 минуту' });
        
        await interaction.reply({ embeds: [embed] });
        console.log(`❌ Удалён администратор: ${robloxId} (${username})`);
    }
    
    if (commandName === 'adminlist') {
        if (robloxAdmins.length === 0) {
            const embed = new EmbedBuilder()
                .setColor(0xFFAA00)
                .setTitle('📋 СПИСОК АДМИНИСТРАТОРОВ')
                .setDescription('Список пуст!')
                .setTimestamp();
            return interaction.reply({ embeds: [embed] });
        }
        
        const adminListWithNames = [];
        for (const id of robloxAdmins) {
            const userInfo = await getRobloxUserInfo(id);
            const name = userInfo ? userInfo.name : 'Неизвестно';
            adminListWithNames.push(`🔹 **${name}** (ID: ${id})`);
        }
        
        const embed = new EmbedBuilder()
            .setColor(0x00AAFF)
            .setTitle('📋 СПИСОК АДМИНИСТРАТОРОВ')
            .setDescription(adminListWithNames.join('\n'))
            .addFields({ name: '📊 Всего администраторов', value: `${robloxAdmins.length}`, inline: true })
            .setTimestamp();
        
        await interaction.reply({ embeds: [embed] });
    }
    
    if (commandName === 'finduser') {
        const username = interaction.options.getString('username');
        
        try {
            const response = await fetch(`https://users.roblox.com/v1/users/search?keyword=${encodeURIComponent(username)}&limit=1`);
            const data = await response.json();
            
            if (data.data && data.data.length > 0) {
                const user = data.data[0];
                const isAdmin = robloxAdmins.includes(user.id);
                
                const embed = new EmbedBuilder()
                    .setColor(isAdmin ? 0x00FF00 : 0xAAAAAA)
                    .setTitle('🔍 РЕЗУЛЬТАТ ПОИСКА')
                    .setDescription(`**Имя:** ${user.name}\n**ID:** ${user.id}\n**Статус:** ${isAdmin ? '✅ Администратор' : '❌ Не администратор'}\n**Ссылка:** https://www.roblox.com/users/${user.id}/profile`)
                    .setTimestamp();
                
                await interaction.reply({ embeds: [embed] });
            } else {
                const embed = new EmbedBuilder()
                    .setColor(0xFF0000)
                    .setTitle('❌ Не найдено')
                    .setDescription(`Пользователь с именем **${username}** не найден!`)
                    .setTimestamp();
                
                await interaction.reply({ embeds: [embed] });
            }
        } catch(e) {
            console.error("Ошибка поиска пользователя:", e);
            const embed = new EmbedBuilder()
                .setColor(0xFF0000)
                .setTitle('❌ Ошибка')
                .setDescription('Не удалось выполнить поиск!')
                .setTimestamp();
            await interaction.reply({ embeds: [embed] });
        }
    }
    
    // ========== БАНКОВСКАЯ СИСТЕМА ==========
    if (commandName === 'bankgive') {
        const current = userBalances[robloxId] || 0;
        userBalances[robloxId] = current + amount;
        const userInfo = await getRobloxUserInfo(robloxId);
        
        const embed = new EmbedBuilder()
            .setColor(0x00FF00)
            .setTitle('💰 МОНЕТЫ ВЫДАНЫ')
            .setDescription(`**Игрок:** ${userInfo?.name || robloxId}\n**Выдано:** ${amount} 💎\n**Новый баланс:** ${userBalances[robloxId]} 💎`)
            .setTimestamp();
        
        await interaction.reply({ embeds: [embed] });
        console.log(`💰 Выдано ${amount} монет игроку ${robloxId}`);
    }
    
    if (commandName === 'bankremove') {
        const current = userBalances[robloxId] || 0;
        userBalances[robloxId] = Math.max(0, current - amount);
        const userInfo = await getRobloxUserInfo(robloxId);
        
        const embed = new EmbedBuilder()
            .setColor(0xFF0000)
            .setTitle('💰 МОНЕТЫ ЗАБРАНЫ')
            .setDescription(`**Игрок:** ${userInfo?.name || robloxId}\n**Забрано:** ${amount} 💎\n**Новый баланс:** ${userBalances[robloxId]} 💎`)
            .setTimestamp();
        
        await interaction.reply({ embeds: [embed] });
        console.log(`💰 Забрано ${amount} монет у игрока ${robloxId}`);
    }
    
    if (commandName === 'bankinfo') {
        const balance = userBalances[robloxId] || 0;
        const userInfo = await getRobloxUserInfo(robloxId);
        
        const embed = new EmbedBuilder()
            .setColor(0x00AAFF)
            .setTitle('💰 БАЛАНС ИГРОКА')
            .setDescription(`**Игрок:** ${userInfo?.name || robloxId}\n**Баланс:** ${balance} 💎`)
            .setTimestamp();
        
        await interaction.reply({ embeds: [embed] });
    }
});

// ============ ЗАПУСК ============
client.login(DISCORD_TOKEN);
console.log('🚀 Бот запускается...');
