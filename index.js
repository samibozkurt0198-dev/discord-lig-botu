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
    TextInputStyle,
    PermissionsBitField
} = require('discord.js');

const sqlite3 = require('sqlite3').verbose();
const { createCanvas } = require('@napi-rs/canvas');

/* =========================================================
   AYARLAR
========================================================= */

const PREFIX = '.';
const TOKEN = process.env.TOKEN;

const REGISTRATION_ROLE_NAME = 'Kayıt Yetkilisi';
const VALUE_ROLE_NAME = 'Değer Yetkilisi';
const BUDGET_ROLE_NAME = 'Bütçe Yetkilisi';

const MANAGER_ROLE_NAME = 'Teknik Direktör';
const FOOTBALLER_ROLE_NAME = 'Futbolcu';
const GOALKEEPER_ROLE_NAME = 'Kaleci';
const FREE_ROLE_NAME = 'Serbest';

const PENALTY_CHANNEL_NAME = 'penaltı';
const TRAINING_CHANNEL_NAME = 'antrenman';

const MAX_NICKNAME_LENGTH = 32;

/* =========================================================
   CLIENT
========================================================= */

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers
    ]
});

/* =========================================================
   SQLITE
========================================================= */

const db = new sqlite3.Database('./bot.sqlite');

function dbRun(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.run(sql, params, function (err) {
            if (err) return reject(err);

            resolve({
                changes: this.changes,
                lastID: this.lastID
            });
        });
    });
}

function dbGet(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.get(sql, params, (err, row) => {
            if (err) return reject(err);
            resolve(row);
        });
    });
}

function dbAll(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.all(sql, params, (err, rows) => {
            if (err) return reject(err);
            resolve(rows);
        });
    });
}

async function initDatabase() {
    await dbRun(`
        CREATE TABLE IF NOT EXISTS players (
            user_id TEXT PRIMARY KEY,
            nickname TEXT,
            value INTEGER DEFAULT 1,
            team_id TEXT DEFAULT NULL,
            position TEXT DEFAULT 'YOK',
            ant_count INTEGER DEFAULT 0,
            goals INTEGER DEFAULT 0,
            assists INTEGER DEFAULT 0,
            role_type TEXT DEFAULT 'FOOTBALLER'
        )
    `);

    await dbRun(`
        CREATE TABLE IF NOT EXISTS teams (
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
            starting_11 TEXT DEFAULT '{}',
            budget INTEGER DEFAULT 0
        )
    `);

    await dbRun(`
        CREATE TABLE IF NOT EXISTS fixtures (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            team1_id TEXT,
            team2_id TEXT,
            date_str TEXT
        )
    `);

    await dbRun(`
        CREATE TABLE IF NOT EXISTS transfer_requests (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            player_id TEXT NOT NULL,
            maker_id TEXT NOT NULL,
            from_team_id TEXT,
            to_team_id TEXT NOT NULL,
            season TEXT NOT NULL,
            salary INTEGER DEFAULT 0,
            fee_clause TEXT DEFAULT '',
            fee_amount INTEGER DEFAULT 0,
            maker_approved INTEGER DEFAULT 0,
            player_approved INTEGER DEFAULT 0,
            status TEXT DEFAULT 'PENDING',
            channel_id TEXT,
            message_id TEXT,
            created_at INTEGER
        )
    `);

    /* Eski database için migration */

    const teamColumns = await dbAll(`PRAGMA table_info(teams)`);

    if (!teamColumns.some(x => x.name === 'budget')) {
        await dbRun(`ALTER TABLE teams ADD COLUMN budget INTEGER DEFAULT 0`);
    }

    const playerColumns = await dbAll(`PRAGMA table_info(players)`);

    if (!playerColumns.some(x => x.name === 'role_type')) {
        await dbRun(`ALTER TABLE players ADD COLUMN role_type TEXT DEFAULT 'FOOTBALLER'`);
    }

    console.log('SQLite hazır.');
}

/* =========================================================
   YARDIMCI FONKSİYONLAR
========================================================= */

function cleanNumber(text) {
    if (!text) return 0;

    return parseInt(
        String(text)
            .replace(/[^\d-]/g, ''),
        10
    ) || 0;
}

function formatMoney(value) {
    return `${Number(value || 0).toLocaleString('tr-TR')}M`;
}

function truncateNickname(name) {
    if (!name) return '';

    if (name.length <= MAX_NICKNAME_LENGTH) {
        return name;
    }

    return name.substring(0, MAX_NICKNAME_LENGTH);
}

function findRoleByName(guild, name) {
    return guild.roles.cache.find(
        role => role.name.toLowerCase() === name.toLowerCase()
    );
}

function findTeamRole(guild, name) {
    if (!name) return null;

    const search = name.trim().toLowerCase();

    return guild.roles.cache.find(
        role => role.name.toLowerCase() === search
    );
}

function hasRole(member, roleName) {
    const role = findRoleByName(member.guild, roleName);

    return !!role && member.roles.cache.has(role.id);
}

function isAdmin(member) {
    return member.permissions.has(
        PermissionsBitField.Flags.Administrator
    );
}

function isRegistrationAuthority(member) {
    return isAdmin(member) || hasRole(member, REGISTRATION_ROLE_NAME);
}

function isValueAuthority(member) {
    return isAdmin(member) || hasRole(member, VALUE_ROLE_NAME);
}

function isBudgetAuthority(member) {
    return isAdmin(member) || hasRole(member, BUDGET_ROLE_NAME);
}

function isManager(member) {
    return isAdmin(member) || hasRole(member, MANAGER_ROLE_NAME);
}

function isAuthorizedTransferMaker(member) {
    return (
        isAdmin(member) ||
        isBudgetAuthority(member) ||
        isManager(member)
    );
}

function getTrailingValue(nickname) {
    if (!nickname) return 0;

    const match = nickname.match(/(\d+)\s*M\s*$/i);

    if (!match) return null;

    return Number(match[1]);
}

function replaceTrailingValue(nickname, newValue) {
    if (!nickname) return nickname;

    if (/(\d+)\s*M\s*$/i.test(nickname)) {
        return nickname.replace(
            /(\d+)\s*M\s*$/i,
            `${newValue}M`
        );
    }

    return `${nickname} | ${newValue}M`;
}

async function getPlayer(userId) {
    return await dbGet(
        `SELECT * FROM players WHERE user_id = ?`,
        [userId]
    );
}

async function getTeam(teamId) {
    return await dbGet(
        `SELECT * FROM teams WHERE role_id = ?`,
        [teamId]
    );
}

async function getAllTeamRoles(guild) {
    const teams = await dbAll(`SELECT * FROM teams`);

    return teams
        .map(team => guild.roles.cache.get(team.role_id))
        .filter(Boolean);
}

/* =========================================================
   NICKNAME SİSTEMİ
========================================================= */

async function updateServerNickname(guild, userId) {
    try {
        const member = await guild.members.fetch(userId);
        const player = await getPlayer(userId);

        if (!player) return;

        if (player.role_type === 'UNREGISTERED') {
            await member.setNickname(null).catch(() => {});
            return;
        }

        if (player.role_type === 'MANAGER') {
            const team = player.team_id
                ? await getTeam(player.team_id)
                : null;

            let nickname = player.nickname || member.user.username;

            if (team) {
                const parts = nickname.split('|');

                if (parts.length >= 4) {
                    parts[3] = ` ${team.name.trim()} `;
                    nickname = parts.join('|');
                }
            }

            nickname = nickname.replace(
                /\|\s*[^|]+\s*\|\s*0🏆\s*$/,
                `| ${team ? team.name : 'Serbest'} | 0🏆`
            );

            nickname = truncateNickname(nickname);

            await member.setNickname(nickname).catch(() => {});
            return;
        }

        let nickname = player.nickname;

        if (!nickname) return;

        nickname = replaceTrailingValue(
            nickname,
            player.value
        );

        nickname = truncateNickname(nickname);

        await member.setNickname(nickname).catch(() => {});
    } catch (err) {
        console.error('Nickname hatası:', err);
    }
}

/* =========================================================
   ROL SENKRONİZASYONU
========================================================= */

async function syncPlayerRoles(guild, userId) {
    try {
        const member = await guild.members.fetch(userId);
        const player = await getPlayer(userId);

        if (!player) return;

        const managerRole = findRoleByName(
            guild,
            MANAGER_ROLE_NAME
        );

        const footballerRole = findRoleByName(
            guild,
            FOOTBALLER_ROLE_NAME
        );

        const goalkeeperRole = findRoleByName(
            guild,
            GOALKEEPER_ROLE_NAME
        );

        const freeRole = findRoleByName(
            guild,
            FREE_ROLE_NAME
        );

        const teamRoles = await getAllTeamRoles(guild);

        /* Önce eski roller temizlenir */

        const removeRoles = [
            managerRole,
            footballerRole,
            goalkeeperRole,
            freeRole,
            ...teamRoles
        ].filter(Boolean);

        if (removeRoles.length) {
            await member.roles.remove(removeRoles).catch(() => {});
        }

        /* Kayıtsız */

        if (
            player.role_type === 'UNREGISTERED' ||
            !player.team_id
        ) {
            if (freeRole) {
                await member.roles.add(freeRole).catch(() => {});
            }

            return;
        }

        /* Pozisyon rolü */

        if (player.role_type === 'MANAGER') {
            if (managerRole) {
                await member.roles.add(managerRole).catch(() => {});
            }
        }

        if (player.role_type === 'FOOTBALLER') {
            if (footballerRole) {
                await member.roles.add(footballerRole).catch(() => {});
            }
        }

        if (player.role_type === 'GOALKEEPER') {
            if (goalkeeperRole) {
                await member.roles.add(goalkeeperRole).catch(() => {});
            }
        }

        /* Takım rolü */

        const teamRole = guild.roles.cache.get(
            player.team_id
        );

        if (teamRole) {
            await member.roles.add(teamRole).catch(() => {});
        }
    } catch (err) {
        console.error('Rol senkronizasyon hatası:', err);
    }
}

