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
        formation TEXT DEFAULT '4-3-3'
    )`);

    // Fikstür Tablosu
    db.run(`CREATE TABLE IF NOT EXISTS fixtures (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        team1_id TEXT,
        team2_id TEXT,
        date_str TEXT
    )`);
});

// Oyuncunun Discord Takma Adını (Nickname) Otomatik Güncelleyen Yardımcı Fonksiyon
async function updateServerNickname(guild, userId) {
    db.get(`SELECT * FROM players WHERE user_id = ?`, [userId], async (err, row) => {
        if (err || !row) return;

        try {
            const member = await guild.members.fetch(userId);
            if (!member) return;

            // Nickname Formatı: İsim | POZ | Değer (Örn: V.Osimhen | SNT | 168M€)
            let newNick = row.nickname;
            if (row.position && row.position !== 'YOK') {
                newNick += ` | ${row.position}`;
            }
            if (row.value) {
                newNick += ` | ${row.value}`;
            }

            // Discord isim limiti 32 karakterdir
            if (newNick.length > 32) {
                newNick = newNick.substring(0, 32);
            }

            await member.setNickname(newNick);
        } catch (error) {
            console.log(`[İsim Güncelleme Hatası] Yetki yetersiz veya sunucu sahibi: ${userId}`);
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
                { name: '💰 Değer', value: '`.dver @oyuncu miktar`\n`.dsil @oyuncu`' },
                { name: '🏋️ Antrenman', value: '`.ant` / `.antrenman`' },
                { name: '🥅 Penaltı', value: '`.pen` / `.penaltı`' },
                { name: '🔍 Oyuncu', value: '`.ara isim`' },
                { name: '🏟️ Takım', value: '`.takımekle @takım`\n`.takımdeğer @takım`\n`.kadroekle @takım @oyuncu pozisyon`\n`.kadroçıkar @takım @oyuncu`\n`.kadro @takım`' },
                { name: '📐 Formasyon', value: '`.formasyon @takım [diziliş]`' },
                { name: '📅 Fikstür', value: '`.fikstürekle @takım1 @takım2 GG.AA.YYYY SS:DD`\n`.fikstür`' },
                { name: '📊 Puan', value: '`.puan`\n`.puanekle @takım miktar`' },
                { name: '⚽ Maç', value: '`.maç @takım1 @takım2`' },
                { name: '🐦 Tweet', value: '`.tweet mesaj`' }
            )
            .setFooter({ text: message.guild ? message.guild.name : 'Lig Botu' })
            .setTimestamp();

        return message.channel.send({ embeds: [embed] });
    }

    // ---------------- OYUNCU KAYIT (.k) ----------------
    if (command === 'k') {
        const member = message.mentions.members.first();
        const nickname = args.slice(1).join(' ');

        if (!member || !nickname) {
            return message.reply('❌ Kullanım: `.k @oyuncu TakmaAd`');
        }

        db.run(`INSERT INTO players (user_id, nickname) VALUES (?, ?) 
                ON CONFLICT(user_id) DO UPDATE SET nickname = ?`, 
                [member.id, nickname, nickname], async (err) => {
            if (err) return message.reply('Veritabanı hatası oluştu.');
            
            await updateServerNickname(message.guild, member.id);
            message.channel.send(`✅ ${member} kullanıcısının ismi ve kaydı güncellendi.`);
        });
    }

    // ---------------- KAYITSIZ VER (.kayıtsızver) ----------------
    if (command === 'kayıtsızver') {
        const member = message.mentions.members.first();
        if (!member) return message.reply('❌ Kullanım: `.kayıtsızver @oyuncu`');

        db.run(`UPDATE players SET team_id = NULL, position = 'YOK', value = '0M€' WHERE user_id = ?`, [member.id], async (err) => {
            if (err) return message.reply('Hata oluştu.');
            
            try { await member.setNickname(null); } catch (e) {}
            message.channel.send(`✅ ${member} kayıtsıza atıldı, ismi ve bilgileri sıfırlandı.`);
        });
    }

    // ---------------- DEĞER VER (.dver) / DEĞER SİL (.dsil) ----------------
    if (command === 'dver' || command === 'dsil') {
        const member = message.mentions.members.first();
        const val = command === 'dsil' ? '0M€' : args.find(a => !a.startsWith('<@'));

        if (!member || (!val && command === 'dver')) {
            return message.reply(`❌ Kullanım: \`.${command} @oyuncu ${command === 'dver' ? 'miktar' : ''}\``);
        }

        db.run(`UPDATE players SET value = ? WHERE user_id = ?`, [val, member.id], async function(err) {
            if (err) return message.reply('Hata oluştu.');
            if (this.changes === 0) return message.reply('❌ Bu oyuncu veritabanında kayıtlı değil! Önce `.k` ile kaydedin.');
            
            await updateServerNickname(message.guild, member.id);
            message.channel.send(`✅ ${member} oyuncusunun değeri **${val}** yapıldı ve takma adı güncellendi.`);
        });
    }

    // ---------------- KADROYA OYUNCU EKLE (.kadroekle) ----------------
    if (command === 'kadroekle' || command === 'kadrockle') {
        const role = message.mentions.roles.first();
        const member = message.mentions.members.first();
        const position = args.slice(2).join(' ') || 'YOK';

        if (!role || !member) {
            return message.reply('❌ Kullanım: `.kadroekle @takım @oyuncu [pozisyon]`');
        }

        db.run(`INSERT INTO players (user_id, nickname, team_id, position) VALUES (?, ?, ?, ?)
                ON CONFLICT(user_id) DO UPDATE SET team_id = ?, position = ?`,
                [member.id, member.displayName.split('|')[0].trim(), role.id, position, role.id, position], async (err) => {
            if (err) return message.reply('Veritabanı hatası oluştu.');
            
            try { await member.roles.add(role); } catch(e) {}
            await updateServerNickname(message.guild, member.id);
            
            message.channel.send(`✅ ${member} oyuncusu **${role.name}** kadrosuna **[${position}]** pozisyonuyla eklendi ve ismi güncellendi.`);
        });
    }

    // ---------------- KADRODAN ÇIKAR (.kadroçıkar) ----------------
    if (command === 'kadroçıkar') {
        const role = message.mentions.roles.first();
        const member = message.mentions.members.first();

        if (!role || !member) return message.reply('❌ Kullanım: `.kadroçıkar @takım @oyuncu`');

        db.run(`UPDATE players SET team_id = NULL, position = 'YOK' WHERE user_id = ? AND team_id = ?`, [member.id, role.id], async function(err) {
            if (err) return message.reply('Hata oluştu.');
            if (this.changes === 0) return message.reply('❌ Oyuncu bu takımın kadrosunda bulunamadı.');
            
            try { await member.roles.remove(role); } catch(e) {}
            await updateServerNickname(message.guild, member.id);
            
            message.channel.send(`✅ ${member} oyuncusu **${role.name}** kadrosundan çıkarıldı ve ismi güncellendi.`);
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
                    { name: 'Takma Ad', value: `${row.nickname} | ${row.position} | ${row.value}` },
                    { name: 'Değer', value: row.value },
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
                let kadroMetni = rows.map(p => `<@${p.user_id}> - **Pozisyon:** ${p.position} - **Değer:** ${p.value}`).join('\n');
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
