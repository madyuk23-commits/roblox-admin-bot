const { Client, GatewayIntentBits, EmbedBuilder, SlashCommandBuilder } = require('discord.js');
const express = require('express');
const cors = require('cors');

// ============ НАСТРОЙКА ============
const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
// Импортируем ALLOWED_USERS из переменных окружения Render.com
const ALLOWED_USERS = (process.env.ALLOWED_USERS || '').split(',').map(id => id.trim());

// --- ОТВЕТ НА ВАШУ ПРОБЛЕМУ: ID ВАШЕГО СЕРВЕРА ДЛЯ ТЕСТОВ ---
// ★★★ ВСТАВЬТЕ СЮДА ID ВАШЕГО СЕРВЕРА (в кавычках) ★★★
// Узнать ID можно, включив "Режим разработчика" в Discord.
const TEST_GUILD_ID = "1475122481026175059"; // <--- ЗАМЕНИТЕ НА ВАШ ID!
// =======================================================

// СПИСОК АДМИНИСТРАТОРОВ (ROBLOX ID) - теперь хранится в памяти. При перезапуске Render бота список сбросится.
let robloxAdmins = [];

// ============ СОЗДАНИЕ БОТА ============
// Указываем необходимые интенты.
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
    ],
});

// ============ API СЕРВЕР ДЛЯ ROBLOX ============
const app = express();
app.use(cors());
app.use(express.json());

// Эндпоинт для получения списка админов (используется Roblox скриптом)
app.get('/api/admins', (req, res) => {
    res.json({ admins: robloxAdmins });
});

// Эндпоинт для проверки, является ли ID админом
app.get('/api/check/:userId', (req, res) => {
    const userId = parseInt(req.params.userId);
    const isAdmin = robloxAdmins.includes(userId);
    res.json({ userId: userId, isAdmin: isAdmin });
});

// Запуск API сервера
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`✅ API сервер запущен на порту ${PORT}`);
});

// ============ ФУНКЦИЯ ПОИСКА ПОЛЬЗОВАТЕЛЯ ROBLOX ============
async function getRobloxUserInfo(userId) {
    try {
        const response = await fetch(`https://users.roblox.com/v1/users/${userId}`);
        const data = await response.json();
        return data;
    } catch(e) {
        console.error(`Ошибка получения данных о пользователе Roblox (ID: ${userId}):`, e);
        return null;
    }
}

// ============ КОМАНДЫ БОТА ============
client.once('ready', async () => {
    console.log(`✅ Бот ${client.user.tag} успешно запущен!`);

    // ★★★ ОСНОВНОЕ ИСПРАВЛЕНИЕ: РЕГИСТРАЦИЯ КОМАНД ДЛЯ ТЕСТОВОГО СЕРВЕРА ★★★
    // Благодаря TEST_GUILD_ID, команды появятся МГНОВЕННО, без задержки в 1 час.
    if (TEST_GUILD_ID) {
        const guild = client.guilds.cache.get(TEST_GUILD_ID);
        if (guild) {
            console.log(`🔨 Регистрирую команды для сервера: ${guild.name} (ID: ${TEST_GUILD_ID})...`);
            await guild.commands.set(commandsData);
            console.log(`✅ Команды успешно зарегистрированы для тестового сервера!`);
        } else {
            console.error(`❌ Ошибка: Сервер с ID ${TEST_GUILD_ID} не найден. Проверьте правильность ID и что бот приглашён на этот сервер.`);
            console.log(`🌍 Регистрирую команды глобально (это может занять до 1 часа)...`);
            await client.application.commands.set(commandsData);
            console.log(`✅ Команды зарегистрированы глобально.`);
        }
    } else {
        console.log(`🌍 TEST_GUILD_ID не задан. Регистрирую команды глобально (это может занять до 1 часа)...`);
        await client.application.commands.set(commandsData);
        console.log(`✅ Команды зарегистрированы глобально.`);
    }
    // ===================================================================
});

// Определение команд (вынесено в отдельную переменную для удобства)
const commandsData = [
    new SlashCommandBuilder()
        .setName('addadmin')
        .setDescription('Добавить администратора в Roblox админку')
        .addIntegerOption(option =>
            option.setName('robloxid')
                .setDescription('Roblox User ID')
                .setRequired(true)
        ),
    new SlashCommandBuilder()
        .setName('removeadmin')
        .setDescription('Удалить администратора из Roblox админки')
        .addIntegerOption(option =>
            option.setName('robloxid')
                .setDescription('Roblox User ID')
                .setRequired(true)
        ),
    new SlashCommandBuilder()
        .setName('adminlist')
        .setDescription('Показать список администраторов'),
    new SlashCommandBuilder()
        .setName('finduser')
        .setDescription('Найти пользователя Roblox по имени')
        .addStringOption(option =>
            option.setName('username')
                .setDescription('Имя пользователя Roblox')
                .setRequired(true)
        ),
];

// Обработчик команд (интеракций)
client.on('interactionCreate', async interaction => {
    if (!interaction.isCommand()) return;

    // Проверка прав (только владельцы могут использовать бота)
    if (!ALLOWED_USERS.includes(interaction.user.id)) {
        const embed = new EmbedBuilder()
            .setColor(0xFF0000)
            .setTitle('⛔ ДОСТУП ЗАПРЕЩЁН')
            .setDescription('У вас нет прав на использование этого бота!')
            .setTimestamp();
        return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    const { commandName } = interaction;

    // Обработка команды addadmin
    if (commandName === 'addadmin') {
        const robloxId = interaction.options.getInteger('robloxid');
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
        console.log(`✅ Добавлен Roblox ID: ${robloxId} пользователем ${interaction.user.tag}`);
    }

    // Обработка команды removeadmin
    if (commandName === 'removeadmin') {
        const robloxId = interaction.options.getInteger('robloxid');
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
        console.log(`❌ Удалён Roblox ID: ${robloxId} пользователем ${interaction.user.tag}`);
    }

    // Обработка команды adminlist
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

    // Обработка команды finduser
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
});

// ============ ЗАПУСК БОТА ============
client.login(DISCORD_TOKEN);
console.log('🚀 Бот запускается...');