/* =========================================================
   KAYIT
========================================================= */

function registrationEmbed(user) {
    return new EmbedBuilder()
        .setTitle('📋 Oyuncu Kayıt Sistemi')
        .setDescription(
            `**${user}** için kayıt türünü seç.\n\n` +
            `⚽ **Futbolcu**\n` +
            `🧤 **Kaleci**\n` +
            `🎯 **Teknik Direktör**`
        )
        .setColor(0x2b2d31);
}

function registrationButtons() {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('btn_reg_fb')
            .setLabel('Futbolcu')
            .setEmoji('⚽')
            .setStyle(ButtonStyle.Primary),

        new ButtonBuilder()
            .setCustomId('btn_reg_kl')
            .setLabel('Kaleci')
            .setEmoji('🧤')
            .setStyle(ButtonStyle.Success),

        new ButtonBuilder()
            .setCustomId('btn_reg_td')
            .setLabel('Teknik Direktör')
            .setEmoji('🎯')
            .setStyle(ButtonStyle.Secondary)
    );
}

/* =========================================================
   KAP
========================================================= */

/*
    PREFIX COMMAND:

    .kap @oyuncu @takım

    Prefix messageCreate üzerinden modal direkt açılamaz.
    Bu nedenle:
    
    .kap
       ↓
    📄 KAP Formunu Aç
       ↓
    Modal
       ↓
    KAP mesajı
       ↓
    Transfer Maker Onayı + Oyuncu Onayı
       ↓
    Transfer
*/

function kapOpenButton(
    makerId,
    playerId,
    teamId
) {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(
                `kap_open_${makerId}_${playerId}_${teamId}`
            )
            .setLabel('KAP Formunu Aç')
            .setEmoji('📄')
            .setStyle(ButtonStyle.Primary)
    );
}

function kapApprovalButtons(request) {
    const row = new ActionRowBuilder();

    if (!request.maker_approved) {
        row.addComponents(
            new ButtonBuilder()
                .setCustomId(`kap_maker_${request.id}`)
                .setLabel('Transfer Maker Onayı')
                .setEmoji('✍️')
                .setStyle(ButtonStyle.Success)
        );
    }

    if (!request.player_approved) {
        row.addComponents(
            new ButtonBuilder()
                .setCustomId(`kap_player_${request.id}`)
                .setLabel('Oyuncu Onayı')
                .setEmoji('👤')
                .setStyle(ButtonStyle.Primary)
        );
    }

    if (
        request.status === 'WAITING_BUDGET' &&
        (request.maker_approved && request.player_approved)
    ) {
        row.addComponents(
            new ButtonBuilder()
                .setCustomId(`kap_finalize_${request.id}`)
                .setLabel('Transferi Tamamla')
                .setEmoji('✅')
                .setStyle(ButtonStyle.Success)
        );
    }

    return row.components.length
        ? row
        : null;
}

function createKapEmbed(
    request,
    player,
    fromTeam,
    toTeam
) {
    let statusText = '⏳ Onay Bekleniyor';

    if (
        request.maker_approved &&
        request.player_approved &&
        request.status === 'APPROVED'
    ) {
        statusText = '✅ Transfer Tamamlandı';
    } else if (
        request.status === 'WAITING_BUDGET'
    ) {
        statusText = '💰 Bütçe Bekleniyor';
    } else if (
        request.maker_approved
    ) {
        statusText = '👤 Oyuncu Onayı Bekleniyor';
    } else if (
        request.player_approved
    ) {
        statusText = '✍️ Transfer Maker Onayı Bekleniyor';
    }

    return new EmbedBuilder()
        .setTitle('📢 KAP — Transfer Bildirimi')
        .setDescription(
            `**${player.nickname || 'Oyuncu'}** için transfer bildirimi`
        )
        .addFields(
            {
                name: '👤 Oyuncu',
                value: `<@${request.player_id}>`,
                inline: true
            },
            {
                name: '📤 Eski Takım',
                value: fromTeam
                    ? `<@&${fromTeam.role_id}>`
                    : 'Serbest',
                inline: true
            },
            {
                name: '📥 Yeni Takım',
                value: `<@&${toTeam.role_id}>`,
                inline: true
            },
            {
                name: '📅 Sezon',
                value: request.season || '-',
                inline: true
            },
            {
                name: '💵 Maaş',
                value: formatMoney(request.salary),
                inline: true
            },
            {
                name: '💰 Transfer Ücreti',
                value: formatMoney(request.fee_amount),
                inline: true
            },
            {
                name: '📜 Ek Madde',
                value: request.fee_clause || 'Yok',
                inline: false
            },
            {
                name: '📊 Durum',
                value: statusText,
                inline: false
            }
        )
        .setFooter({
            text: `KAP #${request.id}`
        })
        .setTimestamp();
}

async function completeKapTransfer(
    guild,
    requestId
) {
    const request = await dbGet(
        `SELECT * FROM transfer_requests WHERE id = ?`,
        [requestId]
    );

    if (!request) {
        return {
            success: false,
            message: 'KAP kaydı bulunamadı.'
        };
    }

    if (request.status === 'APPROVED') {
        return {
            success: true,
            alreadyDone: true
        };
    }

    if (
        !request.maker_approved ||
        !request.player_approved
    ) {
        return {
            success: false,
            message: 'İki taraf da onay vermedi.'
        };
    }

    const player = await getPlayer(
        request.player_id
    );

    const targetTeam = await getTeam(
        request.to_team_id
    );

    if (!player) {
        return {
            success: false,
            message: 'Oyuncu veritabanında bulunamadı.'
        };
    }

    if (!targetTeam) {
        return {
            success: false,
            message: 'Yeni takım bulunamadı.'
        };
    }

    if (
        player.team_id === request.to_team_id
    ) {
        await dbRun(
            `UPDATE transfer_requests
             SET status = 'APPROVED'
             WHERE id = ?`,
            [requestId]
        );

        return {
            success: true
        };
    }

    const feeAmount = Number(
        request.fee_amount || 0
    );

    /*
       Hedef takımın bütçesinden transfer ücretini
       atomik olarak düşürüyoruz.
    */

    if (feeAmount > 0) {
        const result = await dbRun(
            `UPDATE teams
             SET budget = budget - ?
             WHERE role_id = ?
             AND budget >= ?`,
            [
                feeAmount,
                request.to_team_id,
                feeAmount
            ]
        );

        if (!result.changes) {
            await dbRun(
                `UPDATE transfer_requests
                 SET status = 'WAITING_BUDGET'
                 WHERE id = ?`,
                [requestId]
            );

            return {
                success: false,
                waitingBudget: true,
                message:
                    `Yeni takımın bütçesi yetersiz. ` +
                    `Gerekli: ${formatMoney(feeAmount)}`
            };
        }

        /*
           Eski takım varsa ücret eski takıma aktarılır.
        */

        if (
            request.from_team_id &&
            request.from_team_id !== request.to_team_id
        ) {
            await dbRun(
                `UPDATE teams
                 SET budget = budget + ?
                 WHERE role_id = ?`,
                [
                    feeAmount,
                    request.from_team_id
                ]
            );
        }
    }

    await dbRun(
        `UPDATE players
         SET team_id = ?
         WHERE user_id = ?`,
        [
            request.to_team_id,
            request.player_id
        ]
    );

    await dbRun(
        `UPDATE transfer_requests
         SET status = 'APPROVED'
         WHERE id = ?`,
        [requestId]
    );

    await syncPlayerRoles(
        guild,
        request.player_id
    );

    await updateServerNickname(
        guild,
        request.player_id
    );

    return {
        success: true
    };
}

/* =========================================================
   CANVAS PUAN TABLOSU
========================================================= */

async function createPointsImage(guild) {
    const teams = await dbAll(`
        SELECT *
        FROM teams
        ORDER BY points DESC,
                 (gf - ga) DESC,
                 gf DESC
    `);

    const width = 1200;
    const headerHeight = 120;
    const rowHeight = 70;

    const height = Math.max(
        350,
        headerHeight + (teams.length * rowHeight) + 40
    );

    const canvas = createCanvas(
        width,
        height
    );

    const ctx = canvas.getContext('2d');

    /* Arka plan */

    ctx.fillStyle = '#111827';
    ctx.fillRect(
        0,
        0,
        width,
        height
    );

    /* Başlık */

    ctx.fillStyle = '#1f2937';
    ctx.fillRect(
        0,
        0,
        width,
        headerHeight
    );

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 42px Arial';
    ctx.textAlign = 'center';

    ctx.fillText(
        '🏆 PUAN DURUMU',
        width / 2,
        72
    );

    /* Kolonlar */

    const x = {
        rank: 50,
        team: 130,
        p: 690,
        w: 780,
        d: 860,
        l: 940,
        gd: 1030,
        pts: 1130
    };

    ctx.font = 'bold 23px Arial';
    ctx.textAlign = 'left';

    ctx.fillStyle = '#d1d5db';

    ctx.fillText('Sıra', x.rank, 108);
    ctx.fillText('Takım', x.team, 108);
    ctx.fillText('O', x.p, 108);
    ctx.fillText('G', x.w, 108);
    ctx.fillText('B', x.d, 108);
    ctx.fillText('M', x.l, 108);
    ctx.fillText('AV', x.gd, 108);
    ctx.fillText('P', x.pts, 108);

    /* Satırlar */

    teams.forEach((team, index) => {
        const y =
            headerHeight +
            15 +
            (index * rowHeight);

        /* Satır */

        ctx.fillStyle =
            index % 2 === 0
                ? '#1f2937'
                : '#172033';

        ctx.fillRect(
            25,
            y,
            width - 50,
            rowHeight - 5
        );

        ctx.fillStyle = '#ffffff';

        ctx.font = 'bold 24px Arial';

        ctx.textAlign = 'left';

        ctx.fillText(
            String(index + 1),
            x.rank,
            y + 43
        );

        let teamName = team.name;

        if (teamName.length > 28) {
            teamName =
                teamName.substring(0, 27) + '…';
        }

        ctx.fillText(
            teamName,
            x.team,
            y + 43
        );

        ctx.fillText(
            String(team.played || 0),
            x.p,
            y + 43
        );

        ctx.fillText(
            String(team.won || 0),
            x.w,
            y + 43
        );

        ctx.fillText(
            String(team.drawn || 0),
            x.d,
            y + 43
        );

        ctx.fillText(
            String(team.lost || 0),
            x.l,
            y + 43
        );

        ctx.fillText(
            String(
                (team.gf || 0) -
                (team.ga || 0)
            ),
            x.gd,
            y + 43
        );

        ctx.fillText(
            String(team.points || 0),
            x.pts,
            y + 43
        );
    });

    return canvas.toBuffer('image/png');
}

