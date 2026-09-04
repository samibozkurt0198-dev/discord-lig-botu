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

// Veritabanı Tablolarına Asist Sütunları Eklendi
db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS players (
        user_id TEXT PRIMARY KEY,
        nickname TEXT,
        value INTEGER DEFAULT 1,
        team_id TEXT DEFAULT NULL,
        position TEXT DEFAULT 'YOK',
        ant_count INTEGER DEFAULT 0,
        goals INTEGER DEFAULT 0,
        assists INTEGER DEFAULT 0
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

// 90 Dakikalık Canlı Maç Simülasyon Fonksiyonu
async function runLiveMatch(message, team1Role, team2Role, isOfficial = true) {
    return new Promise((resolve) => {
        db.all(`SELECT * FROM players WHERE team_id IN (?, ?)`, [team1Role.id, team2Role.id], async (err, players) => {
            if (err) {
                message.reply('Veritabanı hatası.');
                return resolve(null);
            }

            const team1Players = players.filter(p => p.team_id === team1Role.id);
            const team2Players = players.filter(p => p.team_id === team2Role.id);

            const val1 = team1Players.reduce((acc, p) => acc + p.value, 0);
            const val2 = team2Players.reduce((acc, p) => acc + p.value, 0);

            let score1 = 0;
            let score2 = 0;
            let currentPossession = (val1 >= val2) ? team1Role : team2Role;
            let currentDistance = 50; // Başlangıçta santra (50 metre)
            let lastPasser = null;
            let currentCarrier = null;

            let matchLog = [];
            let scorers = [];

            const getRandomPlayer = (tPlayers) => {
                if (!tPlayers || tPlayers.length === 0) return { nickname: 'Açık Oyuncu', user_id: null };
                return tPlayers[Math.floor(Math.random() * tPlayers.length)];
            };

            const embed = new EmbedBuilder()
                .setTitle(`🏟️ CANLI MAÇ: ${team1Role.name} vs ${team2Role.name}`)
                .setColor('#2b2d31')
                .setDescription('Maç hakemin düdüğüyle başlamak üzere...')
                .setTimestamp();

            const matchMsg = await message.channel.send({ embeds: [embed] });

            let minute = 1;

            const interval = setInterval(async () => {
                if (minute > 90) {
                    clearInterval(interval);

                    const finalEmbed = new EmbedBuilder()
                        .setTitle(`🏁 MAÇ BİTTİ | ${team1Role.name} ${score1} - ${score2} ${team2Role.name}`)
                        .setColor('#00ff00')
                        .addFields(
                            { name: '📊 Kadro Değerleri', value: `**${team1Role.name}:** ${val1}M\n**${team2Role.name}:** ${val2}M` },
                            { name: '⚽ Goller ve Asistler', value: scorers.length > 0 ? scorers.join('\n') : 'Gol olmadı.' }
                        )
                        .setFooter({ text: isOfficial ? 'Resmi Lig Maçı İşlendi' : 'Hazırlık Maçı' })
                        .setTimestamp();

                    await matchMsg.edit({ embeds: [finalEmbed] });
                    return resolve({ score1, score2, team1Players, team2Players });
                }

                const currentTeamPlayers = (currentPossession.id === team1Role.id) ? team1Players : team2Players;
                
                // Oyuncu değiştir veya topu koru
                if (!currentCarrier || Math.random() < 0.4) {
                    lastPasser = currentCarrier;
                    currentCarrier = getRandomPlayer(currentTeamPlayers);
                }

                let actionText = '';

                // Hücum / Top Kaybı Mantığı
                const teamVal = (currentPossession.id === team1Role.id) ? val1 : val2;
                const oppVal = (currentPossession.id === team1Role.id) ? val2 : val1;
                const attackSuccessChance = 0.5 + ((teamVal - oppVal) * 0.01);

                if (Math.random() < attackSuccessChance) {
                    // İlerleme
                    currentDistance -= Math.floor(Math.random() * 12) + 5;
                    if (currentDistance < 8) currentDistance = 8;
                    actionText = `🏃 **${currentCarrier.nickname}** topu ileriye taşıyor! Kaleye mesafe: **${currentDistance}m**`;
                } else {
                    // Top Kaybı
                    currentPossession = (currentPossession.id === team1Role.id) ? team2Role : team1Role;
                    currentDistance = 60 - currentDistance;
                    if (currentDistance < 20) currentDistance = 35;
                    currentCarrier = getRandomPlayer((currentPossession.id === team1Role.id) ? team1Players : team2Players);
                    lastPasser = null;
                    actionText = `❌ Savunma araya girdi! Top **${currentPossession.name}** takımına geçti.`;
                }

                // Şut ve Gol İhtimali (Mesafe kısaldıkça ihtimal artar)
                if (currentDistance <= 25 && Math.random() < (0.80 - (currentDistance * 0.025))) {
                    const isGoal = Math.random() < (0.75 - (currentDistance * 0.02));
                    
                    if (isGoal) {
                        if (currentPossession.id === team1Role.id) score1++;
                        else score2++;

                        let scorerMention = currentCarrier.user_id ? `<@${currentCarrier.user_id}>` : currentCarrier.nickname;
                        let assistText = '';

                        if (lastPasser && lastPasser.user_id && lastPasser.user_id !== currentCarrier.user_id) {
                            assistText = ` (Asist: <@${lastPasser.user_id}>)`;
                            db.run(`UPDATE players SET assists = assists + 1 WHERE user_id = ?`, [lastPasser.user_id]);
                        }

                        if (currentCarrier.user_id) {
                            db.run(`UPDATE players SET goals = goals + 1 WHERE user_id = ?`, [currentCarrier.user_id]);
                        }

                        actionText = `⚽ **GOOOOL!** **${currentCarrier.nickname}** **${currentDistance}m** mesafeden harika vurdu ve topu ağlara gönderdi!${assistText}`;
                        scorers.push(`⏱️ ${minute}' **${currentCarrier.nickname}**${lastPasser ? ' (' + lastPasser.nickname + ')' : ''}`);

                        // Santra
                        currentPossession = (currentPossession.id === team1Role.id) ? team2Role : team1Role;
                        currentDistance = 50;
                        currentCarrier = null;
                        lastPasser = null;
                    } else {
                        actionText = `💥 **${currentCarrier.nickname}** **${currentDistance}m** mesafeden sert vurdu! Top az farkla dışarı gitti!`;
                        currentDistance = 45;
                    }
                }

                matchLog.unshift(`**[${minute}']** ${actionText}`);
                if (matchLog.length > 5) matchLog.pop();

                const liveEmbed = new EmbedBuilder()
                    .setTitle(`🏟️ ${team1Role.name} ${score1} - ${score2} ${team2Role.name}`)
                    .setColor('#f1c40f')
                    .setDescription(`⏱️ **Dakika:** ${minute}'\n📍 **Topun Olduğu Takım:** ${currentPossession}\n👤 **Toptaki Oyuncu:** ${currentCarrier ? currentCarrier.nickname : 'Mücadele Var'}\n📏 **Kaleye Mesafe:** ${currentDistance} Metre\n\n**Olay Akışı:**\n${matchLog.join('\n')}`)
                    .setFooter({ text: 'Canlı Maç Simülasyonu Devam Ediyor...' });

                await matchMsg.edit({ embeds: [liveEmbed] }).catch(() => {});

                minute += Math.floor(Math.random() * 4) + 2; // Dakikaları 2-5'er hızlandırarak 90'a tamamlar
            }, 1800);
        });
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
                { name: '🏋️ Antrenman', value: '`.ant` / `.antrenman` (5/5 olunca +5M değer)' },
                { name: '🥅 Penaltı', value: '`.pen` / `.penaltı` (Gol olunca +3M değer)' },
                { name: '🔍 Oyuncu & Krallık', value: '`.ara isim`\n`.krallık`' },
                { name: '🏟️ Takım', value: '`.takımekle @takım`\n`.kadroekle @takım @oyuncu pozisyon`\n`.kadroçıkar @takım @oyuncu`\n`.kadro @takım`' },
                { name: '📐 Formasyon', value: '`.formasyon @takım [diziliş]`' },
                { name: '📅 Fikstür', value: '`.fikstürekle @takım1 @takım2 GG.AA.YYYY SS:DD`\n`.fikstür`' },
                { name: '📊 Puan & Canlı Maç', value: '`.puan`\n`.puanekle @takım miktar`\n`.maç @takım1 @takım2`\n`.hazırlıkmaçı @takım1 @takım2`' },
                { name: '🐦 Tweet', value: '`.tweet mesaj`' }
            )
            .setFooter({ text: message.guild ? message.guild.name : 'Lig Botu' })
            .setTimestamp();

        return message.channel.send({ embeds: [embed] });
    }

    // ---------------- GOL & ASİST KRALLIĞI (.krallık) ----------------
    if (command === 'krallık' || command === 'krallik') {
        db.all(`SELECT * FROM players ORDER BY goals DESC, assists DESC LIMIT 10`, [], (err, rows) => {
            if (err) return message.reply('Hata oluştu.');

            const embed = new EmbedBuilder()
                .setTitle(`🏆 ${serverName} • GOL VE ASİST KRALLIĞI`)
                .setColor('#ffd700');

            if (!rows || rows.length === 0) {
                embed.setDescription('Henüz gol veya asist kaydedilmemiş.');
            } else {
                let text = rows.map((p, i) => `${i + 1}. <@${p.user_id}> — ⚽ **${p.goals || 0} Gol** | 🅰️ **${p.assists || 0} Asist**`).join('\n');
                embed.setDescription(text);
            }
            message.channel.send({ embeds: [embed] });
        });
    }

    // ---------------- OYUNCU KAYIT (.k) ----------------
    if (command === 'k') {
        const member = message.mentions.members.first();
        if (!member) return message.reply('❌ Kullanım: `.k @oyuncu TakmaAd`');

        let rawName = args.filter(a => !a.startsWith('<@')).join(' ');
        if (!rawName) return message.reply('❌ Lütfen bir isim girin.');

        let cleanName = rawName.split('|')[0].trim();

        db.run(`INSERT INTO players (user_id, nickname, value, ant_count, goals, assists) VALUES (?, ?, 1, 0, 0, 0) 
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

        db.run(`UPDATE players SET team_id = NULL, position = 'YOK', value = 0, ant_count = 0 WHERE user_id = ?`, [member.id], async (err) => {
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
                    { name: 'İstatistik', value: `⚽ ${row.goals || 0} Gol | 🅰️ ${row.assists || 0} Asist` },
                    { name: 'Antrenman', value: `${row.ant_count || 0}/5` },
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
                let totalVal = rows.reduce((acc, p) => acc + p.value, 0);
                let kadroMetni = rows.map(p => `<@${p.user_id}> - **Pozisyon:** ${p.position} - **Değer:** ${p.value}M - ⚽ ${p.goals || 0}G / 🅰️ ${p.assists || 0}A`).join('\n');
                embed.setDescription(`💰 **Kadro Değeri:** ${totalVal}M\n\n` + kadroMetni);
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

    // ---------------- CANLI RESMİ LİG MAÇI (.maç) ----------------
    if (command === 'maç' || command === 'mac') {
        const roles = message.mentions.roles.first(2);
        if (roles.length < 2) return message.reply('❌ Kullanım: `.maç @takım1 @takım2`');

        const team1 = roles[0];
        const team2 = roles[1];

        const result = await runLiveMatch(message, team1, team2, true);

        if (result) {
            const { score1, score2 } = result;
            let p1 = 0, p2 = 0, w1 = 0, w2 = 0, d1 = 0, d2 = 0, l1 = 0, l2 = 0;

            if (score1 > score2) { p1 = 3; w1 = 1; l2 = 1; }
            else if (score2 > score1) { p2 = 3; w2 = 1; l1 = 1; }
            else { p1 = 1; p2 = 1; d1 = 1; d2 = 1; }

            db.run(`UPDATE teams SET played = played + 1, points = points + ?, won = won + ?, drawn = drawn + ?, lost = lost + ?, gf = gf + ?, ga = ga + ? WHERE role_id = ?`,
                [p1, w1, d1, l1, score1, score2, team1.id]);

            db.run(`UPDATE teams SET played = played + 1, points = points + ?, won = won + ?, drawn = drawn + ?, lost = lost + ?, gf = gf + ?, ga = ga + ? WHERE role_id = ?`,
                [p2, w2, d2, l2, score2, score1, team2.id]);
        }
    }

    // ---------------- CANLI HAZIRLIK MAÇI (.hazırlıkmaçı / .hm) ----------------
    if (command === 'hazırlıkmaçı' || command === 'hazırlıkmaci' || command === 'hm') {
        const roles = message.mentions.roles.first(2);
        if (roles.length < 2) return message.reply('❌ Kullanım: `.hazırlıkmaçı @takım1 @takım2`');

        await runLiveMatch(message, roles[0], roles[1], false);
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
        const userId = message.author.id;

        db.get(`SELECT * FROM players WHERE user_id = ?`, [userId], (err, row) => {
            if (err) return message.reply('Hata oluştu.');
            if (!row) return message.reply('❌ Antrenman yapabilmek için önce kayıtlı olmalısın! (`.k TakmaAd`)');

            let currentCount = (row.ant_count || 0) + 1;

            if (currentCount >= 5) {
                db.run(`UPDATE players SET value = value + 5, ant_count = 0 WHERE user_id = ?`, [userId], async (err) => {
                    if (err) return message.reply('Hata oluştu.');
                    await updateServerNickname(message.guild, userId);
                    message.reply(`🏋️ **Tebrikler!** 5/5 antrenmanı tamamladın! **+5M** değer kazandın! 🔥`);
                });
            } else {
                db.run(`UPDATE players SET ant_count = ? WHERE user_id = ?`, [currentCount, userId], (err) => {
                    if (err) return message.reply('Hata oluştu.');
                    message.reply(`🏋️ Antrenman tamamlandı! **[${currentCount}/5]** (5/5 olduğunda +5M değer kazanacaksın)`);
                });
            }
        });
    }

    if (command === 'pen' || command === 'penaltı') {
        const userId = message.author.id;

        db.get(`SELECT * FROM players WHERE user_id = ?`, [userId], (err, row) => {
            if (err) return message.reply('Hata oluştu.');
            if (!row) return message.reply('❌ Penaltı atabilmek için önce kayıtlı olmalısın! (`.k TakmaAd`)');

            const golMu = Math.random() < 0.5;

            if (golMu) {
                db.run(`UPDATE players SET value = value + 3, goals = goals + 1 WHERE user_id = ?`, [userId], async (err) => {
                    if (err) return message.reply('Hata oluştu.');
                    await updateServerNickname(message.guild, userId);
                    message.reply('⚽ **GOL!** Harika bir vuruş! Değerine **+3M** eklendi! 🎉');
                });
            } else {
                message.reply('❌ **KAÇTI!** Kaleci harika uzandı, top kornere çıktı!');
            }
        });
    }
});

client.login(TOKEN);

