const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');
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
const TOKEN = process.env.DISCORD_TOKEN;

const db = new sqlite3.Database('./database.sqlite', (err) => {
    if (err) console.error('Veritabanı hatası:', err.message);
    else console.log('SQLite Veritabanına bağlandı.');
});

db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS players (
        user_id TEXT PRIMARY KEY,
        nickname TEXT,
        value INTEGER DEFAULT 1,
        team_id TEXT DEFAULT NULL,
        position TEXT DEFAULT 'YOK'
    )`);

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
        formation TEXT DEFAULT '4-3-3'
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS fixtures (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        team1_id TEXT,
        team2_id TEXT,
        date_str TEXT
    )`);
});

// Oyuncunun Nickname Formatını Düzenleyen Yardımcı Fonksiyon
async function updateServerNickname(guild, userId) {
    db.get(`SELECT * FROM players WHERE user_id = ?`, [userId], async (err, row) => {
        if (err || !row) return;

        try {
            const member = await guild.members.fetch(userId);
            if (!member) return;

            let cleanBaseName = row.nickname.split('|')[0].trim();
            let formattedNick = cleanBaseName;
            
            if (row.position && row.position !== 'YOK') {
                formattedNick += ` | ${row.position}`;
            }
            
            formattedNick += ` | ${row.value}M`;

            if (formattedNick.length > 32) {
                formattedNick = formattedNick.substring(0, 32);
            }

            await member.setNickname(formattedNick);
        } catch (error) {
            console.log(`[İsim Güncelleme Hatası] ${userId}`);
        }
    });
}

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
                { name: '🏟️ Takım', value: '`.takımekle @takım`\n`.kadroekle @takım @oyuncu pozisyon`\n`.kadroçıkar @takım @oyuncu`\n`.kadro @takım`' },
                { name: '📐 Formasyon', value: '`.formasyon @takım [diziliş]`' },
                { name: '📅 Fikstür', value: '`.fikstürekle @takım1 @takım2 GG.AA.YYYY SS:DD`\n`.fikstür`' },
                { name: '📊 Puan & Maç', value: '`.puan`\n`.puanekle @takım miktar`\n`.maç @takım1 @takım2`\n`.hazırlıkmaçı @takım1 @takım2`' },
                { name: '🐦 Tweet', value: '`.tweet mesaj`' }
            )
            .setFooter({ text: message.guild ? message.guild.name : 'Lig Botu' })
            .setTimestamp();

        return message.channel.send({ embeds: [embed] });
    }

    // ---------------- OYUNCU KAYIT (.k) ----------------
    if (command === 'k') {
        const member = message.mentions.members.first();
        if (!member) return message.reply('❌ Kullanım: `.k @oyuncu TakmaAd`');

        let rawName = args.filter(a => !a.startsWith('<@')).join(' ');
        if (!rawName) return message.reply('❌ Lütfen bir isim girin.');

        let cleanName = rawName.split('|')[0].trim();

        db.run(`INSERT INTO players (user_id, nickname, value) VALUES (?, ?, 1) 
                ON CONFLICT(user_id) DO UPDATE SET nickname = ?`, 
                [member.id, cleanName, cleanName], async (err) => {
            if (err) return message.reply('Veritabanı hatası oluştu.');
            
            await updateServerNickname(message.guild, member.id);
            message.channel.send(`✅ ${member} kullanıcısının ismi **${cleanName}** olarak ayarlandı.`);
        });
    }

    // ---------------- DEĞER ARTTIRMA (.dver) / DEĞER EKSİLTME (.dsil) ----------------
    if (command === 'dver' || command === 'dsil') {
        const member = message.mentions.members.first();
        const amountArg = args.find(a => !a.startsWith('<@'));
        let amount = parseInt(amountArg);

        if (!member || isNaN(amount)) {
            return message.reply(`❌ Kullanım: \`.${command} @oyuncu miktar\` (Örn: \`.dver @oyuncu 5\`)`);
        }

        if (command === 'dsil') amount = -amount;

        db.run(`UPDATE players SET value = MAX(0, value + ?) WHERE user_id = ?`, [amount, member.id], async function(err) {
            if (err) return message.reply('Hata oluştu.');
            if (this.changes === 0) return message.reply('❌ Oyuncu veritabanına kayıtlı değil! Önce `.k @oyuncu İsim` yapın.');
            
            await updateServerNickname(message.guild, member.id);
            message.channel.send(`✅ ${member} oyuncusunun değeri güncellendi.`);
        });
    }

    // ---------------- KAYITSIZ VER (.kayıtsızver) ----------------
    if (command === 'kayıtsızver') {
        const member = message.mentions.members.first();
        if (!member) return message.reply('❌ Kullanım: `.kayıtsızver @oyuncu`');

        db.run(`UPDATE players SET team_id = NULL, position = 'YOK', value = 0 WHERE user_id = ?`, [member.id], async (err) => {
            if (err) return message.reply('Hata oluştu.');
            
            try { await member.setNickname(null); } catch (e) {}
            message.channel.send(`✅ ${member} kayıtsıza atıldı.`);
        });
    }

    // ---------------- KADROYA OYUNCU EKLE (.kadroekle) ----------------
    if (command === 'kadroekle' || command === 'kadrockle') {
        const role = message.mentions.roles.first();
        const member = message.mentions.members.first();
        const position = args.filter(a => !a.startsWith('<@') && !a.startsWith('<&')).join(' ') || 'YOK';

        if (!role || !member) {
            return message.reply('❌ Kullanım: `.kadroekle @takım @oyuncu pozisyon`');
        }

        db.run(`UPDATE players SET team_id = ?, position = ? WHERE user_id = ?`,
                [role.id, position, member.id], async function(err) {
            if (err) return message.reply('Veritabanı hatası.');
            if (this.changes === 0) return message.reply('❌ Oyuncu bulunamadı! Önce `.k` ile kaydedin.');

            try { await member.roles.add(role); } catch(e) {}
            await updateServerNickname(message.guild, member.id);
            
            message.channel.send(`✅ ${member} oyuncusu **${role.name}** kadrosuna **[${position}]** pozisyonuyla eklendi.`);
        });
    }

    // ---------------- KADRODAN ÇIKAR (.kadroçıkar) ----------------
    if (command === 'kadroçıkar') {
        const role = message.mentions.roles.first();
        const member = message.mentions.members.first();

        if (!role || !member) return message.reply('❌ Kullanım: `.kadroçıkar @takım @oyuncu`');

        db.run(`UPDATE players SET team_id = NULL, position = 'YOK' WHERE user_id = ? AND team_id = ?`, [member.id, role.id], async function(err) {
            if (err) return message.reply('Hata oluştu.');
            if (this.changes === 0) return message.reply('❌ Oyuncu bu takımın kadrosunda değil.');
            
            try { await member.roles.remove(role); } catch(e) {}
            await updateServerNickname(message.guild, member.id);
            
            message.channel.send(`✅ ${member} oyuncusu **${role.name}** kadrosundan çıkarıldı.`);
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
                embed.addFields({ name: '⚪ BOŞ', value: `**${searchName}** için oyuncu bulunamadı.` });
            } else {
                embed.addFields(
                    { name: 'Aranan', value: searchName },
                    { name: 'Oyuncu', value: `<@${row.user_id}>` },
                    { name: 'Takma Ad', value: `${row.nickname} | ${row.position} | ${row.value}M` },
                    { name: 'Değer', value: `${row.value}M` },
                    { name: 'Durum', value: row.team_id ? '🔴 DOLU' : '🟢 BOŞ' }
                );
            }
            message.channel.send({ embeds: [embed] });
        });
    }

    // ---------------- TAKIM EKLE (.takımekle) ----------------
    if (command === 'takımekle') {
        const role = message.mentions.roles.first();
        if (!role) return message.reply('❌ Kullanım: `.takımekle @takım`');

        db.run(`INSERT OR IGNORE INTO teams (role_id, name) VALUES (?, ?)`, [role.id, role.name], (err) => {
            if (err) return message.reply('Hata oluştu.');
            message.channel.send(`✅ **${role.name}** takımı lige eklendi.`);
        });
    }

    // ---------------- KADRO (.kadro) ----------------
    if (command === 'kadro') {
        const role = message.mentions.roles.first();
        if (!role) return message.channel.send('❌ **Kullanım:** `.kadro @Takım`');

        db.all(`SELECT * FROM players WHERE team_id = ?`, [role.id], (err, rows) => {
            if (err) return console.error(err);

            const embed = new EmbedBuilder()
                .setTitle(`🛡️ ${role.name.toUpperCase()} KADROSU`)
                .setColor('#2b2d31');

            if (!rows || rows.length === 0) {
                embed.setDescription('Bu takımda kayıtlı oyuncu bulunamadı.');
            } else {
                let kadroMetni = rows.map(p => `<@${p.user_id}> - **Pozisyon:** ${p.position} - **Değer:** ${p.value}M`).join('\n');
                embed.setDescription(kadroMetni);
            }

            message.channel.send({ embeds: [embed] });
        });
    }

    // ---------------- FORMASYON (.formasyon) ----------------
    if (command === 'formasyon') {
        const role = message.mentions.roles.first();
        const formationText = args.slice(1).join(' ');

        if (!role) return message.reply('❌ Kullanım: `.formasyon @takım [diziliş]`');

        if (formationText) {
            db.run(`UPDATE teams SET formation = ? WHERE role_id = ?`, [formationText, role.id], function(err) {
                if (err) return message.reply('Hata oluştu.');
                message.channel.send(`✅ **${role.name}** takımının formasyonu **${formationText}** olarak güncellendi.`);
            });
        } else {
            db.get(`SELECT formation FROM teams WHERE role_id = ?`, [role.id], (err, row) => {
                if (!row) return message.reply('Takım bulunamadı.');
                message.channel.send(`📐 **${role.name}** takımı formasyonu: **${row.formation}**`);
            });
        }
    }

    // ---------------- FİKSTÜR (.fikstürekle / .fikstür) ----------------
    if (command === 'fikstürekle') {
        const roles = message.mentions.roles.first(2);
        const dateStr = args.slice(2).join(' ');

        if (roles.length < 2 || !dateStr) {
            return message.reply('❌ Kullanım: `.fikstürekle @takım1 @takım2 GG.AA.YYYY SS:DD`');
        }

        db.run(`INSERT INTO fixtures (team1_id, team2_id, date_str) VALUES (?, ?, ?)`, [roles[0].id, roles[1].id, dateStr], (err) => {
            if (err) return message.reply('Hata oluştu.');
            message.channel.send(`📅 Fikstür eklendi: **<@&${roles[0].id}> vs <@&${roles[1].id}>** | 🕒 ${dateStr}`);
        });
    }

    if (command === 'fikstür') {
        db.all(`SELECT * FROM fixtures`, [], (err, rows) => {
            if (err) return console.error(err);

            const embed = new EmbedBuilder().setTitle('📅 MAÇ FİKSTÜRÜ').setColor('#2b2d31');
            if (!rows || rows.length === 0) {
                embed.setDescription('Planlanmış maç bulunmuyor.');
            } else {
                let list = rows.map((f, i) => `${i+1}. <@&${f.team1_id}> 🆚 <@&${f.team2_id}> — 🕒 **${f.date_str}**`).join('\n');
                embed.setDescription(list);
            }
            message.channel.send({ embeds: [embed] });
        });
    }

    // ---------------- RESMİ LİG MAÇI (.maç) ----------------
    if (command === 'maç' || command === 'mac') {
        const roles = message.mentions.roles.first(2);
        if (roles.length < 2) return message.reply('❌ Kullanım: `.maç @takım1 @takım2`');

        const team1 = roles[0];
        const team2 = roles[1];

        const score1 = Math.floor(Math.random() * 5);
        const score2 = Math.floor(Math.random() * 5);

        let p1 = 0, p2 = 0, w1 = 0, w2 = 0, d1 = 0, d2 = 0, l1 = 0, l2 = 0;

        if (score1 > score2) { p1 = 3; w1 = 1; l2 = 1; }
        else if (score2 > score1) { p2 = 3; w2 = 1; l1 = 1; }
        else { p1 = 1; p2 = 1; d1 = 1; d2 = 1; }

        db.run(`UPDATE teams SET played = played + 1, points = points + ?, won = won + ?, drawn = drawn + ?, lost = lost + ?, gf = gf + ?, ga = ga + ? WHERE role_id = ?`,
            [p1, w1, d1, l1, score1, score2, team1.id]);

        db.run(`UPDATE teams SET played = played + 1, points = points + ?, won = won + ?, drawn = drawn + ?, lost = lost + ?, gf = gf + ?, ga = ga + ? WHERE role_id = ?`,
            [p2, w2, d2, l2, score2, score1, team2.id]);

        const embed = new EmbedBuilder()
            .setTitle('⚽ LİG MAÇI SONUCU')
            .setColor('#2b2d31')
            .setDescription(`**<@&${team1.id}> ${score1} - ${score2} <@&${team2.id}>**\n\n✅ Maç sonucu puan durumuna işlendi!`)
            .setTimestamp();

        message.channel.send({ embeds: [embed] });
    }

    // ---------------- HAZIRLIK MAÇI (.hazırlıkmaçı / .hm) ----------------
    if (command === 'hazırlıkmaçı' || command === 'hazırlıkmaci' || command === 'hm') {
        const roles = message.mentions.roles.first(2);
        if (roles.length < 2) return message.reply('❌ Kullanım: `.hazırlıkmaçı @takım1 @takım2`');

        const team1 = roles[0];
        const team2 = roles[1];

        // Rastgele Skor
        const score1 = Math.floor(Math.random() * 5);
        const score2 = Math.floor(Math.random() * 5);

        const embed = new EmbedBuilder()
            .setTitle('🤝 HAZIRLIK MAÇI SONUCU')
            .setColor('#f1c40f')
            .setDescription(`**<@&${team1.id}> ${score1} - ${score2} <@&${team2.id}>**\n\nℹ️ *Bu maç dostluk maçı olduğu için puan tablosuna **yansıtılmamıştır**.*`)
            .setTimestamp();

        message.channel.send({ embeds: [embed] });
    }

    // ---------------- PUAN EKLENME (.puanekle) ----------------
    if (command === 'puanekle') {
        const role = message.mentions.roles.first();
        const amountStr = args.find(a => !a.startsWith('<@&'));
        const amount = parseInt(amountStr);

        if (!role || isNaN(amount)) {
            return message.reply('❌ Kullanım: `.puanekle @takım Miktar`');
        }

        db.run(`UPDATE teams SET points = points + ? WHERE role_id = ?`, [amount, role.id], function(err) {
            if (err) return message.reply('Hata oluştu.');
            if (this.changes === 0) return message.reply('❌ Takım bulunamadı. Önce `.takımekle @takım` komutunu çalıştırın.');
            message.channel.send(`✅ **${role.name}** takımına **${amount}** puan eklendi.`);
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
                embed.setDescription('Henüz lige eklenmiş bir takım bulunmuyor.');
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

    // ---------------- TWEET ATMA (.tweet) ----------------
    if (command === 'tweet') {
        const tweetMsg = args.join(' ');
        if (!tweetMsg) return message.reply('❌ Kullanım: `.tweet mesaj`');

        const embed = new EmbedBuilder()
            .setAuthor({ name: message.author.tag, iconURL: message.author.displayAvatarURL() })
            .setDescription(`🐦 ${tweetMsg}`)
            .setColor('#1da1f2')
            .setTimestamp();

        message.channel.send({ embeds: [embed] });
    }

    // ---------------- MİNİ OYUNLAR (.ant / .pen) ----------------
    if (command === 'ant' || command === 'antrenman') {
        message.reply('🏋️ Antrenman başarıyla tamamlandı! Oyuncu kondisyon topladı.');
    }

    if (command === 'pen' || command === 'penaltı') {
        const golMu = Math.random() < 0.5;
        message.reply(golMu ? '⚽ **GOL!** Penaltı ağlarla buluştu!' : '❌ **KAÇTI!** Kaleci topu çıkardı.');
    }
});

client.login(TOKEN);