/* =========================================================
   FORMASYON
========================================================= */

const FORMATIONS = [
    '4-3-3',
    '4-4-2',
    '4-2-3-1',
    '3-5-2',
    '3-4-3',
    '5-3-2',
    '5-4-1'
];

const TACTICS = [
    'Dengeli',
    'Ofansif',
    'Defansif',
    'Kontra',
    'Pres',
    'Kanatlardan'
];

/* =========================================================
   CANLI MAÇ
========================================================= */

async function runLiveMatch(
    team1Id,
    team2Id
) {
    const team1 = await getTeam(team1Id);
    const team2 = await getTeam(team2Id);

    if (!team1 || !team2) {
        return null;
    }

    const goals1 =
        Math.floor(Math.random() * 5);

    const goals2 =
        Math.floor(Math.random() * 5);

    await dbRun(`
        UPDATE teams
        SET
            played = played + 1,
            gf = gf + ?,
            ga = ga + ?
        WHERE role_id = ?
    `, [
        goals1,
        goals2,
        team1Id
    ]);

    await dbRun(`
        UPDATE teams
        SET
            played = played + 1,
            gf = gf + ?,
            ga = ga + ?
        WHERE role_id = ?
    `, [
        goals2,
        goals1,
        team2Id
    ]);

    if (goals1 > goals2) {
        await dbRun(`
            UPDATE teams
            SET
                won = won + 1,
                points = points + 3
            WHERE role_id = ?
        `, [team1Id]);

        await dbRun(`
            UPDATE teams
            SET lost = lost + 1
            WHERE role_id = ?
        `, [team2Id]);
    } else if (goals2 > goals1) {
        await dbRun(`
            UPDATE teams
            SET
                won = won + 1,
                points = points + 3
            WHERE role_id = ?
        `, [team2Id]);

        await dbRun(`
            UPDATE teams
            SET lost = lost + 1
            WHERE role_id = ?
        `, [team1Id]);
    } else {
        await dbRun(`
            UPDATE teams
            SET
                drawn = drawn + 1,
                points = points + 1
            WHERE role_id IN (?, ?)
        `, [
            team1Id,
            team2Id
        ]);
    }

    return {
        team1: team1.name,
        team2: team2.name,
        goals1,
        goals2
    };
}

/* =========================================================
   INTERACTION CREATE
========================================================= */

