const { 
    Client, 
    GatewayIntentBits, 
    EmbedBuilder, 
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle, 
    StringSelectMenuBuilder,
    AttachmentBuilder,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle
} = require('discord.js');
const sqlite3 = require('sqlite3').verbose();
const { createCanvas } = require('@napi-rs/canvas');

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

// Yetkili Rol İsimleri
const REGISTRATION_ROLE_NAME = 'Kayıt Yetkilisi';
const VALUE_ROLE_NAME = 'Değer Yetkilisi';

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
        position TEXT DEFAULT 'YOK',
        ant_count INTEGER DEFAULT 0,
        goals INTEGER DEFAULT 0,
        assists INTEGER DEFAULT 0,
        role_type TEXT DEFAULT 'FOOTBALLER'
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
        formation TEXT DEFAULT '4-3-3',
        tactic TEXT DEFAULT 'Dengeli',
        starting_11 TEXT DEFAULT '{}'
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS fixtures (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        team1_id TEXT,
        team2_id TEXT,
        date_str TEXT
    )`);
});

const TACTICS = {
    'Baskı': { counters: 'Tiki-Taka', description: 'Tiki-Taka taktiğini ezer, Otobüs Çek taktiğine karşı zayıftır.' },
    'Tiki-Taka': { counters: 'Otobüs Çek', description: 'Otobüs Çek taktiğini ezer, Baskı taktiğine karşı zayıftır.' },
    'Otobüs Çek': { counters: 'Baskı', description: 'Baskı taktiğini ezer, Tiki-Taka taktiğine karşı zayıftır.' },
    'Dengeli': { counters: null, description: 'Standart taktik. Hiçbir taktiğe karşı ekstra üstünlüğü veya zayıflığı yoktur.' }
};

const FORMATIONS = {
    '4-3-3': ['SNT', 'SLK', 'SĞK', 'OS1', 'OS2', 'OS3', 'SLB', 'SĞB', 'STP1', 'STP2', 'KL'],
    '4-4-2': ['SNT1', 'SNT2', 'SLO', 'SĞO', 'OS1', 'OS2', 'SLB', 'SĞB', 'STP1', 'STP2', 'KL'],
    '4-2-3-1': ['SNT', 'MÖ', 'SLO', 'SĞO', 'MÖD1', 'MÖD2', 'SLB', 'SĞB', 'STP1', 'STP2', 'KL'],
    '3-5-2': ['SNT1', 'SNT2', 'MÖ', 'SLO', 'SĞO', 'OS1', 'OS2', 'STP1', 'STP2', 'STP3', 'KL'],
    '5-3-2': ['SNT1', 'SNT2', 'OS1', 'OS2', 'OS3', 'SLK', 'SĞK', 'STP1', 'STP2', 'STP3', 'KL'],
    '4-1-2-1-2': ['SNT1', 'SNT2', 'MÖ', 'OS1', 'OS2', 'MÖD', 'SLB', 'SĞB', 'STP1', 'STP2', 'KL']
};

async function createPitchImage(formation, XI = {}) {
    const canvas = createCanvas(800, 1000);
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#1e6f3b';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    for (let i = 0; i < canvas.height; i += 100) {
        if ((i / 100) % 2 === 0) {
            ctx.fillStyle = '#238044';
            ctx.fillRect(0, i, canvas.width, 100);
        }
    }

    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 5;

    ctx.strokeRect(30, 30, 740, 940);
    ctx.beginPath();
    ctx.moveTo(30, 500);
    ctx.lineTo(770, 500);
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(400, 500, 100, 0, Math.PI * 2);
    ctx.stroke();

    ctx.strokeRect(220, 30, 360, 160);
    ctx.strokeRect(300, 30, 200, 60);
    ctx.strokeRect(220, 810, 360, 160);
    ctx.strokeRect(300, 910, 200, 60);

    const POS_COORDS = {
        '4-3-3': {
            'SNT_1': { x: 400, y: 150 }, 'SLK_1': { x: 180, y: 200 }, 'SĞK_1': { x: 620, y: 200 },
            'OS_1': { x: 260, y: 400 }, 'OS_2': { x: 400, y: 430 }, 'OS_3': { x: 540, y: 400 },
            'SLB_1': { x: 140, y: 720 }, 'STP_1': { x: 310, y: 760 }, 'STP_2': { x: 490, y: 760 }, 'SĞB_1': { x: 660, y: 720 },
            'KL_1': { x: 400, y: 910 }
        },
        '4-4-2': {
            'SNT_1': { x: 280, y: 160 }, 'SNT_2': { x: 520, y: 160 },
            'SLO_1': { x: 140, y: 380 }, 'OS_1': { x: 310, y: 420 }, 'OS_2': { x: 490, y: 420 }, 'SĞO_1': { x: 660, y: 380 },
            'SLB_1': { x: 140, y: 720 }, 'STP_1': { x: 310, y: 760 }, 'STP_2': { x: 490, y: 760 }, 'SĞB_1': { x: 660, y: 720 },
            'KL_1': { x: 400, y: 910 }
        },
        '4-2-3-1': {
            'SNT_1': { x: 400, y: 130 },
            'SLO_1': { x: 160, y: 280 }, 'MÖ_1': { x: 400, y: 270 }, 'SĞO_1': { x: 640, y: 280 },
            'MÖD_1': { x: 300, y: 480 }, 'MÖD_2': { x: 500, y: 480 },
            'SLB_1': { x: 140, y: 720 }, 'STP_1': { x: 310, y: 760 }, 'STP_2': { x: 490, y: 760 }, 'SĞB_1': { x: 660, y: 720 },
            'KL_1': { x: 400, y: 910 }
        },
        '3-5-2': {
            'SNT_1': { x: 280, y: 150 }, 'SNT_2': { x: 520, y: 150 },
            'MÖ_1': { x: 400, y: 280 },
            'SLO_1': { x: 120, y: 420 }, 'OS_1': { x: 300, y: 450 }, 'OS_2': { x: 500, y: 450 }, 'SĞO_1': { x: 680, y: 420 },
            'STP_1': { x: 220, y: 750 }, 'STP_2': { x: 400, y: 760 }, 'STP_3': { x: 580, y: 750 },
            'KL_1': { x: 400, y: 910 }
        },
        '5-3-2': {
            'SNT_1': { x: 280, y: 150 }, 'SNT_2': { x: 520, y: 150 },
            'OS_1': { x: 260, y: 380 }, 'OS_2': { x: 400, y: 400 }, 'OS_3': { x: 540, y: 380 },
            'SLK_1': { x: 110, y: 650 }, 'STP_1': { x: 255, y: 760 }, 'STP_2': { x: 400, y: 770 }, 'STP_3': { x: 545, y: 760 }, 'SĞK_1': { x: 690, y: 650 },
            'KL_1': { x: 400, y: 910 }
        },
        '4-1-2-1-2': {
            'SNT_1': { x: 280, y: 140 }, 'SNT_2': { x: 520, y: 140 },
            'MÖ_1': { x: 400, y: 260 },
            'OS_1': { x: 250, y: 390 }, 'OS_2': { x: 550, y: 390 },
            'MÖD_1': { x: 400, y: 520 },
            'SLB_1': { x: 140, y: 720 }, 'STP_1': { x: 310, y: 760 }, 'STP_2': { x: 490, y: 760 }, 'SĞB_1': { x: 660, y: 720 },
            'KL_1': { x: 400, y: 910 }
        }
    };

    const coords = POS_COORDS[formation] || POS_COORDS['4-3-3'];

    for (const [key, pos] of Object.entries(coords)) {
        const playerName = XI[key] || key.split('_')[0];
        const isFilled = Boolean(XI[key]);

        ctx.fillStyle = isFilled ? '#27ae60' : '#111111';
        ctx.beginPath();
        ctx.arc(pos.x, pos.y - 18, 16, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.stroke();

        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 12px Sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(key.split('_')[0], pos.x, pos.y - 14);

        ctx.fillStyle = isFilled ? 'rgba(0, 0, 0, 0.85)' : 'rgba(0, 0, 0, 0.6)';
        ctx.beginPath();
        const boxWidth = 130;
        const boxHeight = 28;
        ctx.roundRect(pos.x - (boxWidth / 2), pos.y + 2, boxWidth, boxHeight, 6);
        ctx.fill();
        ctx.strokeStyle = isFilled ? '#f1c40f' : '#ffffff';
        ctx.lineWidth = 1.5;
        ctx.stroke();

        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 13px Sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const displayName = playerName.length > 14 ? playerName.substring(0, 12) + '..' : playerName;
        ctx.fillText(displayName, pos.x, pos.y + 16);
    }

    const buffer = await canvas.toBuffer('image/png');
    return new AttachmentBuilder(buffer, { name: 'kadro.png' });
}

async function updateServerNickname(guild, userId) {
    db.get(`SELECT * FROM players WHERE user_id = ?`, [userId], async (err, row) => {
        if (err || !row) return;

        try {
            const member = await guild.members.fetch(userId);
            if (!member) return;

            let formattedNick = row.nickname;
            if (formattedNick.length > 32) formattedNick = formattedNick.substring(0, 32);

            await member.setNickname(formattedNick);
        } catch (error) {
            console.log(`[İsim Güncelleme Hatası] ${userId}`);
        }
    });
}

async function runLiveMatch(message, team1Role, team2Role, isOfficial = true) {
    return new Promise((resolve) => {
        db.all(`SELECT * FROM players WHERE team_id IN (?, ?)`, [team1Role.id, team2Role.id], async (err, players) => {
            if (err) {
                message.reply('Veritabanı hatası.');
                return resolve(null);
            }

            db.all(`SELECT * FROM teams WHERE role_id IN (?, ?)`, [team1Role.id, team2Role.id], async (err, teamRows) => {
                const t1Data = teamRows.find(t => t.role_id === team1Role.id) || {};
                const t2Data = teamRows.find(t => t.role_id === team2Role.id) || {};

                const team1Players = players.filter(p => p.team_id === team1Role.id);
                const team2Players = players.filter(p => p.team_id === team2Role.id);

                let val1 = team1Players.reduce((acc, p) => acc + p.value, 0);
                let val2 = team2Players.reduce((acc, p) => acc + p.value, 0);

                const tac1 = t1Data.tactic || 'Dengeli';
                const tac2 = t2Data.tactic || 'Dengeli';
                let tacticNotice = '';

                if (TACTICS[tac1]?.counters === tac2) {
                    val1 = Math.round(val1 * 1.25);
                    tacticNotice = `\n🔥 **${team1Role.name}** tıkır tıkır işleyen **${tac1}** taktiğiyle **${team2Role.name}** takımının **${tac2}** taktiğini eziyor! (+%25 Değer Büyüsü)`;
                } else if (TACTICS[tac2]?.counters === tac1) {
                    val2 = Math.round(val2 * 1.25);
                    tacticNotice = `\n🔥 **${team2Role.name}** tıkır tıkır işleyen **${tac2}** taktiğiyle **${team1Role.name}** takımının **${tac1}** taktiğini eziyor! (+%25 Değer Büyüsü)`;
                }

                let score1 = 0;
                let score2 = 0;
                let currentPossession = (val1 >= val2) ? team1Role : team2Role;
                let currentDistance = 50; 
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
                    .setDescription(`Maç hakemin düdüğüyle başlamak üzere...${tacticNotice}`)
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
                                { name: '📊 Efektif Kadro Değerleri (Taktikli)', value: `**${team1Role.name}:** ${val1}M (${tac1})\n**${team2Role.name}:** ${val2}M (${tac2})` },
                                { name: '⚽ Goller ve Asistler', value: scorers.length > 0 ? scorers.join('\n') : 'Gol olmadı.' }
                            )
                            .setFooter({ text: isOfficial ? 'Resmi Lig Maçı İşlendi' : 'Hazırlık Maçı' })
                            .setTimestamp();

                        await matchMsg.edit({ embeds: [finalEmbed] });
                        return resolve({ score1, score2, team1Players, team2Players });
                    }

                    const currentTeamPlayers = (currentPossession.id === team1Role.id) ? team1Players : team2Players;
                    
                    if (!currentCarrier || Math.random() < 0.4) {
                        lastPasser = currentCarrier;
                        currentCarrier = getRandomPlayer(currentTeamPlayers);
                    }

                    let actionText = '';

                    const teamVal = (currentPossession.id === team1Role.id) ? val1 : val2;
                    const oppVal = (currentPossession.id === team1Role.id) ? val2 : val1;
                    const attackSuccessChance = 0.5 + ((teamVal - oppVal) * 0.01);

                    if (Math.random() < attackSuccessChance) {
                        currentDistance -= Math.floor(Math.random() * 12) + 5;
                        if (currentDistance < 8) currentDistance = 8;
                        actionText = `🏃 **${currentCarrier.nickname}** topu ileriye taşıyor! Kaleye mesafe: **${currentDistance}m**`;
                    } else {
                        currentPossession = (currentPossession.id === team1Role.id) ? team2Role : team1Role;
                        currentDistance = 60 - currentDistance;
                        if (currentDistance < 20) currentDistance = 35;
                        currentCarrier = getRandomPlayer((currentPossession.id === team1Role.id) ? team1Players : team2Players);
                        lastPasser = null;
                        actionText = `❌ Savunma araya girdi! Top **${currentPossession.name}** takımına geçti.`;
                    }

                    if (currentDistance <= 25 && Math.random() < (0.80 - (currentDistance * 0.025))) {
                        const isGoal = Math.random() < (0.75 - (currentDistance * 0.02));
                        
                        if (isGoal) {
                            if (currentPossession.id === team1Role.id) score1++;
                            else score2++;

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

                    minute += Math.floor(Math.random() * 4) + 2;
                }, 1800);
            });
        });
    });
}

client.on('ready', () => {
    console.log(`Bot ${client.user.tag} olarak aktif!`);
});

// ---------------- INTERACTION VE BUTON YÖNETİMİ ----------------
client.on('interactionCreate', async (interaction) => {

    // 1. MODAL FORMLARININ ALINMASI (KAYIT FORMLARI)
    if (interaction.isModalSubmit()) {
        const customId = interaction.customId;
        
        if (customId.startsWith('modal_reg_')) {
            const parts = customId.split('_');
            const type = parts[2]; // fb, kl, td
            const targetUserId = parts[3]; // Etiketlenen Oyuncu ID'si

            const nickname = interaction.fields.getTextInputValue('input_nickname').trim();
            const country = interaction.fields.getTextInputValue('input_country').trim();

            let formattedNick = '';
            let pos = 'YOK';
            let val = 1;

            if (type === 'fb') {
                const posInput = interaction.fields.getTextInputValue('input_position').trim();
                pos = posInput.toUpperCase();
                formattedNick = `${nickname} | ${country} | ${pos} | 1M`;
            } else if (type === 'kl') {
                pos = 'KL';
                formattedNick = `${nickname} | ${country} | KL | 1M`;
            } else if (type === 'td') {
                const age = interaction.fields.getTextInputValue('input_age').trim();
                formattedNick = `${nickname} | ${country} | ${age} | 0🏆`;
                val = 0;
            }

            db.run(`INSERT INTO players (user_id, nickname, value, position, ant_count, goals, assists) 
                    VALUES (?, ?, ?, ?, 0, 0, 0)
                    ON CONFLICT(user_id) DO UPDATE SET nickname = ?, position = ?, value = ?`,
                    [targetUserId, formattedNick, val, pos, formattedNick, pos, val], async (err) => {
                if (err) return interaction.reply({ content: '❌ Kayıt sırasında veritabanı hatası oluştu.', ephemeral: true });
                
                await updateServerNickname(interaction.guild, targetUserId);
                return interaction.reply({ content: `✅ <@${targetUserId}> adlı oyuncunun kaydı **${interaction.user}** yetkilisi tarafından yapıldı!\n**Yeni İsim:** \`${formattedNick}\`` });
            });
        }
        return;
    }

    if (!interaction.isButton() && !interaction.isStringSelectMenu()) return;

    const customId = interaction.customId;

    // 2. KAYIT BUTONLARI TIKLANDIĞINDA AÇILAN MODALLAR
    if (customId.startsWith('btn_reg_')) {
        // Rol yetki kontrolü
        if (!interaction.member.roles.cache.some(r => r.name === REGISTRATION_ROLE_NAME)) {
            return interaction.reply({ content: `❌ Kayıt yapabilmek için **${REGISTRATION_ROLE_NAME}** rolüne sahip olmalısınız!`, ephemeral: true });
        }

        const parts = customId.split('_');
        const regType = parts[2]; // fb, kl, td
        const targetUserId = parts[3]; // Yetkilinin etiketlediği oyuncunun ID'si

        if (regType === 'fb') {
            const modal = new ModalBuilder()
                .setCustomId(`modal_reg_fb_${targetUserId}`)
                .setTitle('⚽ Futbolcu Kaydı');

            const nickInput = new TextInputBuilder().setCustomId('input_nickname').setLabel('Takma Ad').setStyle(TextInputStyle.Short).setRequired(true);
            const countryInput = new TextInputBuilder().setCustomId('input_country').setLabel('Ülke').setStyle(TextInputStyle.Short).setRequired(true);
            const posInput = new TextInputBuilder().setCustomId('input_position').setLabel('Mevki (Örn: SNT, OS, STP)').setStyle(TextInputStyle.Short).setRequired(true);

            modal.addComponents(
                new ActionRowBuilder().addComponents(nickInput),
                new ActionRowBuilder().addComponents(countryInput),
                new ActionRowBuilder().addComponents(posInput)
            );
            return interaction.showModal(modal);
        }

        if (regType === 'kl') {
            const modal = new ModalBuilder()
                .setCustomId(`modal_reg_kl_${targetUserId}`)
                .setTitle('🧤 Kaleci Kaydı');

            const nickInput = new TextInputBuilder().setCustomId('input_nickname').setLabel('Takma Ad').setStyle(TextInputStyle.Short).setRequired(true);
            const countryInput = new TextInputBuilder().setCustomId('input_country').setLabel('Ülke').setStyle(TextInputStyle.Short).setRequired(true);

            modal.addComponents(
                new ActionRowBuilder().addComponents(nickInput),
                new ActionRowBuilder().addComponents(countryInput)
            );
            return interaction.showModal(modal);
        }

        if (regType === 'td') {
            const modal = new ModalBuilder()
                .setCustomId(`modal_reg_td_${targetUserId}`)
                .setTitle('📋 Teknik Direktör Kaydı');

            const nickInput = new TextInputBuilder().setCustomId('input_nickname').setLabel('Takma Ad').setStyle(TextInputStyle.Short).setRequired(true);
            const countryInput = new TextInputBuilder().setCustomId('input_country').setLabel('Ülke').setStyle(TextInputStyle.Short).setRequired(true);
            const ageInput = new TextInputBuilder().setCustomId('input_age').setLabel('Yaş').setStyle(TextInputStyle.Short).setRequired(true);

            modal.addComponents(
                new ActionRowBuilder().addComponents(nickInput),
                new ActionRowBuilder().addComponents(countryInput),
                new ActionRowBuilder().addComponents(ageInput)
            );
            return interaction.showModal(modal);
        }
    }

    // TAKTİK MENÜSÜ
    if (customId.startsWith('tactic_menu_')) {
        const teamRoleId = customId.replace('tactic_menu_', '');

        const tacticEmbed = new EmbedBuilder()
            .setTitle('🧠 TAKTİK SEÇİMİ (FC 26 TAŞ-KAĞIT-MAKAS)')
            .setColor('#f39c12')
            .setDescription(
                'Takımınız için bir taktik seçin:\n\n' +
                '• ⚡ **Baskı:** Tiki-Taka taktiğini ezer! (+%25 Değer Bonusu)\n' +
                '• 🎯 **Tiki-Taka:** Otobüs Çek taktiğini ezer! (+%25 Değer Bonusu)\n' +
                '• 🛡️ **Otobüs Çek:** Baskı taktiğini ezer! (+%25 Değer Bonusu)\n' +
                '• ⚖️ **Dengeli:** Standart oyun planı.'
            );

        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId(`select_tactic_${teamRoleId}`)
            .setPlaceholder('Bir taktik seçin...')
            .addOptions([
                { label: 'Baskı', description: 'Tiki-Taka ezer | Otobüse yenilir', value: 'Baskı', emoji: '⚡' },
                { label: 'Tiki-Taka', description: 'Otobüs Çek ezer | Baskıya yenilir', value: 'Tiki-Taka', emoji: '🎯' },
                { label: 'Otobüs Çek', description: 'Baskı ezer | Tiki-Taka yenilir', value: 'Otobüs Çek', emoji: '🛡️' },
                { label: 'Dengeli', description: 'Bonus veya zayıflık içermez', value: 'Dengeli', emoji: '⚖️' }
            ]);

        const row = new ActionRowBuilder().addComponents(selectMenu);
        return interaction.reply({ embeds: [tacticEmbed], components: [row], ephemeral: true });
    }

    if (customId.startsWith('select_tactic_')) {
        const teamRoleId = customId.replace('select_tactic_', '');
        const selectedTactic = interaction.values[0];

        db.run(`UPDATE teams SET tactic = ? WHERE role_id = ?`, [selectedTactic, teamRoleId], (err) => {
            if (err) return interaction.reply({ content: 'Taktik güncellenemedi.', ephemeral: true });
            interaction.reply({ content: `✅ Takımınızın yeni taktiği **${selectedTactic}** olarak belirlendi!`, ephemeral: true });
        });
    }

    // DİZİLİŞ MENÜSÜ
    if (customId.startsWith('formation_menu_')) {
        const teamRoleId = customId.replace('formation_menu_', '');

        const formationEmbed = new EmbedBuilder()
            .setTitle('📐 DİZİLİŞ SEÇİMİ')
            .setColor('#3498db')
            .setDescription('Aşağıdaki dizilişlerden birini seçin:');

        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId(`select_formation_${teamRoleId}`)
            .setPlaceholder('Bir diziliş seçin...')
            .addOptions([
                { label: '4-3-3', description: 'Hücum ağırlıklı dengeli diziliş', value: '4-3-3' },
                { label: '4-4-2', description: 'Klasik çift santrafor dizilişi', value: '4-4-2' },
                { label: '4-2-3-1', description: 'Tek santrafor ve arkasında 3\'lü hücum hattı', value: '4-2-3-1' },
                { label: '3-5-2', description: 'Orta saha kalabalık, çift forvet', value: '3-5-2' },
                { label: '5-3-2', description: 'Defansif, hızlı hücum dizilişi', value: '5-3-2' },
                { label: '4-1-2-1-2', description: 'Dar baklava orta saha dizilişi', value: '4-1-2-1-2' }
            ]);

        const row = new ActionRowBuilder().addComponents(selectMenu);
        return interaction.reply({ embeds: [formationEmbed], components: [row], ephemeral: true });
    }

    if (customId.startsWith('select_formation_')) {
        const teamRoleId = customId.replace('select_formation_', '');
        const selectedFormation = interaction.values[0];

        db.run(`UPDATE teams SET formation = ? WHERE role_id = ?`, [selectedFormation, teamRoleId], (err) => {
            if (err) return interaction.reply({ content: 'Diziliş güncellenemedi.', ephemeral: true });
            interaction.reply({ content: `✅ Takımın yeni dizilişi **${selectedFormation}** yapıldı! \`.kadro\` atarak kontrol edebilirsiniz.`, ephemeral: true });
        });
    }

    // İLK 11 AYARLAMA
    if (customId.startsWith('lineup_menu_')) {
        await interaction.deferReply({ ephemeral: true });
        const teamRoleId = customId.replace('lineup_menu_', '');

        db.get(`SELECT * FROM teams WHERE role_id = ?`, [teamRoleId], async (err, teamRow) => {
            if (!teamRow) return interaction.editReply({ content: 'Takım verisi bulunamadı.' });

            const formation = teamRow.formation || '4-3-3';
            const positions = FORMATIONS[formation] || FORMATIONS['4-3-3'];
            let XI = {};
            try { XI = JSON.parse(teamRow.starting_11 || '{}'); } catch(e) {}

            const pitchImage = await createPitchImage(formation, XI);

            let buttons = [];
            let counts = {};

            positions.forEach((posWithIndex) => {
                const pos = posWithIndex.replace(/[0-9]/g, '');
                counts[pos] = (counts[pos] || 0) + 1;
                const posIndex = counts[pos];
                const key = `${pos}_${posIndex}`;
                const playerName = XI[key] ? XI[key].substring(0, 8) : pos;

                buttons.push(
                    new ButtonBuilder()
                        .setCustomId(`pos_select_${teamRoleId}_${key}`)
                        .setLabel(playerName)
                        .setStyle(XI[key] ? ButtonStyle.Success : ButtonStyle.Primary)
                );
            });

            const rows = [];
            for (let i = 0; i < buttons.length; i += 5) {
                rows.push(new ActionRowBuilder().addComponents(buttons.slice(i, i + 5)));
            }

            const lineupEmbed = new EmbedBuilder()
                .setTitle(`📋 İLK 11 AYARLAMA (${formation})`)
                .setColor('#2ecc71')
                .setDescription(`Saha üzerindeki yerleşim aşağıdadır. Değiştirmek istediğiniz pozisyona tıklayıp listeden oyuncu seçin:`)
                .setImage('attachment://kadro.png');

            interaction.editReply({ embeds: [lineupEmbed], files: [pitchImage], components: rows });
        });
    }

    if (customId.startsWith('pos_select_')) {
        const parts = customId.split('_');
        const teamRoleId = parts[2];
        const posKey = `${parts[3]}_${parts[4]}`;

        db.all(`SELECT * FROM players WHERE team_id = ?`, [teamRoleId], (err, players) => {
            if (!players || players.length === 0) {
                return interaction.reply({ content: '❌ Takımınızda kayıtlı oyuncu yok! Önce `.kadroekle` ile ekleyin.', ephemeral: true });
            }

            const options = players.map(p => ({
                label: p.nickname.substring(0, 25),
                description: `Değer: ${p.value}M | Pozisyon: ${p.position}`,
                value: p.nickname
            }));

            const selectMenu = new StringSelectMenuBuilder()
                .setCustomId(`assign_player_${teamRoleId}_${posKey}`)
                .setPlaceholder(`${parts[3]} pozisyonu için oyuncu seçin...`)
                .addOptions(options);

            const row = new ActionRowBuilder().addComponents(selectMenu);
            interaction.reply({ content: `👉 **${parts[3]}** pozisyonuna yerleştirmek istediğiniz oyuncuyu seçin:`, components: [row], ephemeral: true });
        });
    }

    if (customId.startsWith('assign_player_')) {
        const parts = customId.split('_');
        const teamRoleId = parts[2];
        const posKey = `${parts[3]}_${parts[4]}`;
        const selectedPlayerName = interaction.values[0];

        db.get(`SELECT starting_11 FROM teams WHERE role_id = ?`, [teamRoleId], (err, row) => {
            let XI = {};
            try { XI = JSON.parse(row?.starting_11 || '{}'); } catch(e) {}

            XI[posKey] = selectedPlayerName;

            db.run(`UPDATE teams SET starting_11 = ? WHERE role_id = ?`, [JSON.stringify(XI), teamRoleId], (err) => {
                if (err) return interaction.reply({ content: 'Oyuncu atanamadı.', ephemeral: true });
                interaction.reply({ content: `✅ **${selectedPlayerName}** oyuncusu **${parts[3]}** pozisyonuna yerleştirildi! Sayfayı yenilemek için **Kadro** butonuna tekrar basabilirsiniz.`, ephemeral: true });
            });
        });
    }
});

