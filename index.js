const { Client, GatewayIntentBits, EmbedBuilder, PermissionsBitField } = require('discord.js');
const sqlite3 = require('sqlite3').verbose();

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers
    ]
});

const PREFIX = '.';
const TOKEN = process.env.DISCORD_TOKEN; // Railway Ortam Değişkeni

// Veritabanı Bağlantısı ve Tablo Oluşturma
const db = new sqlite3.Database('./database.sqlite', (err) => {
    if (err) console.error('Veritabanı hatası:', err.message);
    else console.log('SQLite Veritabanına bağlandı.');
});

db.serialize(() => {
    // Oyuncular Tablosu
    db.run(`CREATE TABLE IF NOT EXISTS players (
        user_id TEXT PRIMARY KEY,
        nickname TEXT,
        value TEXT DEFAULT '10M€',
        team_id TEXT DEFAULT NULL,
        position TEXT DEFAULT 'YOK'
    )`);

    // Takımlar Tablosu
    db.run(`CREATE TABLE IF NOT EXISTS teams (
        role_id TEXT PRIMARY KEY,
        name TEXT,
        points INTEGER DEFAULT 0,
        played INTEGER DEFAULT 0,
        won INTEGER DEFAULT 0,
        drawn INTEGER DEFAULT 0,
        lost INTEGER DEFAULT 0,
        gf INTEGER DEFAULT 0,
        ga INTEGER DEFAULT 0,
        value TEXT DEFAULT '0M€'
    )`);
});

client.on('ready', () => {
    console.log(`Bot ${client.user.tag} olarak aktif!`);
});