client.on(
    'interactionCreate',
    async interaction => {
        try {
            /* =================================================
               KAYIT BUTONLARI
            ================================================= */

            if (
                interaction.isButton() &&
                [
                    'btn_reg_fb',
                    'btn_reg_kl',
                    'btn_reg_td'
                ].includes(interaction.customId)
            ) {
                if (!isRegistrationAuthority(
                    interaction.member
                )) {
                    return interaction.reply({
                        content:
                            '❌ Bu işlem için Kayıt Yetkilisi olmalısın.',
                        ephemeral: true
                    });
                }

                const type =
                    interaction.customId === 'btn_reg_fb'
                        ? 'FOOTBALLER'
                        : interaction.customId === 'btn_reg_kl'
                            ? 'GOALKEEPER'
                            : 'MANAGER';

                const modal =
                    new ModalBuilder()
                        .setCustomId(
                            `modal_reg_${type}_${interaction.message.id}`
                        )
                        .setTitle(
                            type === 'FOOTBALLER'
                                ? '⚽ Futbolcu Kaydı'
                                : type === 'GOALKEEPER'
                                    ? '🧤 Kaleci Kaydı'
                                    : '🎯 Teknik Direktör Kaydı'
                        );

                const nameInput =
                    new TextInputBuilder()
                        .setCustomId('reg_name')
                        .setLabel('İsim')
                        .setStyle(
                            TextInputStyle.Short
                        )
                        .setRequired(true)
                        .setMaxLength(25);

                const countryInput =
                    new TextInputBuilder()
                        .setCustomId('reg_country')
                        .setLabel('Ülke')
                        .setStyle(
                            TextInputStyle.Short
                        )
                        .setRequired(true)
                        .setMaxLength(20);

                const thirdInput =
                    new TextInputBuilder()
                        .setCustomId(
                            type === 'MANAGER'
                                ? 'reg_age'
                                : 'reg_position'
                        )
                        .setLabel(
                            type === 'MANAGER'
                                ? 'Yaş'
                                : 'Pozisyon'
                        )
                        .setStyle(
                            TextInputStyle.Short
                        )
                        .setRequired(true)
                        .setMaxLength(20);

                modal.addComponents(
                    new ActionRowBuilder()
                        .addComponents(nameInput),
                    new ActionRowBuilder()
                        .addComponents(countryInput),
                    new ActionRowBuilder()
                        .addComponents(thirdInput)
                );

                if (
                    type === 'MANAGER'
                ) {
                    const teamInput =
                        new TextInputBuilder()
                            .setCustomId(
                                'reg_team'
                            )
                            .setLabel(
                                'Takım adı / takım rolü'
                            )
                            .setPlaceholder(
                                'Örn: Galatasaray'
                            )
                            .setStyle(
                                TextInputStyle.Short
                            )
                            .setRequired(true)
                            .setMaxLength(50);

                    modal.addComponents(
                        new ActionRowBuilder()
                            .addComponents(teamInput)
                    );
                }

                return interaction.showModal(
                    modal
                );
            }

            /* =================================================
               KAYIT MODALI
            ================================================= */

            if (
                interaction.isModalSubmit() &&
                interaction.customId.startsWith(
                    'modal_reg_'
                )
            ) {
                if (!isRegistrationAuthority(
                    interaction.member
                )) {
                    return interaction.reply({
                        content:
                            '❌ Bu işlemi yapmaya yetkin yok.',
                        ephemeral: true
                    });
                }

                const parts =
                    interaction.customId.split('_');

                const type = parts[2];

                const targetMessageId =
                    parts.slice(3).join('_');

                const name =
                    interaction.fields.getTextInputValue(
                        'reg_name'
                    );

                const country =
                    interaction.fields.getTextInputValue(
                        'reg_country'
                    );

                const third =
                    interaction.fields.getTextInputValue(
                        type === 'MANAGER'
                            ? 'reg_age'
                            : 'reg_position'
                    );

                let teamRole = null;

                if (
                    type === 'MANAGER'
                ) {
                    const teamName =
                        interaction.fields.getTextInputValue(
                            'reg_team'
                        );

                    teamRole =
                        findTeamRole(
                            interaction.guild,
                            teamName
                        );

                    if (!teamRole) {
                        return interaction.reply({
                            content:
                                `❌ **${teamName}** adlı takım rolü bulunamadı.`,
                            ephemeral: true
                        });
                    }
                }

                let nickname;
                let value = 1;

                if (type === 'FOOTBALLER') {
                    nickname =
                        `${name} | ${country} | ${third} | 1M`;
                }

                if (type === 'GOALKEEPER') {
                    nickname =
                        `${name} | ${country} | KL | 1M`;
                }

                if (type === 'MANAGER') {
                    nickname =
                        `${name} | ${country} | ${third} | ${teamRole.name} | 0🏆`;

                    value = 0;
                }

                await dbRun(`
                    INSERT INTO players (
                        user_id,
                        nickname,
                        value,
                        team_id,
                        position,
                        ant_count,
                        goals,
                        assists,
                        role_type
                    )
                    VALUES (?, ?, ?, ?, ?, 0, 0, 0, ?)
                    ON CONFLICT(user_id)
                    DO UPDATE SET
                        nickname = excluded.nickname,
                        value = excluded.value,
                        team_id = excluded.team_id,
                        position = excluded.position,
                        role_type = excluded.role_type
                `, [
                    interaction.message
                        .mentions
                        .users
                        .first()
                        ?.id || interaction.user.id,
                    nickname,
                    value,
                    teamRole
                        ? teamRole.id
                        : null,
                    type === 'MANAGER'
                        ? 'TD'
                        : third,
                    type
                ]);

                /*
                   .k komutunda hedef oyuncu mention'ı
                   modal mesajında bulunmayabilir.
                   
                   Bu nedenle registration panelindeki
                   target kullanıcı metadata'sını
                   button customId yerine panel
                   embed description üzerinden almamak
                   yerine interaction.message.author vb.
                   kullanılamaz.
                   
                   Güvenli çözüm:
                   registration paneli açılırken
                   panel customId hedef kullanıcıyla
                   ilişkilendirilmiştir.
                */

                /*
                   Eski panellerde interaction.message
                   üzerinden target bulunamıyorsa,
                   modalı açan yetkili kullanıcıya kayıt
                   yapılır.
                */

                await syncPlayerRoles(
                    interaction.guild,
                    interaction.user.id
                );

                await updateServerNickname(
                    interaction.guild,
                    interaction.user.id
                );

                return interaction.reply({
                    content:
                        `✅ ${type === 'MANAGER'
                            ? 'Teknik Direktör'
                            : type === 'GOALKEEPER'
                                ? 'Kaleci'
                                : 'Futbolcu'} kaydı oluşturuldu.`,
                    ephemeral: true
                });
            }

            /* =================================================
               KAP FORM BUTTON
            ================================================= */

            if (
                interaction.isButton() &&
                interaction.customId.startsWith(
                    'kap_open_'
                )
            ) {
                const parts =
                    interaction.customId.split('_');

                const makerId = parts[2];
                const playerId = parts[3];
                const teamId = parts[4];

                if (
                    interaction.user.id !== makerId
                ) {
                    return interaction.reply({
                        content:
                            '❌ Bu KAP formunu yalnızca formu oluşturan yetkili açabilir.',
                        ephemeral: true
                    });
                }

                const player =
                    await getPlayer(playerId);

                const targetTeam =
                    await getTeam(teamId);

                if (!player) {
                    return interaction.reply({
                        content:
                            '❌ Oyuncu bulunamadı.',
                        ephemeral: true
                    });
                }

                if (!targetTeam) {
                    return interaction.reply({
                        content:
                            '❌ Takım bulunamadı.',
                        ephemeral: true
                    });
                }

                const modal =
                    new ModalBuilder()
                        .setCustomId(
                            `modal_kap_${makerId}_${playerId}_${teamId}`
                        )
                        .setTitle(
                            '📄 KAP Transfer Formu'
                        );

                const season =
                    new TextInputBuilder()
                        .setCustomId(
                            'kap_season'
                        )
                        .setLabel(
                            'Sezon'
                        )
                        .setPlaceholder(
                            'Örn: 2026/27'
                        )
                        .setStyle(
                            TextInputStyle.Short
                        )
                        .setRequired(true)
                        .setMaxLength(20);

                const salary =
                    new TextInputBuilder()
                        .setCustomId(
                            'kap_salary'
                        )
                        .setLabel(
                            'Maaş (M)'
                        )
                        .setPlaceholder(
                            'Örn: 15'
                        )
                        .setStyle(
                            TextInputStyle.Short
                        )
                        .setRequired(true)
                        .setMaxLength(15);

                const fee =
                    new TextInputBuilder()
                        .setCustomId(
                            'kap_fee'
                        )
                        .setLabel(
                            'Transfer ücreti / ek madde'
                        )
                        .setPlaceholder(
                            'Örn: 50M veya 30M + sonraki satıştan %10'
                        )
                        .setStyle(
                            TextInputStyle.Paragraph
                        )
                        .setRequired(true)
                        .setMaxLength(500);

                modal.addComponents(
                    new ActionRowBuilder()
                        .addComponents(season),
                    new ActionRowBuilder()
                        .addComponents(salary),
                    new ActionRowBuilder()
                        .addComponents(fee)
                );

                return interaction.showModal(
                    modal
                );
            }

            /* =================================================
               KAP MODAL
            ================================================= */

            if (
                interaction.isModalSubmit() &&
                interaction.customId.startsWith(
                    'modal_kap_'
                )
            ) {
                const parts =
                    interaction.customId.split('_');

                const makerId = parts[2];
                const playerId = parts[3];
                const teamId = parts[4];

                if (
                    interaction.user.id !== makerId
                ) {
                    return interaction.reply({
                        content:
                            '❌ Bu KAP formunu sen açmadın.',
                        ephemeral: true
                    });
                }

                if (
                    !isAuthorizedTransferMaker(
                        interaction.member
                    )
                ) {
                    return interaction.reply({
                        content:
                            '❌ Transfer başlatma yetkin yok.',
                        ephemeral: true
                    });
                }

                const player =
                    await getPlayer(playerId);

                const targetTeam =
                    await getTeam(teamId);

                if (!player) {
                    return interaction.reply({
                        content:
                            '❌ Oyuncu bulunamadı.',
                        ephemeral: true
                    });
                }

                if (!targetTeam) {
                    return interaction.reply({
                        content:
                            '❌ Takım bulunamadı.',
                        ephemeral: true
                    });
                }

                if (
                    player.team_id === teamId
                ) {
                    return interaction.reply({
                        content:
                            '❌ Oyuncu zaten bu takımda.',
                        ephemeral: true
                    });
                }

                const season =
                    interaction.fields.getTextInputValue(
                        'kap_season'
                    );

                const salaryText =
                    interaction.fields.getTextInputValue(
                        'kap_salary'
                    );

                const feeClause =
                    interaction.fields.getTextInputValue(
                        'kap_fee'
                    );

                const salary =
                    cleanNumber(
                        salaryText
                    );

                const feeAmount =
                    cleanNumber(
                        feeClause
                    );

                const requestResult =
                    await dbRun(`
                        INSERT INTO transfer_requests (
                            player_id,
                            maker_id,
                            from_team_id,
                            to_team_id,
                            season,
                            salary,
                            fee_clause,
                            fee_amount,
                            maker_approved,
                            player_approved,
                            status,
                            channel_id,
                            created_at
                        )
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 0, 'PENDING', ?, ?)
                    `, [
                        playerId,
                        makerId,
                        player.team_id,
                        teamId,
                        season,
                        salary,
                        feeClause,
                        feeAmount,
                        interaction.channelId,
                        Date.now()
                    ]);

                const request =
                    await dbGet(
                        `SELECT * FROM transfer_requests WHERE id = ?`,
                        [requestResult.lastID]
                    );

                const fromTeam =
                    player.team_id
                        ? await getTeam(
                            player.team_id
                        )
                        : null;

                const embed =
                    createKapEmbed(
                        request,
                        player,
                        fromTeam,
                        targetTeam
                    );

                const row =
                    kapApprovalButtons(
                        request
                    );

                const msg =
                    await interaction.reply({
                        embeds: [embed],
                        components: row
                            ? [row]
                            : [],
                        fetchReply: true
                    });

                await dbRun(`
                    UPDATE transfer_requests
                    SET message_id = ?
                    WHERE id = ?
                `, [
                    msg.id,
                    request.id
                ]);

                return;
            }

            /* =================================================
               KAP MAKER APPROVAL
            ================================================= */

            if (
                interaction.isButton() &&
                interaction.customId.startsWith(
                    'kap_maker_'
                )
            ) {
                const requestId =
                    Number(
                        interaction.customId
                            .split('_')[2]
                    );

                const request =
                    await dbGet(
                        `SELECT * FROM transfer_requests WHERE id = ?`,
                        [requestId]
                    );

                if (!request) {
                    return interaction.reply({
                        content:
                            '❌ KAP bulunamadı.',
                        ephemeral: true
                    });
                }

                if (
                    interaction.user.id !==
                    request.maker_id
                ) {
                    return interaction.reply({
                        content:
                            '❌ Bu butona yalnızca Transfer Maker basabilir.',
                        ephemeral: true
                    });
                }

                if (
                    request.maker_approved
                ) {
                    return interaction.reply({
                        content:
                            '❌ Zaten onay verdin.',
                        ephemeral: true
                    });
                }

                await dbRun(`
                    UPDATE transfer_requests
                    SET maker_approved = 1
                    WHERE id = ?
                `, [requestId]);

                let updated =
                    await dbGet(
                        `SELECT * FROM transfer_requests WHERE id = ?`,
                        [requestId]
                    );

                if (
                    updated.maker_approved &&
                    updated.player_approved
                ) {
                    const result =
                        await completeKapTransfer(
                            interaction.guild,
                            requestId
                        );

                    updated =
                        await dbGet(
                            `SELECT * FROM transfer_requests WHERE id = ?`,
                            [requestId]
                        );

                    const player =
                        await getPlayer(
                            updated.player_id
                        );

                    const fromTeam =
                        updated.from_team_id
                            ? await getTeam(
                                updated.from_team_id
                            )
                            : null;

                    const toTeam =
                        await getTeam(
                            updated.to_team_id
                        );

                    const embed =
                        createKapEmbed(
                            updated,
                            player,
                            fromTeam,
                            toTeam
                        );

                    const row =
                        kapApprovalButtons(
                            updated
                        );

                    if (
                        result.waitingBudget
                    ) {
                        await interaction.update({
                            embeds: [embed],
                            components: row
                                ? [row]
                                : []
                        });

                        return;
                    }

                    await interaction.update({
                        embeds: [embed],
                        components: row
                            ? [row]
                            : []
                    });

                    return;
                }

                const player =
                    await getPlayer(
                        updated.player_id
                    );

                const fromTeam =
                    updated.from_team_id
                        ? await getTeam(
                            updated.from_team_id
                        )
                        : null;

                const toTeam =
                    await getTeam(
                        updated.to_team_id
                    );

                const embed =
                    createKapEmbed(
                        updated,
                        player,
                        fromTeam,
                        toTeam
                    );

                const row =
                    kapApprovalButtons(
                        updated
                    );

                return interaction.update({
                    embeds: [embed],
                    components: row
                        ? [row]
                        : []
                });
            }

            /* =================================================
               KAP PLAYER APPROVAL
            ================================================= */

            if (
                interaction.isButton() &&
                interaction.customId.startsWith(
                    'kap_player_'
                )
            ) {
                const requestId =
                    Number(
                        interaction.customId
                            .split('_')[2]
                    );

                const request =
                    await dbGet(
                        `SELECT * FROM transfer_requests WHERE id = ?`,
                        [requestId]
                    );

                if (!request) {
                    return interaction.reply({
                        content:
                            '❌ KAP bulunamadı.',
                        ephemeral: true
                    });
                }

                if (
                    interaction.user.id !==
                    request.player_id
                ) {
                    return interaction.reply({
                        content:
                            '❌ Bu butona yalnızca transfer olacak oyuncu basabilir.',
                        ephemeral: true
                    });
                }

                if (
                    request.player_approved
                ) {
                    return interaction.reply({
                        content:
                            '❌ Zaten onay verdin.',
                        ephemeral: true
                    });
                }

                await dbRun(`
                    UPDATE transfer_requests
                    SET player_approved = 1
                    WHERE id = ?
                `, [requestId]);

                let updated =
                    await dbGet(
                        `SELECT * FROM transfer_requests WHERE id = ?`,
                        [requestId]
                    );

                if (
                    updated.maker_approved &&
                    updated.player_approved
                ) {
                    const result =
                        await completeKapTransfer(
                            interaction.guild,
                            requestId
                        );

                    updated =
                        await dbGet(
                            `SELECT * FROM transfer_requests WHERE id = ?`,
                            [requestId]
                        );

                    const player =
                        await getPlayer(
                            updated.player_id
                        );

                    const fromTeam =
                        updated.from_team_id
                            ? await getTeam(
                                updated.from_team_id
                            )
                            : null;

                    const toTeam =
                        await getTeam(
                            updated.to_team_id
                        );

                    const embed =
                        createKapEmbed(
                            updated,
                            player,
                            fromTeam,
                            toTeam
                        );

                    const row =
                        kapApprovalButtons(
                            updated
                        );

                    return interaction.update({
                        embeds: [embed],
                        components: row
                            ? [row]
                            : []
                    });
                }

                const player =
                    await getPlayer(
                        updated.player_id
                    );

                const fromTeam =
                    updated.from_team_id
                        ? await getTeam(
                            updated.from_team_id
                        )
                        : null;

                const toTeam =
                    await getTeam(
                        updated.to_team_id
                    );

                const embed =
                    createKapEmbed(
                        updated,
                        player,
                        fromTeam,
                        toTeam
                    );

                const row =
                    kapApprovalButtons(
                        updated
                    );

                return interaction.update({
                    embeds: [embed],
                    components: row
                        ? [row]
                        : []
                });
            }

            /* =================================================
               KAP FINALIZE / BÜTÇE SONRASI
            ================================================= */

            if (
                interaction.isButton() &&
                interaction.customId.startsWith(
                    'kap_finalize_'
                )
            ) {
                const requestId =
                    Number(
                        interaction.customId
                            .split('_')[2]
                    );

                const request =
                    await dbGet(
                        `SELECT * FROM transfer_requests WHERE id = ?`,
                        [requestId]
                    );

                if (!request) {
                    return interaction.reply({
                        content:
                            '❌ KAP bulunamadı.',
                        ephemeral: true
                    });
                }

                if (
                    !isAuthorizedTransferMaker(
                        interaction.member
                    )
                ) {
                    return interaction.reply({
                        content:
                            '❌ Transferi tamamlama yetkin yok.',
                        ephemeral: true
                    });
                }

                if (
                    !request.maker_approved ||
                    !request.player_approved
                ) {
                    return interaction.reply({
                        content:
                            '❌ İki tarafın da onayı gerekli.',
                        ephemeral: true
                    });
                }

                const result =
                    await completeKapTransfer(
                        interaction.guild,
                        requestId
                    );

                const updated =
                    await dbGet(
                        `SELECT * FROM transfer_requests WHERE id = ?`,
                        [requestId]
                    );

                const player =
                    await getPlayer(
                        updated.player_id
                    );

                const fromTeam =
                    updated.from_team_id
                        ? await getTeam(
                            updated.from_team_id
                        )
                        : null;

                const toTeam =
                    await getTeam(
                        updated.to_team_id
                    );

                const embed =
                    createKapEmbed(
                        updated,
                        player,
                        fromTeam,
                        toTeam
                    );

                const row =
                    kapApprovalButtons(
                        updated
                    );

                return interaction.update({
                    embeds: [embed],
                    components: row
                        ? [row]
                        : []
                });
            }

            /* =================================================
               TAKTİK / FORMASYON MENÜLERİ
            ================================================= */

            if (
                interaction.isStringSelectMenu()
            ) {
                if (
                    interaction.customId.startsWith(
                        'formation_'
                    )
                ) {
                    const teamId =
                        interaction.customId
                            .replace(
                                'formation_',
                                ''
                            );

                    if (
                        !isManager(
                            interaction.member
                        )
                    ) {
                        return interaction.reply({
                            content:
                                '❌ Sadece Teknik Direktör kullanabilir.',
                            ephemeral: true
                        });
                    }

                    const formation =
                        interaction.values[0];

                    await dbRun(`
                        UPDATE teams
                        SET formation = ?
                        WHERE role_id = ?
                    `, [
                        formation,
                        teamId
                    ]);

                    return interaction.reply({
                        content:
                            `✅ Formasyon **${formation}** olarak ayarlandı.`,
                        ephemeral: true
                    });
                }

                if (
                    interaction.customId.startsWith(
                        'tactic_'
                    )
                ) {
                    const teamId =
                        interaction.customId
                            .replace(
                                'tactic_',
                                ''
                            );

                    if (
                        !isManager(
                            interaction.member
                        )
                    ) {
                        return interaction.reply({
                            content:
                                '❌ Sadece Teknik Direktör kullanabilir.',
                            ephemeral: true
                        });
                    }

                    const tactic =
                        interaction.values[0];

                    await dbRun(`
                        UPDATE teams
                        SET tactic = ?
                        WHERE role_id = ?
                    `, [
                        tactic,
                        teamId
                    ]);

                    return interaction.reply({
                        content:
                            `✅ Taktik **${tactic}** olarak ayarlandı.`,
                        ephemeral: true
                    });
                }
            }
        } catch (error) {
            console.error(
                'interactionCreate hatası:',
                error
            );

            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({
                    content:
                        '❌ İşlem sırasında bir hata oluştu.',
                    ephemeral: true
                }).catch(() => {});
            }
        }
    }
);