// ---------------- MESAJ KOMUTLARI ----------------
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
                { name: '📋 Kayıt', value: '`.k @oyuncu` (Kayıt Yetkilisi)\n`.kayıtsızver @oyuncu` (Kayıt Yetkilisi)' },
                { name: '💰 Değer', value: '`.dver @oyuncu miktar` (Değer Yetkilisi)\n`.dsil @oyuncu miktar` (Değer Yetkilisi)' },
                { name: '🏋️ Antrenman & Penaltı', value: '`.ant` / `.pen`' },
                { name: '🔍 Oyuncu & Krallık', value: '`.ara isim`\n`.krallık`' },
                { name: '🏟️ Takım & Fikstür', value: '`.takımekle @takım`\n`.kadroekle @takım @oyuncu pozisyon`\n`.kadro @takım`\n`.fikstür`\n`.puan`' }
            )
            .setFooter({ text: message.guild ? message.guild.name : 'Lig Botu' })
            .setTimestamp();

        return message.channel.send({ embeds: [embed] });
    }

    // ---------------- OYUNCU KAYIT (.k @oyuncu) ----------------
    if (command === 'k') {
        // Rol yetki kontrolü
        if (!message.member.roles.cache.some(r => r.name === REGISTRATION_ROLE_NAME)) {
            return message.reply(`❌ Kayıt komutunu kullanabilmek için **${REGISTRATION_ROLE_NAME}** rolüne sahip olmalısınız!`);
        }

        const member = message.mentions.members.first();

        if (!member) {
            return message.reply(`❌ Kayıt etmek istediğiniz oyuncuyu etiketlemelisiniz! (Örn: \`.k @oyuncu\`)`);
        }

        const btnFootballer = new ButtonBuilder()
            .setCustomId(`btn_reg_fb_${member.id}`)
            .setLabel('Futbolcu Kayıdı')
            .setStyle(ButtonStyle.Primary)
            .setEmoji('⚽');

        const btnGoalkeeper = new ButtonBuilder()
            .setCustomId(`btn_reg_kl_${member.id}`)
            .setLabel('Kaleci Kayıdı')
            .setStyle(ButtonStyle.Success)
            .setEmoji('🧤');

        const btnManager = new ButtonBuilder()
            .setCustomId(`btn_reg_td_${member.id}`)
            .setLabel('Teknik Direktör Kayıdı')
            .setStyle(ButtonStyle.Danger)
            .setEmoji('📋');

        const row = new ActionRowBuilder().addComponents(btnFootballer, btnGoalkeeper, btnManager);

        const embed = new EmbedBuilder()
            .setTitle('📝 KAYIT OLUŞTURMA')
            .setDescription(`${member} oyuncusu kayıt edilecek. Lütfen kayıt türünü seçin:`)
            .setColor('#2b2d31');

        return message.channel.send({ embeds: [embed], components: [row] });
    }

    // ---------------- DEĞER VER (.dver) / DEĞER SİL (.dsil) ----------------
    if (command === 'dver' || command === 'dsil') {
        if (!message.member.roles.cache.some(r => r.name === VALUE_ROLE_NAME)) {
            return message.reply(`❌ Bu komutu kullanabilmek için **${VALUE_ROLE_NAME}** rolüne sahip olmalısınız!`);
        }

        const member = message.mentions.members.first();
        const amountArg = args.find(a => !a.startsWith('<@'));
        let amount = parseInt(amountArg);

        if (!member || isNaN(amount)) {
            return message.reply(`❌ Kullanım: \`.${command} @oyuncu miktar\` (Örn: \`.dver @oyuncu 5\`)`);
        }

        if (command === 'dsil') amount = -amount;

        db.get(`SELECT * FROM players WHERE user_id = ?`, [member.id], (err, row) => {
            if (err || !row) return message.reply('❌ Oyuncu veritabanına kayıtlı değil!');

            let newValue = Math.max(0, row.value + amount);

            let newNick = row.nickname;
            if (newNick.includes('|')) {
                let parts = newNick.split('|');
                let lastPart = parts[parts.length - 1].trim();
                if (lastPart.endsWith('M')) {
                    parts[parts.length - 1] = ` ${newValue}M`;
                    newNick = parts.join('|');
                }
            }

            db.run(`UPDATE players SET value = ?, nickname = ? WHERE user_id = ?`, [newValue, newNick, member.id], async (err) => {
                if (err) return message.reply('Hata oluştu.');
                
                await updateServerNickname(message.guild, member.id);
                message.channel.send(`✅ ${member} oyuncusunun değeri **${newValue}M** olarak güncellendi.`);
            });
        });
    }

    // ---------------- KAYITSIZ VER (.kayıtsızver) ----------------
    if (command === 'kayıtsızver') {
        if (!message.member.roles.cache.some(r => r.name === REGISTRATION_ROLE_NAME)) {
            return message.reply(`❌ Bu komutu kullanabilmek için **${REGISTRATION_ROLE_NAME}** rolüne sahip olmalısınız!`);
        }

        const member = message.mentions.members.first();
        if (!member) return message.reply('❌ Kullanım: `.kayıtsızver @oyuncu`');

        db.run(`UPDATE players SET team_id = NULL, position = 'YOK', value = 0, ant_count = 0 WHERE user_id = ?`, [member.id], async (err) => {
            if (err) return message.reply('Hata oluştu.');
            
            try { await member.setNickname(null); } catch (e) {}
            message.channel.send(`✅ ${member} kayıtsıza atıldı.`);
        });
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
                    { name: 'Takma Ad', value: `${row.nickname}` },
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

    // ---------------- KADRO VE BUTONLAR (.kadro) ----------------
    if (command === 'kadro') {
        const role = message.mentions.roles.first();
        if (!role) return message.channel.send('❌ **Kullanım:** `.kadro @Takım`');

        db.get(`SELECT * FROM teams WHERE role_id = ?`, [role.id], (err, teamRow) => {
            db.all(`SELECT * FROM players WHERE team_id = ?`, [role.id], (err, rows) => {
                if (err) return console.error(err);

                const formation = teamRow ? teamRow.formation : '4-3-3';
                const tactic = teamRow ? teamRow.tactic : 'Dengeli';

                const embed = new EmbedBuilder()
                    .setTitle(`🛡️ ${role.name.toUpperCase()} KADROSU`)
                    .setColor('#2b2d31')
                    .addFields(
                        { name: '📐 Diziliş', value: formation, inline: true },
                        { name: '🧠 Taktik', value: tactic, inline: true }
                    );

                if (!rows || rows.length === 0) {
                    embed.setDescription('Bu takımda kayıtlı oyuncu bulunamadı.');
                } else {
                    let totalVal = rows.reduce((acc, p) => acc + p.value, 0);
                    let kadroMetni = rows.map(p => `<@${p.user_id}> - **Pozisyon:** ${p.position} - **Değer:** ${p.value}M - ⚽ ${p.goals || 0}G / 🅰️ ${p.assists || 0}A`).join('\n');
                    embed.setDescription(`💰 **Kadro Değeri:** ${totalVal}M\n\n` + kadroMetni);
                }

                const btnTactic = new ButtonBuilder()
                    .setCustomId(`tactic_menu_${role.id}`)
                    .setLabel('Taktik')
                    .setStyle(ButtonStyle.Primary)
                    .setEmoji('🧠');

                const btnFormation = new ButtonBuilder()
                    .setCustomId(`formation_menu_${role.id}`)
                    .setLabel('Diziliş')
                    .setStyle(ButtonStyle.Secondary)
                    .setEmoji('📐');

                const btnLineup = new ButtonBuilder()
                    .setCustomId(`lineup_menu_${role.id}`)
                    .setLabel('Kadro (İlk 11)')
                    .setStyle(ButtonStyle.Success)
                    .setEmoji('📋');

                const row = new ActionRowBuilder().addComponents(btnTactic, btnFormation, btnLineup);

                message.channel.send({ embeds: [embed], components: [row] });
            });
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
            if (!row) return message.reply('❌ Antrenman yapabilmek için önce kayıtlı olmalısın!');

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
            if (!row) return message.reply('❌ Penaltı atabilmek için önce kayıtlı olmalısın!');

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