client.on('messageCreate', async (message) => {
    if (message.author.bot || !message.content.startsWith(PREFIX)) return;

    const args = message.content.slice(PREFIX.length).trim().split(/ +/);
    const command = args.shift().toLowerCase();
    const serverName = message.guild ? message.guild.name.toUpperCase() : 'LİG';

    // ---------------- YARDIM KOMUTU ----------------
    if (command === 'yardım') {
        const embed = new EmbedBuilder()
            .setTitle(`⚽ ${serverName} • KOMUTLAR`)
            .setColor('#2b2d31')
            .addFields(
                { name: '📋 Kayıt', value: '`.k @oyuncu TakmaAd`\n`.kayıtsızver @oyuncu`' },
                { name: '💰 Değer', value: '`.dver @oyuncu miktar`\n`.dsil @oyuncu miktar`' },
                { name: '🏋️ Antrenman', value: '`.ant` / `.antrenman`' },
                { name: '🥅 Penaltı', value: '`.pen` / `.penaltı`' },
                { name: '🔍 Oyuncu', value: '`.ara isim`' },
                { name: '🏟️ Takım', value: '`.takımekle @takım`\n`.takımdeğer @takım`\n`.kadroekle @takım @oyuncu pozisyon`\n`.kadroçıkar @takım @oyuncu`\n`.kadro @takım`' },
                { name: '📐 Formasyon', value: '`.formasyon @takım`' },
                { name: '📅 Fikstür', value: '`.fikstürekle @takım1 @takım2 GG.AA.YYYY SS:DD`\n`.fikstür`' },
                { name: '📊 Puan', value: '`.puan`\n`.puanekle @takım miktar`' },
                { name: '⚽ Maç', value: '`.maç @takım1 @takım2`' },
                { name: '🐦 Tweet', value: '`.tweet mesaj`' }
            )
            .setFooter({ text: message.guild ? message.guild.name : 'Lig Botu' })
            .setTimestamp();

        return message.channel.send({ embeds: [embed] });
    }

    // ---------------- OYUNCU KAYIT ----------------
    if (command === 'k') {
        const member = message.mentions.members.first();
        const nickname = args.slice(1).join(' ');

        if (!member || !nickname) {
            return message.reply('❌ Kullanım: `.k @oyuncu TakmaAd`');
        }

        db.run(`INSERT INTO players (user_id, nickname) VALUES (?, ?) 
                ON CONFLICT(user_id) DO UPDATE SET nickname = ?`, 
                [member.id, nickname, nickname], (err) => {
            if (err) return message.reply('Veritabanı hatası oluştu.');
            try { member.setNickname(nickname); } catch(e) {}
            message.channel.send(`✅ ${member} kullanıcısının adı **${nickname}** olarak güncellendi.`);
        });
    }

    // ---------------- OYUNCU ARAMA (.ara) ----------------
    if (command === 'ara') {
        const searchName = args.join(' ');
        if (!searchName) return message.reply('❌ Kullanım: `.ara oyuncu_adı`');

        db.get(`SELECT * FROM players WHERE nickname LIKE ?`, [`%${searchName}%`], (err, row) => {
            if (err) return console.error(err);

            const embed = new EmbedBuilder().setTitle('🔍 OYUNCU ARAMA').setColor('#2b2d31');

            if (!row) {
                embed.addFields({ name: '⚪ BOŞ', value: `**${searchName}** için uygun oyuncu bulunamadı.` });
            } else {
                embed.addFields(
                    { name: 'Aranan', value: searchName },
                    { name: 'Oyuncu', value: `<@${row.user_id}>` },
                    { name: 'Takma Ad', value: row.nickname },
                    { name: 'Değer', value: row.value },
                    { name: 'Durum', value: row.team_id ? '🔴 DOLU' : '🟢 BOŞ' }
                );
            }
            message.channel.send({ embeds: [embed] });
        });
    }

    // ---------------- TAKIM EKLE ----------------
    if (command === 'takımekle') {
        const role = message.mentions.roles.first();
        if (!role) return message.reply('❌ Kullanım: `.takımekle @takım`');

        db.run(`INSERT OR IGNORE INTO teams (role_id, name) VALUES (?, ?)`, [role.id, role.name], (err) => {
            if (err) return message.reply('Hata oluştu.');
            message.channel.send(`✅ **${role.name}** takımı lige eklendi.`);
        });
    }

    // ---------------- PUAN DURUMU (.puan) ----------------
    if (command === 'puan') {
        db.all(`SELECT * FROM teams ORDER BY points DESC, (gf - ga) DESC`, [], (err, rows) => {
            if (err) return console.error(err);

            const embed = new EmbedBuilder()
                .setTitle(`📊 ${serverName} • PUAN DURUMU`)
                .setColor('#2b2d31')
                .setFooter({ text: `${message.guild ? message.guild.name : 'Lig'} • Puan Durumu` })
                .setTimestamp();

            if (!rows || rows.length === 0) {
                embed.setDescription('Henüz lige eklenmiş bir takım bulunmuyor. `.takımekle @takım` komutu ile takım ekleyebilirsiniz.');
            } else {
                let descriptionList = 'Lig sıralaması\n\n🏆 **Sıralama**\n\n';
                const medals = ['🥇', '🥈', '🥉'];

                rows.forEach((team, index) => {
                    const rank = index < 3 ? medals[index] : `${index + 1}.`;
                    const average = team.gf - team.ga;
                    const avgSign = average >= 0 ? `+${average}` : `${average}`;

                    descriptionList += `${rank} • **${team.name} — ${team.points} P**\n` +
                        `O: ${team.played} • G: ${team.won} • B: ${team.drawn} • M: ${team.lost}\n` +
                        `AG: ${team.gf} • YG: ${team.ga} • AV: ${avgSign}\n\n`;
                });
                embed.setDescription(descriptionList);
            }

            message.channel.send({ embeds: [embed] });
        });
    }

    // ---------------- KADRO (.kadro) ----------------
    if (command === 'kadro') {
        const role = message.mentions.roles.first();
        if (!role) {
            return message.channel.send('❌ **Kullanım:** `.kadro @Takım`');
        }

        db.all(`SELECT * FROM players WHERE team_id = ?`, [role.id], (err, rows) => {
            if (err) return console.error(err);

            const embed = new EmbedBuilder()
                .setTitle(`🛡️ ${role.name.toUpperCase()} KADROSU`)
                .setColor('#2b2d31');

            if (!rows || rows.length === 0) {
                embed.setDescription('Bu takımda kayıtlı oyuncu bulunamadı.');
            } else {
                let kadroMetni = rows.map(p => `<@${p.user_id}> - **Pozisyon:** ${p.position} - **Değer:** ${p.value}`).join('\n');
                embed.setDescription(kadroMetni);
            }

            message.channel.send({ embeds: [embed] });
        });
    }

    // ---------------- YETKİLİ KONTROLÜ (Örn: .maç / .formasyon) ----------------
    if (command === 'maç' || command === 'formasyon') {
        // Sunucundaki Maç Yetkilisi rol adını buraya yazabilirsin
        const hasRole = message.member.roles.cache.some(r => r.name.toLowerCase().includes('maç') || r.name.toLowerCase().includes('yetkili'));

        if (!hasRole && !message.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
            return message.channel.send('❌ **Sadece Maç Yetkilisi** bu komutu kullanabilir.');
        }

        message.channel.send(`🏟️ **${command.toUpperCase()}** komutu başarıyla çalıştırıldı.`);
    }
});

client.login(TOKEN);