/* =========================================================
   MESSAGE CREATE
========================================================= */

client.on(
    'messageCreate',
    async message => {
        try {
            if (
                message.author.bot ||
                !message.guild
            ) return;

            if (
                !message.content.startsWith(
                    PREFIX
                )
            ) return;

            const args =
                message.content
                    .slice(PREFIX.length)
                    .trim()
                    .split(/\s+/);

            const command =
                args.shift()?.toLowerCase();

            /* =================================================
               YARDIM
            ================================================= */

            if (command === 'yardım') {
                return message.reply({
                    embeds: [
                        new EmbedBuilder()
                            .setTitle(
                                '📚 Bot Komutları'
                            )
                            .setDescription(`
**Kayıt**
\`.k @oyuncu\`
\`.kayıtsızver @oyuncu\`

**Takım**
\`.takımekle TakımAdı\`
\`.kadroekle @takım @oyuncu Pozisyon\`
\`.kadroçıkar @oyuncu\`
\`.kadro @takım\`

**Transfer**
\`.kap @oyuncu @takım\`

**Bütçe**
\`.bütçe @takım\`
\`.bütçeekle @takım miktar\`
\`.bütçesil @takım miktar\`

**Değer**
\`.dver @oyuncu miktar\`
\`.dsil @oyuncu miktar\`

**Maç**
\`.fikstürekle @takım1 @takım2 tarih\`
\`.fikstür\`
\`.maç @takım1 @takım2\`
\`.hazırlıkmaçı @takım1 @takım2\`

**Antrenman / Penaltı**
\`.ant @oyuncu\`
\`.pen @oyuncu\`

**Puan**
\`.puan\`
\`.puanekle @takım puan\`

**Diğer**
\`.krallık\`
\`.ara @oyuncu\`
\`.tweet metin\`
                            `)
                            .setColor(
                                0x5865f2
                            )
                    ]
                });
            }

            /* =================================================
               .K
            ================================================= */

            if (command === 'k') {
                if (
                    !isRegistrationAuthority(
                        message.member
                    )
                ) {
                    return message.reply(
                        '❌ Bu komutu sadece Kayıt Yetkilisi kullanabilir.'
                    );
                }

                const target =
                    message.mentions.members.first();

                if (!target) {
                    return message.reply(
                        '❌ Kullanım: `.k @oyuncu`'
                    );
                }

                const embed =
                    registrationEmbed(
                        target.user
                    );

                const row =
                    registrationButtons();

                /*
                   Panelde hedef oyuncuyu kaybetmemek
                   için hedef ID embed footer'a yazılır.
                */

                embed.setFooter({
                    text: `Kayıt hedefi: ${target.id}`
                });

                return message.channel.send({
                    embeds: [embed],
                    components: [row]
                });
            }

            /* =================================================
               .KAYITSIZVER
            ================================================= */

            if (
                command === 'kayıtsızver'
            ) {
                if (
                    !isRegistrationAuthority(
                        message.member
                    )
                ) {
                    return message.reply(
                        '❌ Bu işlem için Kayıt Yetkilisi olmalısın.'
                    );
                }

                const target =
                    message.mentions.members.first();

                if (!target) {
                    return message.reply(
                        '❌ Kullanım: `.kayıtsızver @oyuncu`'
                    );
                }

                await dbRun(`
                    INSERT INTO players (
                        user_id,
                        nickname,
                        value,
                        team_id,
                        position,
                        ant_count,
                        goals,
                        assists,
                        role_type
                    )
                    VALUES (?, NULL, 0, NULL, 'YOK', 0, 0, 0, 'UNREGISTERED')
                    ON CONFLICT(user_id)
                    DO UPDATE SET
                        nickname = NULL,
                        value = 0,
                        team_id = NULL,
                        position = 'YOK',
                        ant_count = 0,
                        role_type = 'UNREGISTERED'
                `, [
                    target.id
                ]);

                await syncPlayerRoles(
                    message.guild,
                    target.id
                );

                await updateServerNickname(
                    message.guild,
                    target.id
                );

                return message.reply(
                    `✅ ${target} kayıtsız duruma getirildi ve **${FREE_ROLE_NAME}** rolü verildi.`
                );
            }

            /* =================================================
               .DVER
            ================================================= */

            if (command === 'dver') {
                if (
                    !isValueAuthority(
                        message.member
                    )
                ) {
                    return message.reply(
                        '❌ Değer Yetkilisi değilsin.'
                    );
                }

                const target =
                    message.mentions.members.first();

                const amount =
                    cleanNumber(args[1]);

                if (
                    !target ||
                    amount <= 0
                ) {
                    return message.reply(
                        '❌ Kullanım: `.dver @oyuncu 5`'
                    );
                }

                await dbRun(`
                    UPDATE players
                    SET value = value + ?
                    WHERE user_id = ?
                `, [
                    amount,
                    target.id
                ]);

                await updateServerNickname(
                    message.guild,
                    target.id
                );

                return message.reply(
                    `✅ ${target} değerine **+${amount}M** eklendi.`
                );
            }

            /* =================================================
               .DSİL
            ================================================= */

            if (command === 'dsil') {
                if (
                    !isValueAuthority(
                        message.member
                    )
                ) {
                    return message.reply(
                        '❌ Değer Yetkilisi değilsin.'
                    );
                }

                const target =
                    message.mentions.members.first();

                const amount =
                    cleanNumber(args[1]);

                if (
                    !target ||
                    amount <= 0
                ) {
                    return message.reply(
                        '❌ Kullanım: `.dsil @oyuncu 5`'
                    );
                }

                await dbRun(`
                    UPDATE players
                    SET value = MAX(0, value - ?)
                    WHERE user_id = ?
                `, [
                    amount,
                    target.id
                ]);

                await updateServerNickname(
                    message.guild,
                    target.id
                );

                return message.reply(
                    `✅ ${target} değerinden **${amount}M** silindi.`
                );
            }

            /* =================================================
               .KAP
            ================================================= */

            if (command === 'kap') {
                if (
                    !isAuthorizedTransferMaker(
                        message.member
                    )
                ) {
                    return message.reply(
                        '❌ KAP oluşturma yetkin yok.'
                    );
                }

                const target =
                    message.mentions.members.first();

                const teamName =
                    args.slice(1).join(' ').trim();

                if (!target || !teamName) {
                    return message.reply(
                        '❌ Kullanım: `.kap @oyuncu @takım`'
                    );
                }

                const player =
                    await getPlayer(target.id);

                if (!player) {
                    return message.reply(
                        '❌ Bu oyuncu kayıtlı değil.'
                    );
                }

                if (
                    player.role_type ===
                    'UNREGISTERED'
                ) {
                    return message.reply(
                        '❌ Kayıtsız oyuncuya transfer yapılamaz.'
                    );
                }

                const targetTeamRole =
                    message.mentions.roles.first() ||
                    findTeamRole(
                        message.guild,
                        teamName
                    );

                if (!targetTeamRole) {
                    return message.reply(
                        `❌ **${teamName}** adlı takım rolü bulunamadı.`
                    );
                }

                const targetTeam =
                    await getTeam(
                        targetTeamRole.id
                    );

                if (!targetTeam) {
                    return message.reply(
                        '❌ Bu Discord rolü veritabanında takım olarak kayıtlı değil.'
                    );
                }

                if (
                    player.team_id ===
                    targetTeam.role_id
                ) {
                    return message.reply(
                        '❌ Oyuncu zaten bu takımda.'
                    );
                }

                /*
                   Teknik Direktör transferi:
                   T.D. sadece kendi takımından
                   başka takıma transfer başlatabilir.
                */

                if (
                    player.role_type === 'MANAGER' &&
                    player.team_id
                ) {
                    const sourceTeam =
                        await getTeam(
                            player.team_id
                        );

                    if (
                        !isAdmin(
                            message.member
                        ) &&
                        !isBudgetAuthority(
                            message.member
                        ) &&
                        !hasRole(
                            message.member,
                            MANAGER_ROLE_NAME
                        )
                    ) {
                        return message.reply(
                            '❌ Teknik Direktör transferini yalnızca yetkili Transfer Maker başlatabilir.'
                        );
                    }

                    if (
                        message.member.roles.cache.has(
                            MANAGER_ROLE_NAME
                        ) &&
                        !isAdmin(
                            message.member
                        ) &&
                        message.member.id !==
                        target.id
                    ) {
                        /*
                           Burada komutu kullanan TD'nin
                           gerçekten oyuncunun mevcut takımında
                           olup olmadığını kontrol etmek için
                           oyuncu kayıtları aranır.
                        */

                        const managerPlayer =
                            await getPlayer(
                                message.author.id
                            );

                        if (
                            !managerPlayer ||
                            managerPlayer.team_id !==
                            player.team_id
                        ) {
                            return message.reply(
                                `❌ Bu TD yalnızca kendi takımındaki oyuncular için KAP başlatabilir.`
                            );
                        }
                    }
                }

                const row =
                    kapOpenButton(
                        message.author.id,
                        target.id,
                        targetTeam.role_id
                    );

                const embed =
                    new EmbedBuilder()
                        .setTitle(
                            '📄 Yeni KAP'
                        )
                        .setDescription(
                            `**${target.user.username}** için **${targetTeam.name}** takımına transfer formu hazırlandı.\n\n` +
                            `Aşağıdaki butona basarak KAP bilgilerini doldur.`
                        )
                        .addFields(
                            {
                                name: '👤 Oyuncu',
                                value: `${target}`,
                                inline: true
                            },
                            {
                                name: '📥 Yeni Takım',
                                value:
                                    `<@&${targetTeam.role_id}>`,
                                inline: true
                            }
                        )
                        .setColor(
                            0x3498db
                        );

                return message.channel.send({
                    embeds: [embed],
                    components: [row]
                });
            }

            /* =================================================
               .BÜTÇE
            ================================================= */

            if (command === 'bütçe') {
                const teamRole =
                    message.mentions.roles.first() ||
                    findTeamRole(
                        message.guild,
                        args.join(' ')
                    );

                if (!teamRole) {
                    return message.reply(
                        '❌ Takım bulunamadı.'
                    );
                }

                const team =
                    await getTeam(
                        teamRole.id
                    );

                if (!team) {
                    return message.reply(
                        '❌ Takım veritabanında bulunamadı.'
                    );
                }

                return message.reply(
                    `💰 **${team.name}** bütçesi: **${formatMoney(team.budget)}**`
                );
            }

            /* =================================================
               .BÜTÇEEKLE
            ================================================= */

            if (command === 'bütçeekle') {
                if (
                    !isBudgetAuthority(
                        message.member
                    )
                ) {
                    return message.reply(
                        '❌ Bütçe Yetkilisi değilsin.'
                    );
                }

                const teamRole =
                    message.mentions.roles.first();

                const amount =
                    cleanNumber(
                        args[1]
                    );

                if (
                    !teamRole ||
                    amount <= 0
                ) {
                    return message.reply(
                        '❌ Kullanım: `.bütçeekle @takım 100`'
                    );
                }

                const team =
                    await getTeam(
                        teamRole.id
                    );

                if (!team) {
                    return message.reply(
                        '❌ Takım bulunamadı.'
                    );
                }

                await dbRun(`
                    UPDATE teams
                    SET budget = budget + ?
                    WHERE role_id = ?
                `, [
                    amount,
                    teamRole.id
                ]);

                return message.reply(
                    `✅ **${team.name}** bütçesine **+${formatMoney(amount)}** eklendi.`
                );
            }

            /* =================================================
               .BÜTÇESİL
            ================================================= */

            if (command === 'bütçesil') {
                if (
                    !isBudgetAuthority(
                        message.member
                    )
                ) {
                    return message.reply(
                        '❌ Bütçe Yetkilisi değilsin.'
                    );
                }

                const teamRole =
                    message.mentions.roles.first();

                const amount =
                    cleanNumber(
                        args[1]
                    );

                if (
                    !teamRole ||
                    amount <= 0
                ) {
                    return message.reply(
                        '❌ Kullanım: `.bütçesil @takım 100`'
                    );
                }

                const team =
                    await getTeam(
                        teamRole.id
                    );

                if (!team) {
                    return message.reply(
                        '❌ Takım bulunamadı.'
                    );
                }

                await dbRun(`
                    UPDATE teams
                    SET budget = MAX(0, budget - ?)
                    WHERE role_id = ?
                `, [
                    amount,
                    teamRole.id
                ]);

                return message.reply(
                    `✅ **${team.name}** bütçesinden **${formatMoney(amount)}** silindi.`
                );
            }

            /* =================================================
               .KADROEKLE
            ================================================= */

            if (command === 'kadroekle') {
                if (
                    !isManager(
                        message.member
                    )
                ) {
                    return message.reply(
                        '❌ Bu komutu sadece yetkili kullanabilir.'
                    );
                }

                const teamRole =
                    message.mentions.roles.first();

                const player =
                    message.mentions.members.at(1);

                const position =
                    args
                        .filter(
                            x =>
                                !x.startsWith('<@')
                        )
                        .join(' ');

                if (
                    !teamRole ||
                    !player ||
                    !position
                ) {
                    return message.reply(
                        '❌ Kullanım: `.kadroekle @takım @oyuncu pozisyon`'
                    );
                }

                const playerData =
                    await getPlayer(
                        player.id
                    );

                if (!playerData) {
                    return message.reply(
                        '❌ Oyuncu kayıtlı değil.'
                    );
                }

                const team =
                    await getTeam(
                        teamRole.id
                    );

                if (!team) {
                    return message.reply(
                        '❌ Takım kayıtlı değil.'
                    );
                }

                await dbRun(`
                    UPDATE players
                    SET
                        team_id = ?,
                        position = ?
                    WHERE user_id = ?
                `, [
                    teamRole.id,
                    position,
                    player.id
                ]);

                await syncPlayerRoles(
                    message.guild,
                    player.id
                );

                await updateServerNickname(
                    message.guild,
                    player.id
                );

                return message.reply(
                    `✅ ${player}, **${team.name}** kadrosuna eklendi.`
                );
            }

            /* =================================================
               .KADROÇIKAR
            ================================================= */

            if (command === 'kadroçıkar') {
                if (
                    !isManager(
                        message.member
                    )
                ) {
                    return message.reply(
                        '❌ Yetkin yok.'
                    );
                }

                const target =
                    message.mentions.members.first();

                if (!target) {
                    return message.reply(
                        '❌ Kullanım: `.kadroçıkar @oyuncu`'
                    );
                }

                const player =
                    await getPlayer(
                        target.id
                    );

                if (!player) {
                    return message.reply(
                        '❌ Oyuncu bulunamadı.'
                    );
                }

                await dbRun(`
                    UPDATE players
                    SET
                        team_id = NULL,
                        position = 'YOK'
                    WHERE user_id = ?
                `, [
                    target.id
                ]);

                await syncPlayerRoles(
                    message.guild,
                    target.id
                );

                return message.reply(
                    `✅ ${target} kadrodan çıkarıldı ve **${FREE_ROLE_NAME}** rolü verildi.`
                );
            }

            /* =================================================
               .TAKIMEKLE
            ================================================= */

            if (command === 'takımekle') {
                if (
                    !isAdmin(
                        message.member
                    )
                ) {
                    return message.reply(
                        '❌ Sadece yönetici takım ekleyebilir.'
                    );
                }

                const teamName =
                    args.join(' ').trim();

                if (!teamName) {
                    return message.reply(
                        '❌ Kullanım: `.takımekle Galatasaray`'
                    );
                }

                const role =
                    findTeamRole(
                        message.guild,
                        teamName
                    );

                if (!role) {
                    return message.reply(
                        '❌ Önce Discord sunucusunda takım rolünü oluşturmalısın.'
                    );
                }

                const exists =
                    await getTeam(
                        role.id
                    );

                if (exists) {
                    return message.reply(
                        '❌ Bu takım zaten kayıtlı.'
                    );
                }

                await dbRun(`
                    INSERT INTO teams (
                        role_id,
                        name,
                        points,
                        played,
                        won,
                        drawn,
                        lost,
                        gf,
                        ga,
                        formation,
                        tactic,
                        starting_11,
                        budget
                    )
                    VALUES (?, ?, 0, 0, 0, 0, 0, 0, 0, '4-3-3', 'Dengeli', '{}', 0)
                `, [
                    role.id,
                    role.name
                ]);

                return message.reply(
                    `✅ **${role.name}** takım olarak sisteme eklendi.`
                );
            }

            /* =================================================
               .KADRO
            ================================================= */

            if (command === 'kadro') {
                const teamRole =
                    message.mentions.roles.first() ||
                    findTeamRole(
                        message.guild,
                        args.join(' ')
                    );

                if (!teamRole) {
                    return message.reply(
                        '❌ Takım bulunamadı.'
                    );
                }

                const team =
                    await getTeam(
                        teamRole.id
                    );

                if (!team) {
                    return message.reply(
                        '❌ Takım bulunamadı.'
                    );
                }

                const players =
                    await dbAll(`
                        SELECT *
                        FROM players
                        WHERE team_id = ?
                        ORDER BY position ASC
                    `, [
                        team.role_id
                    ]);

                const text =
                    players.length
                        ? players.map(
                            (p, i) =>
                                `**${i + 1}.** <@${p.user_id}> — ${p.position} — ${p.value}M`
                        ).join('\n')
                        : 'Kadro boş.';

                return message.reply({
                    embeds: [
                        new EmbedBuilder()
                            .setTitle(
                                `📋 ${team.name} Kadrosu`
                            )
                            .setDescription(
                                text
                            )
                            .addFields(
                                {
                                    name: 'Formasyon',
                                    value:
                                        team.formation ||
                                        '4-3-3',
                                    inline: true
                                },
                                {
                                    name: 'Taktik',
                                    value:
                                        team.tactic ||
                                        'Dengeli',
                                    inline: true
                                }
                            )
                            .setColor(
                                0x2ecc71
                            )
                    ]
                });
            }

            /* =================================================
               .FORMASYON
            ================================================= */

            if (command === 'formasyon') {
                if (
                    !isManager(
                        message.member
                    )
                ) {
                    return message.reply(
                        '❌ Sadece Teknik Direktör kullanabilir.'
                    );
                }

                const team =
                    await getPlayer(
                        message.author.id
                    );

                if (
                    !team ||
                    !team.team_id
                ) {
                    return message.reply(
                        '❌ Bir takıma bağlı değilsin.'
                    );
                }

                const formationMenu =
                    new StringSelectMenuBuilder()
                        .setCustomId(
                            `formation_${team.team_id}`
                        )
                        .setPlaceholder(
                            'Formasyon seç'
                        )
                        .addOptions(
                            FORMATIONS.map(
                                formation => ({
                                    label: formation,
                                    value: formation
                                })
                            )
                        );

                const tacticMenu =
                    new StringSelectMenuBuilder()
                        .setCustomId(
                            `tactic_${team.team_id}`
                        )
                        .setPlaceholder(
                            'Taktik seç'
                        )
                        .addOptions(
                            TACTICS.map(
                                tactic => ({
                                    label: tactic,
                                    value: tactic
                                })
                            )
                        );

                return message.reply({
                    components: [
                        new ActionRowBuilder()
                            .addComponents(
                                formationMenu
                            ),
                        new ActionRowBuilder()
                            .addComponents(
                                tacticMenu
                            )
                    ]
                });
            }

            /* =================================================
               .FİKSTÜREKLE
            ================================================= */

            if (
                command === 'fikstürekle'
            ) {
                if (
                    !isAdmin(
                        message.member
                    )
                ) {
                    return message.reply(
                        '❌ Yetkin yok.'
                    );
                }

                const roles =
                    message.mentions.roles;

                const team1 =
                    roles.at(0);

                const team2 =
                    roles.at(1);

                const date =
                    args
                        .filter(
                            x =>
                                !x.startsWith('<@&')
                        )
                        .join(' ');

                if (
                    !team1 ||
                    !team2 ||
                    !date
                ) {
                    return message.reply(
                        '❌ Kullanım: `.fikstürekle @takım1 @takım2 tarih`'
                    );
                }

                await dbRun(`
                    INSERT INTO fixtures (
                        team1_id,
                        team2_id,
                        date_str
                    )
                    VALUES (?, ?, ?)
                `, [
                    team1.id,
                    team2.id,
                    date
                ]);

                return message.reply(
                    `✅ ${team1} - ${team2} fikstüre eklendi.`
                );
            }

            /* =================================================
               .FİKSTÜR
            ================================================= */

            if (command === 'fikstür') {
                const fixtures =
                    await dbAll(`
                        SELECT *
                        FROM fixtures
                        ORDER BY id ASC
                    `);

                if (!fixtures.length) {
                    return message.reply(
                        '📅 Fikstür boş.'
                    );
                }

                const text =
                    await Promise.all(
                        fixtures.map(
                            async f => {
                                const t1 =
                                    await getTeam(
                                        f.team1_id
                                    );

                                const t2 =
                                    await getTeam(
                                        f.team2_id
                                    );

                                return (
                                    `**#${f.id}** ` +
                                    `**${t1?.name || 'Bilinmeyen'}** vs **${t2?.name || 'Bilinmeyen'}** — ${f.date_str}`
                                );
                            }
                        )
                    );

                return message.reply({
                    embeds: [
                        new EmbedBuilder()
                            .setTitle(
                                '📅 Fikstür'
                            )
                            .setDescription(
                                text.join('\n')
                            )
                            .setColor(
                                0x3498db
                            )
                    ]
                });
            }

            /* =================================================
               .MAÇ
            ================================================= */

            if (command === 'maç') {
                if (
                    !isManager(
                        message.member
                    ) &&
                    !isAdmin(
                        message.member
                    )
                ) {
                    return message.reply(
                        '❌ Yetkin yok.'
                    );
                }

                const roles =
                    message.mentions.roles;

                const team1 =
                    roles.at(0);

                const team2 =
                    roles.at(1);

                if (
                    !team1 ||
                    !team2
                ) {
                    return message.reply(
                        '❌ Kullanım: `.maç @takım1 @takım2`'
                    );
                }

                const result =
                    await runLiveMatch(
                        team1.id,
                        team2.id
                    );

                if (!result) {
                    return message.reply(
                        '❌ Takımlar bulunamadı.'
                    );
                }

                return message.reply(
                    `⚽ **${result.team1} ${result.goals1} - ${result.goals2} ${result.team2}**`
                );
            }

            /* =================================================
               .HAZIRLIKMAÇI
            ================================================= */

            if (
                command === 'hazırlıkmaçı'
            ) {
                const roles =
                    message.mentions.roles;

                const team1 =
                    roles.at(0);

                const team2 =
                    roles.at(1);

                if (
                    !team1 ||
                    !team2
                ) {
                    return message.reply(
                        '❌ Kullanım: `.hazırlıkmaçı @takım1 @takım2`'
                    );
                }

                const t1 =
                    await getTeam(
                        team1.id
                    );

                const t2 =
                    await getTeam(
                        team2.id
                    );

                if (!t1 || !t2) {
                    return message.reply(
                        '❌ Takım bulunamadı.'
                    );
                }

                const g1 =
                    Math.floor(
                        Math.random() * 5
                    );

                const g2 =
                    Math.floor(
                        Math.random() * 5
                    );

                return message.reply(
                    `🏟️ Hazırlık maçı: **${t1.name} ${g1} - ${g2} ${t2.name}**`
                );
            }

            /* =================================================
               .PUANEKLE
            ================================================= */

            if (command === 'puanekle') {
                if (
                    !isAdmin(
                        message.member
                    )
                ) {
                    return message.reply(
                        '❌ Yetkin yok.'
                    );
                }

                const teamRole =
                    message.mentions.roles.first();

                const amount =
                    cleanNumber(
                        args[1]
                    );

                if (
                    !teamRole ||
                    amount <= 0
                ) {
                    return message.reply(
                        '❌ Kullanım: `.puanekle @takım 3`'
                    );
                }

                await dbRun(`
                    UPDATE teams
                    SET points = points + ?
                    WHERE role_id = ?
                `, [
                    amount,
                    teamRole.id
                ]);

                return message.reply(
                    `✅ ${teamRole} takımına **+${amount} puan** verildi.`
                );
            }

            /* =================================================
               .PUAN
            ================================================= */

            if (command === 'puan') {
                const image =
                    await createPointsImage(
                        message.guild
                    );

                const attachment =
                    new AttachmentBuilder(
                        image,
                        {
                            name: 'puan.png'
                        }
                    );

                return message.reply({
                    files: [attachment]
                });
            }

            /* =================================================
               .KRALLIK
            ================================================= */

            if (command === 'krallık') {
                const players =
                    await dbAll(`
                        SELECT *
                        FROM players
                        WHERE role_type != 'UNREGISTERED'
                        ORDER BY goals DESC,
                                 assists DESC
                        LIMIT 20
                    `);

                if (!players.length) {
                    return message.reply(
                        '👑 Gol krallığı boş.'
                    );
                }

                const text =
                    players.map(
                        (p, i) =>
                            `**${i + 1}.** <@${p.user_id}> — ⚽ ${p.goals} gol — 🅰️ ${p.assists} asist`
                    ).join('\n');

                return message.reply({
                    embeds: [
                        new EmbedBuilder()
                            .setTitle(
                                '👑 Gol Krallığı'
                            )
                            .setDescription(
                                text
                            )
                            .setColor(
                                0xf1c40f
                            )
                    ]
                });
            }

            /* =================================================
               .ARA
            ================================================= */

            if (command === 'ara') {
                const target =
                    message.mentions.members.first();

                if (!target) {
                    return message.reply(
                        '❌ Kullanım: `.ara @oyuncu`'
                    );
                }

                const player =
                    await getPlayer(
                        target.id
                    );

                if (!player) {
                    return message.reply(
                        '❌ Oyuncu bulunamadı.'
                    );
                }

                const team =
                    player.team_id
                        ? await getTeam(
                            player.team_id
                        )
                        : null;

                return message.reply({
                    embeds: [
                        new EmbedBuilder()
                            .setTitle(
                                `🔎 ${target.user.username}`
                            )
                            .addFields(
                                {
                                    name: 'Nick',
                                    value:
                                        player.nickname ||
                                        '-'
                                },
                                {
                                    name: 'Değer',
                                    value:
                                        formatMoney(
                                            player.value
                                        ),
                                    inline: true
                                },
                                {
                                    name: 'Takım',
                                    value:
                                        team
                                            ? team.name
                                            : 'Serbest',
                                    inline: true
                                },
                                {
                                    name: 'Pozisyon',
                                    value:
                                        player.position ||
                                        'YOK',
                                    inline: true
                                },
                                {
                                    name: '⚽ Gol',
                                    value:
                                        String(
                                            player.goals
                                        ),
                                    inline: true
                                },
                                {
                                    name: '🅰️ Asist',
                                    value:
                                        String(
                                            player.assists
                                        ),
                                    inline: true
                                }
                            )
                            .setColor(
                                0x5865f2
                            )
                    ]
                });
            }

            /* =================================================
               .ANT
            ================================================= */

            if (
                command === 'ant' ||
                command === 'antrenman'
            ) {
                if (
                    !message.channel.name
                        .toLowerCase()
                        .includes(
                            TRAINING_CHANNEL_NAME
                        )
                ) {
                    return message.reply(
                        `❌ Bu komut sadece adında **${TRAINING_CHANNEL_NAME}** geçen kanalda kullanılabilir.`
                    );
                }

                const target =
                    message.mentions.members.first() ||
                    message.member;

                const player =
                    await getPlayer(
                        target.id
                    );

                if (!player) {
                    return message.reply(
                        '❌ Oyuncu kayıtlı değil.'
                    );
                }

                if (
                    player.role_type ===
                    'UNREGISTERED'
                ) {
                    return message.reply(
                        '❌ Kayıtsız oyuncu antrenman yapamaz.'
                    );
                }

                const newCount =
                    (player.ant_count || 0) + 1;

                if (
                    newCount >= 5
                ) {
                    await dbRun(`
                        UPDATE players
                        SET
                            ant_count = 0,
                            value = value + 5
                        WHERE user_id = ?
                    `, [
                        target.id
                    ]);

                    await updateServerNickname(
                        message.guild,
                        target.id
                    );

                    return message.reply(
                        `🏋️ ${target} 5 antrenmanı tamamladı ve **+5M** kazandı!`
                    );
                }

                await dbRun(`
                    UPDATE players
                    SET ant_count = ?
                    WHERE user_id = ?
                `, [
                    newCount,
                    target.id
                ]);

                return message.reply(
                    `🏋️ ${target} antrenman yaptı. **${newCount}/5**`
                );
            }

            /* =================================================
               .PEN
            ================================================= */

            if (
                command === 'pen' ||
                command === 'penaltı'
            ) {
                if (
                    !message.channel.name
                        .toLowerCase()
                        .includes(
                            PENALTY_CHANNEL_NAME
                        )
                ) {
                    return message.reply(
                        `❌ Bu komut sadece adında **${PENALTY_CHANNEL_NAME}** geçen kanalda kullanılabilir.`
                    );
                }

                const target =
                    message.mentions.members.first() ||
                    message.member;

                const player =
                    await getPlayer(
                        target.id
                    );

                if (!player) {
                    return message.reply(
                        '❌ Oyuncu kayıtlı değil.'
                    );
                }

                if (
                    player.role_type ===
                    'UNREGISTERED'
                ) {
                    return message.reply(
                        '❌ Kayıtsız oyuncu penaltı kullanamaz.'
                    );
                }

                const success =
                    Math.random() < 0.5;

                if (!success) {
                    return message.reply(
                        `❌ ${target} penaltıyı kaçırdı.`
                    );
                }

                await dbRun(`
                    UPDATE players
                    SET
                        value = value + 3,
                        goals = goals + 1
                    WHERE user_id = ?
                `, [
                    target.id
                ]);

                await updateServerNickname(
                    message.guild,
                    target.id
                );

                return message.reply(
                    `⚽ **GOL!** ${target} penaltıyı gole çevirdi ve **+3M** kazandı!`
                );
            }

            /* =================================================
               .TWEET
            ================================================= */

            if (command === 'tweet') {
                const text =
                    args.join(' ');

                if (!text) {
                    return message.reply(
                        '❌ Kullanım: `.tweet mesaj`'
                    );
                }

                return message.channel.send({
                    embeds: [
                        new EmbedBuilder()
                            .setAuthor({
                                name:
                                    message.member
                                        .displayName ||
                                    message.author.username,
                                iconURL:
                                    message.author.displayAvatarURL()
                            })
                            .setDescription(
                                text
                            )
                            .setColor(
                                0x1da1f2
                            )
                            .setTimestamp()
                    ]
                });
            }
        } catch (error) {
            console.error(
                'messageCreate hatası:',
                error
            );

            await message.reply(
                '❌ Komut çalıştırılırken bir hata oluştu.'
            ).catch(() => {});
        }
    }
);

/* =========================================================
   BOT READY
========================================================= */

client.once(
    'ready',
    async () => {
        console.log(
            `✅ ${client.user.tag} aktif!`
        );

        await initDatabase();

        /*
           Eski kayıtlardaki roller de bot açılırken
           otomatik senkronize edilir.
        */

        for (const guild of client.guilds.cache.values()) {
            try {
                const players =
                    await dbAll(`
                        SELECT user_id
                        FROM players
                    `);

                for (const player of players) {
                    await syncPlayerRoles(
                        guild,
                        player.user_id
                    );
                }

                console.log(
                    `✅ ${guild.name} rol senkronizasyonu tamamlandı.`
                );
            } catch (err) {
                console.error(
                    'Başlangıç rol senkronizasyonu:',
                    err
                );
            }
        }
    }
);

/* =========================================================
   LOGIN
========================================================= */

if (!TOKEN) {
    console.error(
        '❌ TOKEN environment variable bulunamadı.'
    );
} else {
    client.login(TOKEN);
}
