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

const LOG_CHANNEL_NAME = 'bot-log';

const MAX_NICKNAME_LENGTH = 32;

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

async function columnExists(table, column) {
    const columns = await dbAll(`PRAGMA table_info(${table})`);
    return columns.some(x => x.name === column);
}

async function addColumnIfMissing(table, column, definition) {
    if (!(await columnExists(table, column))) {
        await dbRun(
            `ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`
        );
    }
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
            role_type TEXT DEFAULT 'FOOTBALLER',
            appearances INTEGER DEFAULT 0,
            saves INTEGER DEFAULT 0,
            clean_sheets INTEGER DEFAULT 0,
            yellow_cards INTEGER DEFAULT 0,
            red_cards INTEGER DEFAULT 0,
            suspended_until INTEGER DEFAULT 0,
            injured_until INTEGER DEFAULT 0
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

    await dbRun(`
        CREATE TABLE IF NOT EXISTS transfer_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            player_id TEXT NOT NULL,
            from_team_id TEXT,
            to_team_id TEXT,
            season TEXT,
            salary INTEGER DEFAULT 0,
            fee_amount INTEGER DEFAULT 0,
            transfer_type TEXT DEFAULT 'TRANSFER',
            created_at INTEGER
        )
    `);

    await dbRun(`
        CREATE TABLE IF NOT EXISTS contracts (
            player_id TEXT PRIMARY KEY,
            team_id TEXT,
            salary INTEGER DEFAULT 0,
            season TEXT,
            expires_at INTEGER DEFAULT 0,
            created_at INTEGER
        )
    `);

    await dbRun(`
        CREATE TABLE IF NOT EXISTS loans (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            player_id TEXT NOT NULL,
            from_team_id TEXT,
            to_team_id TEXT NOT NULL,
            fee INTEGER DEFAULT 0,
            start_at INTEGER,
            end_at INTEGER,
            status TEXT DEFAULT 'ACTIVE'
        )
    `);

    await dbRun(`
        CREATE TABLE IF NOT EXISTS seasons (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT UNIQUE,
            active INTEGER DEFAULT 0,
            started_at INTEGER,
            ended_at INTEGER DEFAULT 0
        )
    `);

    await dbRun(`
        CREATE TABLE IF NOT EXISTS season_player_stats (
            season_id INTEGER,
            player_id TEXT,
            goals INTEGER DEFAULT 0,
            assists INTEGER DEFAULT 0,
            appearances INTEGER DEFAULT 0,
            saves INTEGER DEFAULT 0,
            clean_sheets INTEGER DEFAULT 0,
            PRIMARY KEY (season_id, player_id)
        )
    `);

    await dbRun(`
        CREATE TABLE IF NOT EXISTS season_team_stats (
            season_id INTEGER,
            team_id TEXT,
            points INTEGER DEFAULT 0,
            played INTEGER DEFAULT 0,
            won INTEGER DEFAULT 0,
            drawn INTEGER DEFAULT 0,
            lost INTEGER DEFAULT 0,
            gf INTEGER DEFAULT 0,
            ga INTEGER DEFAULT 0,
            PRIMARY KEY (season_id, team_id)
        )
    `);

    await dbRun(`
        CREATE TABLE IF NOT EXISTS matches (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            season_id INTEGER,
            team1_id TEXT,
            team2_id TEXT,
            goals1 INTEGER DEFAULT 0,
            goals2 INTEGER DEFAULT 0,
            match_type TEXT DEFAULT 'LEAGUE',
            created_at INTEGER
        )
    `);

    await dbRun(`
        CREATE TABLE IF NOT EXISTS achievements (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            player_id TEXT,
            title TEXT,
            description TEXT,
            created_at INTEGER
        )
    `);

    await dbRun(`
        CREATE TABLE IF NOT EXISTS logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            guild_id TEXT,
            user_id TEXT,
            action TEXT,
            details TEXT,
            created_at INTEGER
        )
    `);

    await addColumnIfMissing(
        'players',
        'appearances',
        'INTEGER DEFAULT 0'
    );

    await addColumnIfMissing(
        'players',
        'saves',
        'INTEGER DEFAULT 0'
    );

    await addColumnIfMissing(
        'players',
        'clean_sheets',
        'INTEGER DEFAULT 0'
    );

    await addColumnIfMissing(
        'players',
        'yellow_cards',
        'INTEGER DEFAULT 0'
    );

    await addColumnIfMissing(
        'players',
        'red_cards',
        'INTEGER DEFAULT 0'
    );

    await addColumnIfMissing(
        'players',
        'suspended_until',
        'INTEGER DEFAULT 0'
    );

    await addColumnIfMissing(
        'players',
        'injured_until',
        'INTEGER DEFAULT 0'
    );

    await addColumnIfMissing(
        'teams',
        'budget',
        'INTEGER DEFAULT 0'
    );

    await addColumnIfMissing(
        'players',
        'role_type',
        "TEXT DEFAULT 'FOOTBALLER'"
    );

    console.log('✅ SQLite hazır.');
}

/* =========================================================
   YARDIMCILAR
========================================================= */

function cleanNumber(text) {
    if (!text) return 0;

    return parseInt(
        String(text).replace(/[^\d-]/g, ''),
        10
    ) || 0;
}

function formatMoney(value) {
    return `${Number(value || 0).toLocaleString('tr-TR')}M`;
}

function truncateNickname(name) {
    if (!name) return '';

    return name.length <= MAX_NICKNAME_LENGTH
        ? name
        : name.substring(0, MAX_NICKNAME_LENGTH);
}

function findRoleByName(guild, name) {
    return guild.roles.cache.find(
        role =>
            role.name.toLowerCase() ===
            name.toLowerCase()
    );
}

function findTeamRole(guild, name) {
    if (!name) return null;

    const search = name.trim().toLowerCase();

    return guild.roles.cache.find(
        role =>
            role.name.toLowerCase() === search
    );
}

function hasRole(member, roleName) {
    const role = findRoleByName(
        member.guild,
        roleName
    );

    return !!role &&
        member.roles.cache.has(role.id);
}

function isAdmin(member) {
    return member.permissions.has(
        PermissionsBitField.Flags.Administrator
    );
}

function isRegistrationAuthority(member) {
    return (
        isAdmin(member) ||
        hasRole(member, REGISTRATION_ROLE_NAME)
    );
}

function isValueAuthority(member) {
    return (
        isAdmin(member) ||
        hasRole(member, VALUE_ROLE_NAME)
    );
}

function isBudgetAuthority(member) {
    return (
        isAdmin(member) ||
        hasRole(member, BUDGET_ROLE_NAME)
    );
}

function isManager(member) {
    return (
        isAdmin(member) ||
        hasRole(member, MANAGER_ROLE_NAME)
    );
}

function isAuthorizedTransferMaker(member) {
    return (
        isAdmin(member) ||
        isBudgetAuthority(member) ||
        isManager(member)
    );
}

function isPenaltyChannel(channel) {
    return channel.name
        .toLowerCase()
        .includes(PENALTY_CHANNEL_NAME);
}

function isTrainingChannel(channel) {
    return channel.name
        .toLowerCase()
        .includes(TRAINING_CHANNEL_NAME);
}

function getTrailingValue(nickname) {
    if (!nickname) return 0;

    const match =
        nickname.match(/(\d+)\s*M\s*$/i);

    return match
        ? Number(match[1])
        : null;
}

function replaceTrailingValue(
    nickname,
    newValue
) {
    if (!nickname) return nickname;

    if (/(\d+)\s*M\s*$/i.test(nickname)) {
        return nickname.replace(
            /(\d+)\s*M\s*$/i,
            `${newValue}M`
        );
    }

    return `${nickname} | ${newValue}M`;
}

function daysFromNow(days) {
    return Date.now() +
        days * 24 * 60 * 60 * 1000;
}

function randomChance(chance) {
    return Math.random() < chance;
}

async function getPlayer(userId) {
    return dbGet(
        `SELECT * FROM players WHERE user_id = ?`,
        [userId]
    );
}

async function getTeam(teamId) {
    return dbGet(
        `SELECT * FROM teams WHERE role_id = ?`,
        [teamId]
    );
}

async function getAllTeamRoles(guild) {
    const teams =
        await dbAll(`SELECT * FROM teams`);

    return teams
        .map(team =>
            guild.roles.cache.get(team.role_id)
        )
        .filter(Boolean);
}

/* =========================================================
   LOG SİSTEMİ
========================================================= */

async function writeLog(
    guild,
    userId,
    action,
    details
) {
    try {
        await dbRun(`
            INSERT INTO logs (
                guild_id,
                user_id,
                action,
                details,
                created_at
            )
            VALUES (?, ?, ?, ?, ?)
        `, [
            guild.id,
            userId,
            action,
            details,
            Date.now()
        ]);

        const channel =
            guild.channels.cache.find(
                c =>
                    c.name.toLowerCase() ===
                    LOG_CHANNEL_NAME.toLowerCase()
            );

        if (channel) {
            const embed =
                new EmbedBuilder()
                    .setTitle('🛡️ Bot Log')
                    .addFields(
                        {
                            name: 'İşlem',
                            value: action,
                            inline: true
                        },
                        {
                            name: 'Kullanıcı',
                            value: `<@${userId}>`,
                            inline: true
                        },
                        {
                            name: 'Detay',
                            value:
                                String(details)
                                    .substring(0, 1000)
                        }
                    )
                    .setColor(0x5865f2)
                    .setTimestamp();

            await channel.send({
                embeds: [embed]
            }).catch(() => {});
        }
    } catch (err) {
        console.error('Log hatası:', err);
    }
}

/* =========================================================
   SEZON
========================================================= */

async function getActiveSeason() {
    return dbGet(`
        SELECT *
        FROM seasons
        WHERE active = 1
        ORDER BY id DESC
        LIMIT 1
    `);
}

async function ensureSeasonStats(
    seasonId,
    playerId,
    teamId
) {
    await dbRun(`
        INSERT OR IGNORE INTO season_player_stats (
            season_id,
            player_id
        )
        VALUES (?, ?)
    `, [
        seasonId,
        playerId
    ]);

    if (teamId) {
        await dbRun(`
            INSERT OR IGNORE INTO season_team_stats (
                season_id,
                team_id
            )
            VALUES (?, ?)
        `, [
            seasonId,
            teamId
        ]);
    }
}

async function seasonPlayerStat(
    seasonId,
    playerId,
    field,
    amount = 1
) {
    const allowed = [
        'goals',
        'assists',
        'appearances',
        'saves',
        'clean_sheets'
    ];

    if (!allowed.includes(field)) return;

    await dbRun(`
        UPDATE season_player_stats
        SET ${field} = ${field} + ?
        WHERE season_id = ?
        AND player_id = ?
    `, [
        amount,
        seasonId,
        playerId
    ]);
}

/* =========================================================
   NICKNAME
========================================================= */

async function updateServerNickname(
    guild,
    userId
) {
    try {
        const member =
            await guild.members.fetch(userId);

        const player =
            await getPlayer(userId);

        if (!player) return;

        if (
            player.role_type ===
            'UNREGISTERED'
        ) {
            await member
                .setNickname(null)
                .catch(() => {});
            return;
        }

        if (
            player.role_type ===
            'MANAGER'
        ) {
            const team =
                player.team_id
                    ? await getTeam(player.team_id)
                    : null;

            let nickname =
                player.nickname ||
                member.user.username;

            const parts =
                nickname
                    .split('|')
                    .map(x => x.trim());

            if (parts.length >= 5) {
                parts[3] =
                    team
                        ? team.name
                        : 'Serbest';

                parts[4] = '0🏆';

                nickname =
                    parts.join(' | ');
            }

            await member
                .setNickname(
                    truncateNickname(nickname)
                )
                .catch(() => {});

            return;
        }

        let nickname =
            player.nickname;

        if (!nickname) return;

        nickname =
            replaceTrailingValue(
                nickname,
                player.value
            );

        await member
            .setNickname(
                truncateNickname(nickname)
            )
            .catch(() => {});
    } catch (err) {
        console.error(
            'Nickname hatası:',
            err
        );
    }
}

/* =========================================================
   ROL SENKRONİZASYONU
========================================================= */

async function syncPlayerRoles(
    guild,
    userId
) {
    try {
        const member =
            await guild.members.fetch(userId);

        const player =
            await getPlayer(userId);

        if (!player) return;

        const managerRole =
            findRoleByName(
                guild,
                MANAGER_ROLE_NAME
            );

        const footballerRole =
            findRoleByName(
                guild,
                FOOTBALLER_ROLE_NAME
            );

        const goalkeeperRole =
            findRoleByName(
                guild,
                GOALKEEPER_ROLE_NAME
            );

        const freeRole =
            findRoleByName(
                guild,
                FREE_ROLE_NAME
            );

        const teamRoles =
            await getAllTeamRoles(guild);

        const removeRoles = [
            managerRole,
            footballerRole,
            goalkeeperRole,
            freeRole,
            ...teamRoles
        ].filter(Boolean);

        if (removeRoles.length) {
            await member.roles
                .remove(removeRoles)
                .catch(() => {});
        }

        if (
            player.role_type ===
            'UNREGISTERED' ||
            !player.team_id
        ) {
            if (freeRole) {
                await member.roles
                    .add(freeRole)
                    .catch(() => {});
            }

            return;
        }

        if (
            player.role_type ===
            'MANAGER'
        ) {
            if (managerRole) {
                await member.roles
                    .add(managerRole)
                    .catch(() => {});
            }
        }

        if (
            player.role_type ===
            'FOOTBALLER'
        ) {
            if (footballerRole) {
                await member.roles
                    .add(footballerRole)
                    .catch(() => {});
            }
        }

        if (
            player.role_type ===
            'GOALKEEPER'
        ) {
            if (goalkeeperRole) {
                await member.roles
                    .add(goalkeeperRole)
                    .catch(() => {});
            }
        }

        const teamRole =
            guild.roles.cache.get(
                player.team_id
            );

        if (teamRole) {
            await member.roles
                .add(teamRole)
                .catch(() => {});
        }
    } catch (err) {
        console.error(
            'Rol senkronizasyon hatası:',
            err
        );
    }
}

/* =========================================================
   KAYIT PANELİ
   ÖNEMLİ: TARGET ID CUSTOM ID İÇİNDE
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

function registrationButtons(targetId) {
    return new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId(
                    `btn_reg_fb_${targetId}`
                )
                .setLabel('Futbolcu')
                .setEmoji('⚽')
                .setStyle(
                    ButtonStyle.Primary
                ),

            new ButtonBuilder()
                .setCustomId(
                    `btn_reg_kl_${targetId}`
                )
                .setLabel('Kaleci')
                .setEmoji('🧤')
                .setStyle(
                    ButtonStyle.Success
                ),

            new ButtonBuilder()
                .setCustomId(
                    `btn_reg_td_${targetId}`
                )
                .setLabel(
                    'Teknik Direktör'
                )
                .setEmoji('🎯')
                .setStyle(
                    ButtonStyle.Secondary
                )
        );
}

/* =========================================================
   KAP
========================================================= */

function kapOpenButton(
    makerId,
    playerId,
    teamId
) {
    return new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId(
                    `kap_open_${makerId}_${playerId}_${teamId}`
                )
                .setLabel(
                    'KAP Formunu Aç'
                )
                .setEmoji('📄')
                .setStyle(
                    ButtonStyle.Primary
                )
        );
}

function kapApprovalButtons(request) {
    const row =
        new ActionRowBuilder();

    if (!request.maker_approved) {
        row.addComponents(
            new ButtonBuilder()
                .setCustomId(
                    `kap_maker_${request.id}`
                )
                .setLabel(
                    'Transfer Maker Onayı'
                )
                .setEmoji('✍️')
                .setStyle(
                    ButtonStyle.Success
                )
        );
    }

    if (!request.player_approved) {
        row.addComponents(
            new ButtonBuilder()
                .setCustomId(
                    `kap_player_${request.id}`
                )
                .setLabel(
                    'Oyuncu Onayı'
                )
                .setEmoji('👤')
                .setStyle(
                    ButtonStyle.Primary
                )
        );
    }

    if (
        request.maker_approved &&
        request.player_approved &&
        request.status ===
        'WAITING_BUDGET'
    ) {
        row.addComponents(
            new ButtonBuilder()
                .setCustomId(
                    `kap_finalize_${request.id}`
                )
                .setLabel(
                    'Transferi Tamamla'
                )
                .setEmoji('✅')
                .setStyle(
                    ButtonStyle.Success
                )
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
    let status =
        '⏳ Onay Bekleniyor';

    if (
        request.status === 'APPROVED'
    ) {
        status =
            '✅ Transfer Tamamlandı';
    } else if (
        request.status ===
        'WAITING_BUDGET'
    ) {
        status =
            '💰 Bütçe Bekleniyor';
    } else if (
        request.maker_approved
    ) {
        status =
            '👤 Oyuncu Onayı Bekleniyor';
    } else if (
        request.player_approved
    ) {
        status =
            '✍️ Transfer Maker Onayı Bekleniyor';
    }

    return new EmbedBuilder()
        .setTitle(
            '📢 KAP — Transfer Bildirimi'
        )
        .setDescription(
            `**${player.nickname || 'Oyuncu'}** için transfer bildirimi`
        )
        .addFields(
            {
                name: '👤 Oyuncu',
                value:
                    `<@${request.player_id}>`,
                inline: true
            },
            {
                name: '📤 Eski Takım',
                value:
                    fromTeam
                        ? `<@&${fromTeam.role_id}>`
                        : 'Serbest',
                inline: true
            },
            {
                name: '📥 Yeni Takım',
                value:
                    `<@&${toTeam.role_id}>`,
                inline: true
            },
            {
                name: '📅 Sezon',
                value:
                    request.season || '-',
                inline: true
            },
            {
                name: '💵 Maaş',
                value:
                    formatMoney(request.salary),
                inline: true
            },
            {
                name: '💰 Transfer Ücreti',
                value:
                    formatMoney(
                        request.fee_amount
                    ),
                inline: true
            },
            {
                name: '📜 Ek Madde',
                value:
                    request.fee_clause ||
                    'Yok'
            },
            {
                name: '📊 Durum',
                value: status
            }
        )
        .setFooter({
            text:
                `KAP #${request.id}`
        })
        .setTimestamp();
}

/* =========================================================
   TRANSFER TAMAMLAMA
========================================================= */

async function completeKapTransfer(
    guild,
    requestId
) {
    const request =
        await dbGet(`
            SELECT *
            FROM transfer_requests
            WHERE id = ?
        `, [requestId]);

    if (!request) {
        return {
            success: false,
            message:
                'KAP kaydı bulunamadı.'
        };
    }

    if (
        request.status ===
        'APPROVED'
    ) {
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
            message:
                'İki tarafın da onayı gerekli.'
        };
    }

    const player =
        await getPlayer(
            request.player_id
        );

    const targetTeam =
        await getTeam(
            request.to_team_id
        );

    if (!player || !targetTeam) {
        return {
            success: false,
            message:
                'Oyuncu veya takım bulunamadı.'
        };
    }

    if (
        player.team_id ===
        request.to_team_id
    ) {
        return {
            success: false,
            message:
                'Oyuncu zaten bu takımda.'
        };
    }

    const fee =
        Number(
            request.fee_amount || 0
        );

    if (fee > 0) {
        const result =
            await dbRun(`
                UPDATE teams
                SET budget = budget - ?
                WHERE role_id = ?
                AND budget >= ?
            `, [
                fee,
                request.to_team_id,
                fee
            ]);

        if (!result.changes) {
            await dbRun(`
                UPDATE transfer_requests
                SET status = 'WAITING_BUDGET'
                WHERE id = ?
            `, [requestId]);

            return {
                success: false,
                waitingBudget: true,
                message:
                    'Yeni takımın bütçesi yetersiz.'
            };
        }

        if (
            request.from_team_id &&
            request.from_team_id !==
            request.to_team_id
        ) {
            await dbRun(`
                UPDATE teams
                SET budget = budget + ?
                WHERE role_id = ?
            `, [
                fee,
                request.from_team_id
            ]);
        }
    }

    const oldTeam =
        player.team_id;

    await dbRun(`
        UPDATE players
        SET team_id = ?,
            suspended_until = 0
        WHERE user_id = ?
    `, [
        request.to_team_id,
        request.player_id
    ]);

    await dbRun(`
        INSERT INTO transfer_history (
            player_id,
            from_team_id,
            to_team_id,
            season,
            salary,
            fee_amount,
            transfer_type,
            created_at
        )
        VALUES (?, ?, ?, ?, ?, ?, 'TRANSFER', ?)
    `, [
        request.player_id,
        oldTeam,
        request.to_team_id,
        request.season,
        request.salary,
        fee,
        Date.now()
    ]);

    await dbRun(`
        INSERT INTO contracts (
            player_id,
            team_id,
            salary,
            season,
            expires_at,
            created_at
        )
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(player_id)
        DO UPDATE SET
            team_id = excluded.team_id,
            salary = excluded.salary,
            season = excluded.season,
            expires_at = excluded.expires_at
    `, [
        request.player_id,
        request.to_team_id,
        request.salary,
        request.season,
        daysFromNow(180),
        Date.now()
    ]);

    await dbRun(`
        UPDATE transfer_requests
        SET status = 'APPROVED'
        WHERE id = ?
    `, [requestId]);

    await syncPlayerRoles(
        guild,
        request.player_id
    );

    await updateServerNickname(
        guild,
        request.player_id
    );

    await writeLog(
        guild,
        request.maker_id,
        'TRANSFER',
        `KAP #${requestId} tamamlandı. Oyuncu: ${request.player_id}`
    );

    return {
        success: true
    };
}

/* =========================================================
   OYUNCU BAŞARILARI
========================================================= */

async function checkAchievements(
    guild,
    playerId
) {
    const player =
        await getPlayer(playerId);

    if (!player) return;

    const checks = [
        {
            condition:
                player.goals >= 10,
            title:
                '⚽ Golcü',
            description:
                '10 gol attı.'
        },
        {
            condition:
                player.goals >= 25,
            title:
                '🔥 Gol Makinesi',
            description:
                '25 gol attı.'
        },
        {
            condition:
                player.assists >= 10,
            title:
                '🎯 Oyun Kurucu',
            description:
                '10 asist yaptı.'
        },
        {
            condition:
                player.appearances >= 20,
            title:
                '💪 Sürekli İlk 11',
            description:
                '20 maça çıktı.'
        },
        {
            condition:
                player.saves >= 25,
            title:
                '🧤 Duvar',
            description:
                '25 kurtarış yaptı.'
        },
        {
            condition:
                player.clean_sheets >= 5,
            title:
                '🔒 Kale Kilidi',
            description:
                '5 kez gol yemeden maç tamamladı.'
        }
    ];

    for (const achievement of checks) {
        if (!achievement.condition) continue;

        const exists =
            await dbGet(`
                SELECT *
                FROM achievements
                WHERE player_id = ?
                AND title = ?
            `, [
                playerId,
                achievement.title
            ]);

        if (!exists) {
            await dbRun(`
                INSERT INTO achievements (
                    player_id,
                    title,
                    description,
                    created_at
                )
                VALUES (?, ?, ?, ?)
            `, [
                playerId,
                achievement.title,
                achievement.description,
                Date.now()
            ]);

            await writeLog(
                guild,
                playerId,
                'ACHIEVEMENT',
                `${achievement.title} kazanıldı.`
            );
        }
    }
}

/* =========================================================
   GELİŞMİŞ MAÇ MOTORU
========================================================= */

async function getTeamStrength(teamId) {
    const players =
        await dbAll(`
            SELECT *
            FROM players
            WHERE team_id = ?
            AND role_type != 'UNREGISTERED'
        `, [teamId]);

    if (!players.length) {
        return 20;
    }

    let total = 0;

    for (const player of players) {
        let strength =
            Number(player.value || 1);

        if (
            player.position &&
            player.position
                .toLowerCase()
                .includes('kal')
        ) {
            strength += 1;
        }

        if (
            player.suspended_until >
            Date.now()
        ) {
            strength -= 3;
        }

        if (
            player.injured_until >
            Date.now()
        ) {
            strength -= 3;
        }

        total += Math.max(
            1,
            strength
        );
    }

    return Math.max(
        20,
        total / players.length * 10
    );
}

function tacticBonus(tactic) {
    const bonuses = {
        Dengeli: 1,
        Ofansif: 3,
        Defansif: -1,
        Kontra: 2,
        Pres: 2,
        Kanatlardan: 2
    };

    return bonuses[tactic] || 1;
}

function formationBonus(formation) {
    const bonuses = {
        '4-3-3': 3,
        '4-4-2': 1,
        '4-2-3-1': 2,
        '3-5-2': 2,
        '3-4-3': 3,
        '5-3-2': -1,
        '5-4-1': -2
    };

    return bonuses[formation] || 0;
}

async function chooseScorer(
    teamId
) {
    const players =
        await dbAll(`
            SELECT *
            FROM players
            WHERE team_id = ?
            AND role_type = 'FOOTBALLER'
            ORDER BY value DESC
            LIMIT 15
        `, [teamId]);

    if (!players.length) {
        return null;
    }

    return players[
        Math.floor(
            Math.random() *
            players.length
        )
    ];
}

async function chooseAssist(
    teamId,
    scorerId
) {
    const players =
        await dbAll(`
            SELECT *
            FROM players
            WHERE team_id = ?
            AND role_type = 'FOOTBALLER'
            AND user_id != ?
            ORDER BY assists DESC, value DESC
            LIMIT 15
        `, [
            teamId,
            scorerId
        ]);

    if (!players.length) {
        return null;
    }

    return players[
        Math.floor(
            Math.random() *
            players.length
        )
    ];
}

async function runLiveMatch(
    team1Id,
    team2Id,
    matchType = 'LEAGUE'
) {
    const team1 =
        await getTeam(team1Id);

    const team2 =
        await getTeam(team2Id);

    if (!team1 || !team2) {
        return null;
    }

    const strength1 =
        await getTeamStrength(
            team1Id
        );

    const strength2 =
        await getTeamStrength(
            team2Id
        );

    let attack1 =
        strength1 +
        tacticBonus(team1.tactic) +
        formationBonus(team1.formation);

    let attack2 =
        strength2 +
        tacticBonus(team2.tactic) +
        formationBonus(team2.formation);

    attack1 +=
        Math.random() * 15;

    attack2 +=
        Math.random() * 15;

    let goals1 =
        Math.min(
            7,
            Math.max(
                0,
                Math.floor(
                    attack1 / 30
                ) +
                Math.floor(
                    Math.random() * 3
                )
            )
        );

    let goals2 =
        Math.min(
            7,
            Math.max(
                0,
                Math.floor(
                    attack2 / 30
                ) +
                Math.floor(
                    Math.random() * 3
                )
            )
        );

    if (
        team1.tactic ===
        'Defansif'
    ) {
        goals1 =
            Math.max(
                0,
                goals1 - 1
            );
    }

    if (
        team2.tactic ===
        'Defansif'
    ) {
        goals2 =
            Math.max(
                0,
                goals2 - 1
            );
    }

    const season =
        await getActiveSeason();

    const events = [];

    const processTeam =
        async (
            teamId,
            goals
        ) => {
            const teamPlayers =
                await dbAll(`
                    SELECT *
                    FROM players
                    WHERE team_id = ?
                    AND role_type != 'UNREGISTERED'
                `, [teamId]);

            const goalkeeper =
                teamPlayers.find(
                    p =>
                        p.role_type ===
                        'GOALKEEPER'
                );

            for (
                let i = 0;
                i < goals;
                i++
            ) {
                const scorer =
                    await chooseScorer(
                        teamId
                    );

                if (!scorer) continue;

                await dbRun(`
                    UPDATE players
                    SET goals = goals + 1,
                        appearances = appearances + 1
                    WHERE user_id = ?
                `, [scorer.user_id]);

                if (season) {
                    await ensureSeasonStats(
                        season.id,
                        scorer.user_id,
                        teamId
                    );

                    await seasonPlayerStat(
                        season.id,
                        scorer.user_id,
                        'goals',
                        1
                    );
                }

                const assist =
                    await chooseAssist(
                        teamId,
                        scorer.user_id
                    );

                if (assist) {
                    await dbRun(`
                        UPDATE players
                        SET assists = assists + 1
                        WHERE user_id = ?
                    `, [assist.user_id]);

                    if (season) {
                        await ensureSeasonStats(
                            season.id,
                            assist.user_id,
                            teamId
                        );

                        await seasonPlayerStat(
                            season.id,
                            assist.user_id,
                            'assists',
                            1
                        );
                    }
                }

                events.push(
                    `⚽ <@${scorer.user_id}>` +
                    (
                        assist
                            ? ` — 🅰️ <@${assist.user_id}>`
                            : ''
                    )
                );
            }

            for (const player of teamPlayers) {
                await dbRun(`
                    UPDATE players
                    SET appearances = appearances + 1
                    WHERE user_id = ?
                `, [player.user_id]);

                if (season) {
                    await ensureSeasonStats(
                        season.id,
                        player.user_id,
                        teamId
                    );

                    await seasonPlayerStat(
                        season.id,
                        player.user_id,
                        'appearances',
                        1
                    );
                }
            }

            if (
                goalkeeper &&
                goals === 0
            ) {
                await dbRun(`
                    UPDATE players
                    SET clean_sheets = clean_sheets + 1
                    WHERE user_id = ?
                `, [goalkeeper.user_id]);

                if (season) {
                    await ensureSeasonStats(
                        season.id,
                        goalkeeper.user_id,
                        teamId
                    );

                    await seasonPlayerStat(
                        season.id,
                        goalkeeper.user_id,
                        'clean_sheets',
                        1
                    );
                }
            }

            if (goalkeeper) {
                const saves =
                    Math.floor(
                        Math.random() * 5
                    );

                await dbRun(`
                    UPDATE players
                    SET saves = saves + ?
                    WHERE user_id = ?
                `, [
                    saves,
                    goalkeeper.user_id
                ]);

                if (season) {
                    await ensureSeasonStats(
                        season.id,
                        goalkeeper.user_id,
                        teamId
                    );

                    await seasonPlayerStat(
                        season.id,
                        goalkeeper.user_id,
                        'saves',
                        saves
                    );
                }
            }
        };

    await processTeam(
        team1Id,
        goals1
    );

    await processTeam(
        team2Id,
        goals2
    );

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
    } else if (
        goals2 > goals1
    ) {
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

    if (season) {
        const updateSeasonTeam =
            async (
                teamId,
                gf,
                ga,
                result
            ) => {
                await dbRun(`
                    INSERT OR IGNORE INTO season_team_stats (
                        season_id,
                        team_id
                    )
                    VALUES (?, ?)
                `, [
                    season.id,
                    teamId
                ]);

                let points = 0;
                let won = 0;
                let drawn = 0;
                let lost = 0;

                if (result === 'W') {
                    points = 3;
                    won = 1;
                }

                if (result === 'D') {
                    points = 1;
                    drawn = 1;
                }

                if (result === 'L') {
                    lost = 1;
                }

                await dbRun(`
                    UPDATE season_team_stats
                    SET
                        points = points + ?,
                        played = played + 1,
                        won = won + ?,
                        drawn = drawn + ?,
                        lost = lost + ?,
                        gf = gf + ?,
                        ga = ga + ?
                    WHERE season_id = ?
                    AND team_id = ?
                `, [
                    points,
                    won,
                    drawn,
                    lost,
                    gf,
                    ga,
                    season.id,
                    teamId
                ]);
            };

        await updateSeasonTeam(
            team1Id,
            goals1,
            goals2,
            goals1 > goals2
                ? 'W'
                : goals1 === goals2
                    ? 'D'
                    : 'L'
        );

        await updateSeasonTeam(
            team2Id,
            goals2,
            goals1,
            goals2 > goals1
                ? 'W'
                : goals1 === goals2
                    ? 'D'
                    : 'L'
        );
    }

    const match =
        await dbRun(`
            INSERT INTO matches (
                season_id,
                team1_id,
                team2_id,
                goals1,
                goals2,
                match_type,
                created_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `, [
            season
                ? season.id
                : null,
            team1Id,
            team2Id,
            goals1,
            goals2,
            matchType,
            Date.now()
        ]);

    const allPlayers =
        await dbAll(`
            SELECT user_id
            FROM players
            WHERE team_id IN (?, ?)
        `, [
            team1Id,
            team2Id
        ]);

    for (const player of allPlayers) {
        await checkAchievements(
            client.guilds.cache.first(),
            player.user_id
        ).catch(() => {});
    }

    return {
        id: match.lastID,
        team1: team1.name,
        team2: team2.name,
        goals1,
        goals2,
        events
    };
}

/* =========================================================
   PUAN TABLOSU CANVAS
========================================================= */

async function createPointsImage() {
    const teams =
        await dbAll(`
            SELECT *
            FROM teams
            ORDER BY points DESC,
                     (gf - ga) DESC,
                     gf DESC
        `);

    const width = 1250;
    const headerHeight = 135;
    const rowHeight = 72;

    const height =
        Math.max(
            380,
            headerHeight +
            teams.length *
            rowHeight +
            50
        );

    const canvas =
        createCanvas(
            width,
            height
        );

    const ctx =
        canvas.getContext('2d');

    ctx.fillStyle =
        '#0f172a';

    ctx.fillRect(
        0,
        0,
        width,
        height
    );

    ctx.fillStyle =
        '#1e293b';

    ctx.fillRect(
        0,
        0,
        width,
        headerHeight
    );

    ctx.fillStyle =
        '#ffffff';

    ctx.font =
        'bold 42px Arial';

    ctx.textAlign =
        'center';

    ctx.fillText(
        '🏆 PUAN DURUMU',
        width / 2,
        65
    );

    ctx.font =
        '20px Arial';

    ctx.fillStyle =
        '#cbd5e1';

    ctx.fillText(
        'Discord Futbol Ligi',
        width / 2,
        100
    );

    const x = {
        rank: 45,
        team: 115,
        o: 700,
        g: 775,
        b: 850,
        m: 925,
        av: 1010,
        p: 1135
    };

    ctx.textAlign =
        'left';

    ctx.font =
        'bold 22px Arial';

    ctx.fillText(
        '#',
        x.rank,
        128
    );

    ctx.fillText(
        'TAKIM',
        x.team,
        128
    );

    ctx.fillText(
        'O',
        x.o,
        128
    );

    ctx.fillText(
        'G',
        x.g,
        128
    );

    ctx.fillText(
        'B',
        x.b,
        128
    );

    ctx.fillText(
        'M',
        x.m,
        128
    );

    ctx.fillText(
        'AV',
        x.av,
        128
    );

    ctx.fillText(
        'P',
        x.p,
        128
    );

    teams.forEach(
        (team, index) => {
            const y =
                headerHeight +
                index *
                rowHeight;

            ctx.fillStyle =
                index % 2 === 0
                    ? '#1e293b'
                    : '#172033';

            ctx.fillRect(
                20,
                y,
                width - 40,
                rowHeight - 5
            );

            ctx.fillStyle =
                '#ffffff';

            ctx.font =
                'bold 22px Arial';

            ctx.fillText(
                `${index + 1}`,
                x.rank,
                y + 43
            );

            let name =
                team.name ||
                'Takım';

            if (name.length > 32) {
                name =
                    name.substring(0, 31) +
                    '…';
            }

            ctx.fillText(
                name,
                x.team,
                y + 43
            );

            ctx.fillText(
                String(
                    team.played || 0
                ),
                x.o,
                y + 43
            );

            ctx.fillText(
                String(
                    team.won || 0
                ),
                x.g,
                y + 43
            );

            ctx.fillText(
                String(
                    team.drawn || 0
                ),
                x.b,
                y + 43
            );

            ctx.fillText(
                String(
                    team.lost || 0
                ),
                x.m,
                y + 43
            );

            ctx.fillText(
                String(
                    (team.gf || 0) -
                    (team.ga || 0)
                ),
                x.av,
                y + 43
            );

            ctx.fillText(
                String(
                    team.points || 0
                ),
                x.p,
                y + 43
            );
        }
    );

    return canvas.toBuffer(
        'image/png'
    );
}

/* =========================================================
   OYUNCU PROFİL CANVAS
========================================================= */

async function createPlayerProfileImage(
    player,
    team
) {
    const width = 900;
    const height = 620;

    const canvas =
        createCanvas(
            width,
            height
        );

    const ctx =
        canvas.getContext('2d');

    ctx.fillStyle =
        '#111827';

    ctx.fillRect(
        0,
        0,
        width,
        height
    );

    ctx.fillStyle =
        '#1f2937';

    ctx.fillRect(
        35,
        35,
        width - 70,
        height - 70
    );

    ctx.fillStyle =
        '#ffffff';

    ctx.font =
        'bold 38px Arial';

    ctx.textAlign =
        'left';

    ctx.fillText(
        '⚽ OYUNCU PROFİLİ',
        70,
        95
    );

    ctx.font =
        'bold 30px Arial';

    ctx.fillText(
        player.nickname ||
        'Oyuncu',
        70,
        145
    );

    ctx.font =
        '23px Arial';

    const rows = [
        [
            'Takım',
            team
                ? team.name
                : 'Serbest'
        ],
        [
            'Pozisyon',
            player.position ||
            'YOK'
        ],
        [
            'Değer',
            formatMoney(
                player.value
            )
        ],
        [
            '⚽ Gol',
            String(
                player.goals
            )
        ],
        [
            '🅰️ Asist',
            String(
                player.assists
            )
        ],
        [
            '🎮 Maç',
            String(
                player.appearances
            )
        ],
        [
            '🧤 Kurtarış',
            String(
                player.saves
            )
        ],
        [
            '🔒 Clean Sheet',
            String(
                player.clean_sheets
            )
        ],
        [
            '🟨 Sarı',
            String(
                player.yellow_cards
            )
        ],
        [
            '🟥 Kırmızı',
            String(
                player.red_cards
            )
        ]
    ];

    rows.forEach(
        (row, index) => {
            const col =
                index % 2;

            const line =
                Math.floor(
                    index / 2
                );

            const x =
                col === 0
                    ? 80
                    : 480;

            const y =
                200 +
                line * 70;

            ctx.fillStyle =
                '#94a3b8';

            ctx.fillText(
                row[0],
                x,
                y
            );

            ctx.fillStyle =
                '#ffffff';

            ctx.font =
                'bold 24px Arial';

            ctx.fillText(
                row[1],
                x,
                y + 30
            );

            ctx.font =
                '23px Arial';
        }
    );

    return canvas.toBuffer(
        'image/png'
    );
}

/* =========================================================
   INTERACTION CREATE
========================================================= */

client.on(
    'interactionCreate',
    async interaction => {
        try {
            /* ================================================
               KAYIT BUTONLARI
            ================================================= */

            if (
                interaction.isButton() &&
                (
                    interaction.customId
                        .startsWith(
                            'btn_reg_fb_'
                        ) ||
                    interaction.customId
                        .startsWith(
                            'btn_reg_kl_'
                        ) ||
                    interaction.customId
                        .startsWith(
                            'btn_reg_td_'
                        )
                )
            ) {
                if (
                    !isRegistrationAuthority(
                        interaction.member
                    )
                ) {
                    return interaction.reply({
                        content:
                            '❌ Bu işlem için Kayıt Yetkilisi olmalısın.',
                        ephemeral: true
                    });
                }

                const parts =
                    interaction.customId
                        .split('_');

                const typeCode =
                    parts[2];

                const targetId =
                    parts[3];

                const type =
                    typeCode === 'fb'
                        ? 'FOOTBALLER'
                        : typeCode === 'kl'
                            ? 'GOALKEEPER'
                            : 'MANAGER';

                const target =
                    await interaction.guild
                        .members
                        .fetch(targetId)
                        .catch(() => null);

                if (!target) {
                    return interaction.reply({
                        content:
                            '❌ Kayıt hedefi sunucuda bulunamadı.',
                        ephemeral: true
                    });
                }

                const modal =
                    new ModalBuilder()
                        .setCustomId(
                            `modal_reg_${type}_${targetId}`
                        )
                        .setTitle(
                            type ===
                            'FOOTBALLER'
                                ? '⚽ Futbolcu Kaydı'
                                : type ===
                                    'GOALKEEPER'
                                    ? '🧤 Kaleci Kaydı'
                                    : '🎯 Teknik Direktör Kaydı'
                        );

                const nameInput =
                    new TextInputBuilder()
                        .setCustomId(
                            'reg_name'
                        )
                        .setLabel(
                            'İsim'
                        )
                        .setStyle(
                            TextInputStyle.Short
                        )
                        .setRequired(true)
                        .setMaxLength(25);

                const countryInput =
                    new TextInputBuilder()
                        .setCustomId(
                            'reg_country'
                        )
                        .setLabel(
                            'Ülke'
                        )
                        .setStyle(
                            TextInputStyle.Short
                        )
                        .setRequired(true)
                        .setMaxLength(20);

                const thirdInput =
                    new TextInputBuilder()
                        .setCustomId(
                            type ===
                            'MANAGER'
                                ? 'reg_age'
                                : 'reg_position'
                        )
                        .setLabel(
                            type ===
                            'MANAGER'
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
                        .addComponents(
                            nameInput
                        ),
                    new ActionRowBuilder()
                        .addComponents(
                            countryInput
                        ),
                    new ActionRowBuilder()
                        .addComponents(
                            thirdInput
                        )
                );

                if (
                    type ===
                    'MANAGER'
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
                            .addComponents(
                                teamInput
                            )
                    );
                }

                return interaction.showModal(
                    modal
                );
            }

            /* ================================================
               KAYIT MODALI
            ================================================= */

            if (
                interaction.isModalSubmit() &&
                interaction.customId
                    .startsWith(
                        'modal_reg_'
                    )
            ) {
                if (
                    !isRegistrationAuthority(
                        interaction.member
                    )
                ) {
                    return interaction.reply({
                        content:
                            '❌ Yetkin yok.',
                        ephemeral: true
                    });
                }

                const parts =
                    interaction.customId
                        .split('_');

                const type =
                    parts[2];

                const targetId =
                    parts[3];

                const target =
                    await interaction.guild
                        .members
                        .fetch(targetId)
                        .catch(() => null);

                if (!target) {
                    return interaction.reply({
                        content:
                            '❌ Kayıt hedefi bulunamadı.',
                        ephemeral: true
                    });
                }

                const name =
                    interaction.fields
                        .getTextInputValue(
                            'reg_name'
                        );

                const country =
                    interaction.fields
                        .getTextInputValue(
                            'reg_country'
                        );

                const third =
                    interaction.fields
                        .getTextInputValue(
                            type ===
                            'MANAGER'
                                ? 'reg_age'
                                : 'reg_position'
                        );

                let teamRole = null;

                if (
                    type ===
                    'MANAGER'
                ) {
                    const teamName =
                        interaction.fields
                            .getTextInputValue(
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

                    const team =
                        await getTeam(
                            teamRole.id
                        );

                    if (!team) {
                        return interaction.reply({
                            content:
                                '❌ Bu rol henüz takım olarak sisteme eklenmemiş.',
                            ephemeral: true
                        });
                    }
                }

                let nickname;
                let value = 1;

                if (
                    type ===
                    'FOOTBALLER'
                ) {
                    nickname =
                        `${name} | ${country} | ${third} | 1M`;
                }

                if (
                    type ===
                    'GOALKEEPER'
                ) {
                    nickname =
                        `${name} | ${country} | KL | 1M`;
                }

                if (
                    type ===
                    'MANAGER'
                ) {
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
                    targetId,
                    nickname,
                    value,
                    teamRole
                        ? teamRole.id
                        : null,
                    type ===
                    'MANAGER'
                        ? 'TD'
                        : third,
                    type
                ]);

                await syncPlayerRoles(
                    interaction.guild,
                    targetId
                );

                await updateServerNickname(
                    interaction.guild,
                    targetId
                );

                await writeLog(
                    interaction.guild,
                    interaction.user.id,
                    'REGISTRATION',
                    `${target.user.username} kayıt edildi.`
                );

                return interaction.reply({
                    content:
                        `✅ ${target} başarıyla ${
                            type === 'MANAGER'
                                ? 'Teknik Direktör'
                                : type === 'GOALKEEPER'
                                    ? 'Kaleci'
                                    : 'Futbolcu'
                        } olarak kaydedildi.`,
                    ephemeral: true
                });
            }

            /* ================================================
               KAP FORM BUTTON
            ================================================= */

            if (
                interaction.isButton() &&
                interaction.customId
                    .startsWith(
                        'kap_open_'
                    )
            ) {
                const parts =
                    interaction.customId
                        .split('_');

                const makerId =
                    parts[2];

                const playerId =
                    parts[3];

                const teamId =
                    parts[4];

                if (
                    interaction.user.id !==
                    makerId
                ) {
                    return interaction.reply({
                        content:
                            '❌ Bu KAP formunu yalnızca oluşturan yetkili açabilir.',
                        ephemeral: true
                    });
                }

                const player =
                    await getPlayer(
                        playerId
                    );

                const targetTeam =
                    await getTeam(
                        teamId
                    );

                if (!player || !targetTeam) {
                    return interaction.reply({
                        content:
                            '❌ Oyuncu veya takım bulunamadı.',
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
                            'Örn: 50M + sonraki satıştan %10'
                        )
                        .setStyle(
                            TextInputStyle.Paragraph
                        )
                        .setRequired(true)
                        .setMaxLength(500);

                modal.addComponents(
                    new ActionRowBuilder()
                        .addComponents(
                            season
                        ),
                    new ActionRowBuilder()
                        .addComponents(
                            salary
                        ),
                    new ActionRowBuilder()
                        .addComponents(
                            fee
                        )
                );

                return interaction.showModal(
                    modal
                );
            }

            /* ================================================
               KAP MODAL
            ================================================= */

            if (
                interaction.isModalSubmit() &&
                interaction.customId
                    .startsWith(
                        'modal_kap_'
                    )
            ) {
                const parts =
                    interaction.customId
                        .split('_');

                const makerId =
                    parts[2];

                const playerId =
                    parts[3];

                const teamId =
                    parts[4];

                if (
                    interaction.user.id !==
                    makerId
                ) {
                    return interaction.reply({
                        content:
                            '❌ Bu KAP formunu sen açmadın.',
                        ephemeral: true
                    });
                }

                const player =
                    await getPlayer(
                        playerId
                    );

                const targetTeam =
                    await getTeam(
                        teamId
                    );

                if (!player || !targetTeam) {
                    return interaction.reply({
                        content:
                            '❌ Oyuncu veya takım bulunamadı.',
                        ephemeral: true
                    });
                }

                const season =
                    interaction.fields
                        .getTextInputValue(
                            'kap_season'
                        );

                const salary =
                    cleanNumber(
                        interaction.fields
                            .getTextInputValue(
                                'kap_salary'
                            )
                    );

                const feeClause =
                    interaction.fields
                        .getTextInputValue(
                            'kap_fee'
                        );

                const feeAmount =
                    cleanNumber(
                        feeClause
                    );

                const result =
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
                    await dbGet(`
                        SELECT *
                        FROM transfer_requests
                        WHERE id = ?
                    `, [
                        result.lastID
                    ]);

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
                        components:
                            row
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

                await writeLog(
                    interaction.guild,
                    interaction.user.id,
                    'KAP',
                    `KAP #${request.id} oluşturuldu.`
                );

                return;
            }

            /* ================================================
               KAP ONAYLARI
            ================================================= */

            if (
                interaction.isButton() &&
                (
                    interaction.customId
                        .startsWith(
                            'kap_maker_'
                        ) ||
                    interaction.customId
                        .startsWith(
                            'kap_player_'
                        )
                )
            ) {
                const parts =
                    interaction.customId
                        .split('_');

                const type =
                    parts[1];

                const requestId =
                    Number(parts[2]);

                const request =
                    await dbGet(`
                        SELECT *
                        FROM transfer_requests
                        WHERE id = ?
                    `, [
                        requestId
                    ]);

                if (!request) {
                    return interaction.reply({
                        content:
                            '❌ KAP bulunamadı.',
                        ephemeral: true
                    });
                }

                if (type === 'maker') {
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

                    await dbRun(`
                        UPDATE transfer_requests
                        SET maker_approved = 1
                        WHERE id = ?
                    `, [requestId]);
                }

                if (type === 'player') {
                    if (
                        interaction.user.id !==
                        request.player_id
                    ) {
                        return interaction.reply({
                            content:
                                '❌ Bu butona yalnızca oyuncu basabilir.',
                            ephemeral: true
                        });
                    }

                    await dbRun(`
                        UPDATE transfer_requests
                        SET player_approved = 1
                        WHERE id = ?
                    `, [requestId]);
                }

                let updated =
                    await dbGet(`
                        SELECT *
                        FROM transfer_requests
                        WHERE id = ?
                    `, [requestId]);

                if (
                    updated.maker_approved &&
                    updated.player_approved
                ) {
                    const transfer =
                        await completeKapTransfer(
                            interaction.guild,
                            requestId
                        );

                    updated =
                        await dbGet(`
                            SELECT *
                            FROM transfer_requests
                            WHERE id = ?
                        `, [requestId]);

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

                    await interaction.update({
                        embeds: [embed],
                        components:
                            row
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
                    components:
                        row
                            ? [row]
                            : []
                });
            }

            /* ================================================
               KAP FINALIZE
            ================================================= */

            if (
                interaction.isButton() &&
                interaction.customId
                    .startsWith(
                        'kap_finalize_'
                    )
            ) {
                const requestId =
                    Number(
                        interaction.customId
                            .split('_')[2]
                    );

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

                const result =
                    await completeKapTransfer(
                        interaction.guild,
                        requestId
                    );

                const updated =
                    await dbGet(`
                        SELECT *
                        FROM transfer_requests
                        WHERE id = ?
                    `, [requestId]);

                if (!updated) {
                    return interaction.reply({
                        content:
                            '❌ KAP bulunamadı.',
                        ephemeral: true
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

                await interaction.update({
                    embeds: [embed],
                    components:
                        row
                            ? [row]
                            : []
                });

                return;
            }

            /* ================================================
               FORMASYON / TAKTİK
            ================================================= */

            if (
                interaction.isStringSelectMenu()
            ) {
                if (
                    interaction.customId
                        .startsWith(
                            'formation_'
                        )
                ) {
                    const teamId =
                        interaction.customId
                            .replace(
                                'formation_',
                                ''
                            );

                    const manager =
                        await getPlayer(
                            interaction.user.id
                        );

                    if (
                        !isAdmin(
                            interaction.member
                        ) &&
                        (
                            !manager ||
                            manager.team_id !==
                            teamId ||
                            manager.role_type !==
                            'MANAGER'
                        )
                    ) {
                        return interaction.reply({
                            content:
                                '❌ Sadece o takımın Teknik Direktörü değiştirebilir.',
                            ephemeral: true
                        });
                    }

                    await dbRun(`
                        UPDATE teams
                        SET formation = ?
                        WHERE role_id = ?
                    `, [
                        interaction.values[0],
                        teamId
                    ]);

                    return interaction.reply({
                        content:
                            `✅ Formasyon **${interaction.values[0]}** oldu.`,
                        ephemeral: true
                    });
                }

                if (
                    interaction.customId
                        .startsWith(
                            'tactic_'
                        )
                ) {
                    const teamId =
                        interaction.customId
                            .replace(
                                'tactic_',
                                ''
                            );

                    const manager =
                        await getPlayer(
                            interaction.user.id
                        );

                    if (
                        !isAdmin(
                            interaction.member
                        ) &&
                        (
                            !manager ||
                            manager.team_id !==
                            teamId ||
                            manager.role_type !==
                            'MANAGER'
                        )
                    ) {
                        return interaction.reply({
                            content:
                                '❌ Sadece o takımın Teknik Direktörü değiştirebilir.',
                            ephemeral: true
                        });
                    }

                    await dbRun(`
                        UPDATE teams
                        SET tactic = ?
                        WHERE role_id = ?
                    `, [
                        interaction.values[0],
                        teamId
                    ]);

                    return interaction.reply({
                        content:
                            `✅ Taktik **${interaction.values[0]}** oldu.`,
                        ephemeral: true
                    });
                }
            }
        } catch (error) {
            console.error(
                'interactionCreate hatası:',
                error
            );

            if (
                !interaction.replied &&
                !interaction.deferred
            ) {
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
                !message.content
                    .startsWith(PREFIX)
            ) return;

            const args =
                message.content
                    .slice(PREFIX.length)
                    .trim()
                    .split(/\s+/);

            const command =
                args
                    .shift()
                    ?.toLowerCase();

            /* ================================================
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
**👤 Kayıt**
\`.k @oyuncu\`
\`.kayıtsızver @oyuncu\`

**🏟️ Takım**
\`.takımekle TakımAdı\`
\`.kadroekle @takım @oyuncu Pozisyon\`
\`.kadroçıkar @oyuncu\`
\`.kadro @takım\`
\`.formasyon\`

**📰 Transfer**
\`.kap @oyuncu @takım\`
\`.transferler @oyuncu\`
\`.kirala @oyuncu @takım gün ücret\`
\`.kiralıklar\`
\`.kiralebitir ID\`

**💰 Bütçe**
\`.bütçe @takım\`
\`.bütçeekle @takım miktar\`
\`.bütçesil @takım miktar\`

**💎 Değer**
\`.dver @oyuncu miktar\`
\`.dsil @oyuncu miktar\`

**⚽ Maç**
\`.fikstürekle @takım1 @takım2 tarih\`
\`.fikstür\`
\`.maç @takım1 @takım2\`
\`.hazırlıkmaçı @takım1 @takım2\`

**🏆 Sezon**
\`.sezonbaşlat 2026/27\`
\`.sezonbitir\`
\`.sezon\`

**📊 İstatistik**
\`.profil @oyuncu\`
\`.ara @oyuncu\`
\`.krallık\`
\`.asistkrali\`
\`.kaleciler\`
\`.başarılar @oyuncu\`
\`.transferler @oyuncu\`

**🏋️ Antrenman / Penaltı**
\`.ant @oyuncu\`
\`.pen @oyuncu\`

**📈 Lig**
\`.puan\`
\`.puanekle @takım puan\`

**📰 Diğer**
\`.tweet metin\`
                            `)
                            .setColor(
                                0x5865f2
                            )
                    ]
                });
            }

            /* ================================================
               K
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
                    message.mentions.members
                        .first();

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
                    registrationButtons(
                        target.id
                    );

                return message.channel.send({
                    embeds: [embed],
                    components: [row]
                });
            }

            /* ================================================
               KAYITSIZVER
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
                        '❌ Yetkin yok.'
                    );
                }

                const target =
                    message.mentions.members
                        .first();

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
                        role_type
                    )
                    VALUES (
                        ?, NULL, 0, NULL, 'YOK', 'UNREGISTERED'
                    )
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
                    `✅ ${target} kayıtsız yapıldı ve **${FREE_ROLE_NAME}** rolü verildi.`
                );
            }

            /* ================================================
               DVER
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
                    message.mentions.members
                        .first();

                const amount =
                    cleanNumber(
                        args[1]
                    );

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

            /* ================================================
               DSİL
            ================================================= */

            if (command === 'dsil') {
                if (
                    !isValueAuthority(
                        message.member
                    )
                ) {
                    return message.reply(
                        '❌ Yetkin yok.'
                    );
                }

                const target =
                    message.mentions.members
                        .first();

                const amount =
                    cleanNumber(
                        args[1]
                    );

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

            /* ================================================
               KAP
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
                    message.mentions.members
                        .first();

                const teamRole =
                    message.mentions.roles
                        .first();

                const teamName =
                    args
                        .slice(1)
                        .join(' ')
                        .trim();

                if (!target) {
                    return message.reply(
                        '❌ Kullanım: `.kap @oyuncu @takım`'
                    );
                }

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
                        '❌ Kayıtsız oyuncuya transfer yapılamaz.'
                    );
                }

                const selectedTeam =
                    teamRole ||
                    findTeamRole(
                        message.guild,
                        teamName
                    );

                if (!selectedTeam) {
                    return message.reply(
                        '❌ Takım rolü bulunamadı.'
                    );
                }

                const team =
                    await getTeam(
                        selectedTeam.id
                    );

                if (!team) {
                    return message.reply(
                        '❌ Bu rol takım sistemine eklenmemiş.'
                    );
                }

                if (
                    player.team_id ===
                    team.role_id
                ) {
                    return message.reply(
                        '❌ Oyuncu zaten bu takımda.'
                    );
                }

                const row =
                    kapOpenButton(
                        message.author.id,
                        target.id,
                        team.role_id
                    );

                return message.channel.send({
                    embeds: [
                        new EmbedBuilder()
                            .setTitle(
                                '📄 Yeni KAP'
                            )
                            .setDescription(
                                `${target} oyuncusunun **${team.name}** takımına transfer formu hazır.\n\n` +
                                `Formu doldurmak için aşağıdaki butona bas.`
                            )
                            .addFields(
                                {
                                    name: '👤 Oyuncu',
                                    value:
                                        `${target}`,
                                    inline: true
                                },
                                {
                                    name: '📥 Yeni Takım',
                                    value:
                                        `<@&${team.role_id}>`,
                                    inline: true
                                }
                            )
                            .setColor(
                                0x3498db
                            )
                    ],
                    components: [row]
                });
            }

            /* ================================================
               BÜTÇE
            ================================================= */

            if (command === 'bütçe') {
                const role =
                    message.mentions.roles
                        .first() ||
                    findTeamRole(
                        message.guild,
                        args.join(' ')
                    );

                if (!role) {
                    return message.reply(
                        '❌ Takım bulunamadı.'
                    );
                }

                const team =
                    await getTeam(
                        role.id
                    );

                if (!team) {
                    return message.reply(
                        '❌ Takım kayıtlı değil.'
                    );
                }

                return message.reply(
                    `💰 **${team.name}** bütçesi: **${formatMoney(team.budget)}**`
                );
            }

            /* ================================================
               BÜTÇE EKLE
            ================================================= */

            if (
                command === 'bütçeekle'
            ) {
                if (
                    !isBudgetAuthority(
                        message.member
                    )
                ) {
                    return message.reply(
                        '❌ Bütçe Yetkilisi değilsin.'
                    );
                }

                const role =
                    message.mentions.roles
                        .first();

                const amount =
                    cleanNumber(
                        args[1]
                    );

                if (
                    !role ||
                    amount <= 0
                ) {
                    return message.reply(
                        '❌ Kullanım: `.bütçeekle @takım 100`'
                    );
                }

                await dbRun(`
                    UPDATE teams
                    SET budget = budget + ?
                    WHERE role_id = ?
                `, [
                    amount,
                    role.id
                ]);

                return message.reply(
                    `✅ ${role} bütçesine **+${formatMoney(amount)}** eklendi.`
                );
            }

            /* ================================================
               BÜTÇE SİL
            ================================================= */

            if (
                command === 'bütçesil'
            ) {
                if (
                    !isBudgetAuthority(
                        message.member
                    )
                ) {
                    return message.reply(
                        '❌ Bütçe Yetkilisi değilsin.'
                    );
                }

                const role =
                    message.mentions.roles
                        .first();

                const amount =
                    cleanNumber(
                        args[1]
                    );

                if (
                    !role ||
                    amount <= 0
                ) {
                    return message.reply(
                        '❌ Kullanım: `.bütçesil @takım 100`'
                    );
                }

                await dbRun(`
                    UPDATE teams
                    SET budget =
                        MAX(0, budget - ?)
                    WHERE role_id = ?
                `, [
                    amount,
                    role.id
                ]);

                return message.reply(
                    `✅ ${role} bütçesinden **${formatMoney(amount)}** silindi.`
                );
            }

            /* ================================================
               TAKIM EKLE
            ================================================= */

            if (
                command === 'takımekle'
            ) {
                if (
                    !isAdmin(
                        message.member
                    )
                ) {
                    return message.reply(
                        '❌ Sadece yönetici takım ekleyebilir.'
                    );
                }

                const name =
                    args.join(' ')
                        .trim();

                const role =
                    findTeamRole(
                        message.guild,
                        name
                    );

                if (!role) {
                    return message.reply(
                        '❌ Önce Discord takım rolünü oluştur.'
                    );
                }

                if (
                    await getTeam(role.id)
                ) {
                    return message.reply(
                        '❌ Bu takım zaten kayıtlı.'
                    );
                }

                await dbRun(`
                    INSERT INTO teams (
                        role_id,
                        name,
                        formation,
                        tactic,
                        budget
                    )
                    VALUES (?, ?, '4-3-3', 'Dengeli', 0)
                `, [
                    role.id,
                    role.name
                ]);

                return message.reply(
                    `✅ **${role.name}** takım olarak eklendi.`
                );
            }

            /* ================================================
               KADRO EKLE
            ================================================= */

            if (
                command === 'kadroekle'
            ) {
                if (
                    !isManager(
                        message.member
                    )
                ) {
                    return message.reply(
                        '❌ Yetkin yok.'
                    );
                }

                const teamRole =
                    message.mentions.roles
                        .first();

                const player =
                    message.mentions.members
                        .at(1);

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
                        '❌ Kullanım: `.kadroekle @takım @oyuncu Pozisyon`'
                    );
                }

                const team =
                    await getTeam(
                        teamRole.id
                    );

                const playerData =
                    await getPlayer(
                        player.id
                    );

                if (!team || !playerData) {
                    return message.reply(
                        '❌ Takım veya oyuncu bulunamadı.'
                    );
                }

                await dbRun(`
                    UPDATE players
                    SET team_id = ?,
                        position = ?,
                        role_type =
                            CASE
                                WHEN role_type = 'MANAGER'
                                THEN 'MANAGER'
                                ELSE role_type
                            END
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

            /* ================================================
               KADRO ÇIKAR
            ================================================= */

            if (
                command === 'kadroçıkar'
            ) {
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
                    message.mentions.members
                        .first();

                if (!target) {
                    return message.reply(
                        '❌ Kullanım: `.kadroçıkar @oyuncu`'
                    );
                }

                await dbRun(`
                    UPDATE players
                    SET team_id = NULL,
                        position = 'YOK'
                    WHERE user_id = ?
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
                    `✅ ${target} kadrodan çıkarıldı.`
                );
            }

            /* ================================================
               KADRO
            ================================================= */

            if (command === 'kadro') {
                const role =
                    message.mentions.roles
                        .first() ||
                    findTeamRole(
                        message.guild,
                        args.join(' ')
                    );

                if (!role) {
                    return message.reply(
                        '❌ Takım bulunamadı.'
                    );
                }

                const team =
                    await getTeam(
                        role.id
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
                        ? players
                            .map(
                                (p, i) =>
                                    `**${i + 1}.** <@${p.user_id}> — ${p.position} — ${formatMoney(p.value)}`
                            )
                            .join('\n')
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
                                    name:
                                        'Formasyon',
                                    value:
                                        team.formation,
                                    inline: true
                                },
                                {
                                    name:
                                        'Taktik',
                                    value:
                                        team.tactic,
                                    inline: true
                                },
                                {
                                    name:
                                        'Bütçe',
                                    value:
                                        formatMoney(
                                            team.budget
                                        ),
                                    inline: true
                                }
                            )
                            .setColor(
                                0x2ecc71
                            )
                    ]
                });
            }

            /* ================================================
               FORMASYON
            ================================================= */

            if (
                command === 'formasyon'
            ) {
                const player =
                    await getPlayer(
                        message.author.id
                    );

                if (
                    !player ||
                    player.role_type !==
                    'MANAGER' ||
                    !player.team_id
                ) {
                    return message.reply(
                        '❌ Sadece takımı olan Teknik Direktör kullanabilir.'
                    );
                }

                const formation =
                    new StringSelectMenuBuilder()
                        .setCustomId(
                            `formation_${player.team_id}`
                        )
                        .setPlaceholder(
                            'Formasyon seç'
                        )
                        .addOptions(
                            FORMATIONS.map(
                                x => ({
                                    label: x,
                                    value: x
                                })
                            )
                        );

                const tactic =
                    new StringSelectMenuBuilder()
                        .setCustomId(
                            `tactic_${player.team_id}`
                        )
                        .setPlaceholder(
                            'Taktik seç'
                        )
                        .addOptions(
                            TACTICS.map(
                                x => ({
                                    label: x,
                                    value: x
                                })
                            )
                        );

                return message.reply({
                    components: [
                        new ActionRowBuilder()
                            .addComponents(
                                formation
                            ),
                        new ActionRowBuilder()
                            .addComponents(
                                tactic
                            )
                    ]
                });
            }

            /* ================================================
               FİKSTÜR EKLE
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

            /* ================================================
               FİKSTÜR
            ================================================= */

            if (
                command === 'fikstür'
            ) {
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
                                    `**${t1?.name || '?'}** vs **${t2?.name || '?'}** — ${f.date_str}`
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

            /* ================================================
               MAÇ
            ================================================= */

            if (command === 'maç') {
                if (
                    !isAdmin(
                        message.member
                    ) &&
                    !isManager(
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
                        team2.id,
                        'LEAGUE'
                    );

                if (!result) {
                    return message.reply(
                        '❌ Takımlar bulunamadı.'
                    );
                }

                const events =
                    result.events.length
                        ? `\n\n${result.events.slice(0, 12).join('\n')}`
                        : '';

                return message.reply({
                    embeds: [
                        new EmbedBuilder()
                            .setTitle(
                                '⚽ MAÇ SONUCU'
                            )
                            .setDescription(
                                `# **${result.team1} ${result.goals1} - ${result.goals2} ${result.team2}**${events}`
                            )
                            .setColor(
                                0x2ecc71
                            )
                    ]
                });
            }

            /* ================================================
               HAZIRLIK MAÇI
            ================================================= */

            if (
                command ===
                'hazırlıkmaçı'
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

                const result =
                    await runLiveMatch(
                        team1.id,
                        team2.id,
                        'FRIENDLY'
                    );

                if (!result) {
                    return message.reply(
                        '❌ Takımlar bulunamadı.'
                    );
                }

                return message.reply(
                    `🏟️ Hazırlık maçı: **${result.team1} ${result.goals1} - ${result.goals2} ${result.team2}**`
                );
            }

            /* ================================================
               PUAN
            ================================================= */

            if (command === 'puan') {
                const image =
                    await createPointsImage();

                const attachment =
                    new AttachmentBuilder(
                        image,
                        {
                            name:
                                'puan.png'
                        }
                    );

                return message.reply({
                    files: [attachment]
                });
            }

            /* ================================================
               PUAN EKLE
            ================================================= */

            if (
                command === 'puanekle'
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

                const role =
                    message.mentions.roles
                        .first();

                const amount =
                    cleanNumber(
                        args[1]
                    );

                if (
                    !role ||
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
                    role.id
                ]);

                return message.reply(
                    `✅ ${role} takımına **+${amount} puan** verildi.`
                );
            }

            /* ================================================
               PROFİL
            ================================================= */

            if (
                command === 'profil'
            ) {
                const target =
                    message.mentions.members
                        .first() ||
                    message.member;

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

                const image =
                    await createPlayerProfileImage(
                        player,
                        team
                    );

                const attachment =
                    new AttachmentBuilder(
                        image,
                        {
                            name:
                                'profil.png'
                        }
                    );

                return message.reply({
                    files: [attachment]
                });
            }

            /* ================================================
               ARA
            ================================================= */

            if (command === 'ara') {
                const target =
                    message.mentions.members
                        .first();

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
                                    name:
                                        'Takım',
                                    value:
                                        team
                                            ? team.name
                                            : 'Serbest',
                                    inline: true
                                },
                                {
                                    name:
                                        'Pozisyon',
                                    value:
                                        player.position,
                                    inline: true
                                },
                                {
                                    name:
                                        'Değer',
                                    value:
                                        formatMoney(
                                            player.value
                                        ),
                                    inline: true
                                },
                                {
                                    name:
                                        '⚽ Gol',
                                    value:
                                        String(
                                            player.goals
                                        ),
                                    inline: true
                                },
                                {
                                    name:
                                        '🅰️ Asist',
                                    value:
                                        String(
                                            player.assists
                                        ),
                                    inline: true
                                },
                                {
                                    name:
                                        '🎮 Maç',
                                    value:
                                        String(
                                            player.appearances
                                        ),
                                    inline: true
                                },
                                {
                                    name:
                                        '🧤 Kurtarış',
                                    value:
                                        String(
                                            player.saves
                                        ),
                                    inline: true
                                },
                                {
                                    name:
                                        '🟨 Sarı',
                                    value:
                                        String(
                                            player.yellow_cards
                                        ),
                                    inline: true
                                },
                                {
                                    name:
                                        '🟥 Kırmızı',
                                    value:
                                        String(
                                            player.red_cards
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

            /* ================================================
               GOL KRALLIĞI
            ================================================= */

            if (
                command === 'krallık'
            ) {
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
                        '👑 Liste boş.'
                    );
                }

                return message.reply({
                    embeds: [
                        new EmbedBuilder()
                            .setTitle(
                                '👑 Gol Krallığı'
                            )
                            .setDescription(
                                players
                                    .map(
                                        (p, i) =>
                                            `**${i + 1}.** <@${p.user_id}> — ⚽ **${p.goals}**`
                                    )
                                    .join('\n')
                            )
                            .setColor(
                                0xf1c40f
                            )
                    ]
                });
            }

            /* ================================================
               ASİST KRALLIĞI
            ================================================= */

            if (
                command ===
                'asistkrali'
            ) {
                const players =
                    await dbAll(`
                        SELECT *
                        FROM players
                        WHERE role_type != 'UNREGISTERED'
                        ORDER BY assists DESC,
                                 goals DESC
                        LIMIT 20
                    `);

                return message.reply({
                    embeds: [
                        new EmbedBuilder()
                            .setTitle(
                                '🎯 Asist Krallığı'
                            )
                            .setDescription(
                                players
                                    .map(
                                        (p, i) =>
                                            `**${i + 1}.** <@${p.user_id}> — 🅰️ **${p.assists}**`
                                    )
                                    .join('\n') ||
                                'Liste boş.'
                            )
                            .setColor(
                                0x3498db
                            )
                    ]
                });
            }

            /* ================================================
               KALECİLER
            ================================================= */

            if (
                command ===
                'kaleciler'
            ) {
                const players =
                    await dbAll(`
                        SELECT *
                        FROM players
                        WHERE role_type = 'GOALKEEPER'
                        ORDER BY clean_sheets DESC,
                                 saves DESC
                        LIMIT 20
                    `);

                return message.reply({
                    embeds: [
                        new EmbedBuilder()
                            .setTitle(
                                '🧤 Kaleci Sıralaması'
                            )
                            .setDescription(
                                players
                                    .map(
                                        (p, i) =>
                                            `**${i + 1}.** <@${p.user_id}> — 🔒 ${p.clean_sheets} CS — 🧤 ${p.saves} kurtarış`
                                    )
                                    .join('\n') ||
                                'Liste boş.'
                            )
                            .setColor(
                                0x2ecc71
                            )
                    ]
                });
            }

            /* ================================================
               BAŞARILAR
            ================================================= */

            if (
                command ===
                'başarılar'
            ) {
                const target =
                    message.mentions.members
                        .first() ||
                    message.member;

                const achievements =
                    await dbAll(`
                        SELECT *
                        FROM achievements
                        WHERE player_id = ?
                        ORDER BY id DESC
                    `, [
                        target.id
                    ]);

                const text =
                    achievements.length
                        ? achievements
                            .map(
                                a =>
                                    `🏅 **${a.title}** — ${a.description}`
                            )
                            .join('\n')
                        : 'Henüz başarı kazanılmadı.';

                return message.reply({
                    embeds: [
                        new EmbedBuilder()
                            .setTitle(
                                `🏅 ${target.user.username} Başarıları`
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

            /* ================================================
               TRANSFER GEÇMİŞİ
            ================================================= */

            if (
                command ===
                'transferler'
            ) {
                const target =
                    message.mentions.members
                        .first();

                if (!target) {
                    return message.reply(
                        '❌ Kullanım: `.transferler @oyuncu`'
                    );
                }

                const history =
                    await dbAll(`
                        SELECT *
                        FROM transfer_history
                        WHERE player_id = ?
                        ORDER BY id DESC
                        LIMIT 15
                    `, [
                        target.id
                    ]);

                if (!history.length) {
                    return message.reply(
                        '📜 Transfer geçmişi boş.'
                    );
                }

                const text =
                    await Promise.all(
                        history.map(
                            async h => {
                                const from =
                                    h.from_team_id
                                        ? await getTeam(
                                            h.from_team_id
                                        )
                                        : null;

                                const to =
                                    await getTeam(
                                        h.to_team_id
                                    );

                                return (
                                    `📅 **${h.season || '-'}** — ` +
                                    `${from?.name || 'Serbest'} ➜ ${to?.name || '?'} — ` +
                                    `💰 ${formatMoney(h.fee_amount)}`
                                );
                            }
                        )
                    );

                return message.reply({
                    embeds: [
                        new EmbedBuilder()
                            .setTitle(
                                '📜 Transfer Geçmişi'
                            )
                            .setDescription(
                                text.join('\n')
                            )
                            .setColor(
                                0x9b59b6
                            )
                    ]
                });
            }

            /* ================================================
               KİRALAMA
            ================================================= */

            if (
                command === 'kirala'
            ) {
                if (
                    !isAuthorizedTransferMaker(
                        message.member
                    )
                ) {
                    return message.reply(
                        '❌ Kiralama yetkin yok.'
                    );
                }

                const playerMember =
                    message.mentions.members
                        .first();

                const teamRole =
                    message.mentions.roles
                        .first();

                const days =
                    cleanNumber(
                        args[2]
                    );

                const fee =
                    cleanNumber(
                        args[3]
                    );

                if (
                    !playerMember ||
                    !teamRole ||
                    days <= 0
                ) {
                    return message.reply(
                        '❌ Kullanım: `.kirala @oyuncu @takım gün ücret`'
                    );
                }

                const player =
                    await getPlayer(
                        playerMember.id
                    );

                const team =
                    await getTeam(
                        teamRole.id
                    );

                if (!player || !team) {
                    return message.reply(
                        '❌ Oyuncu veya takım bulunamadı.'
                    );
                }

                if (
                    player.team_id ===
                    team.role_id
                ) {
                    return message.reply(
                        '❌ Oyuncu zaten bu takımda.'
                    );
                }

                if (fee > 0) {
                    const result =
                        await dbRun(`
                            UPDATE teams
                            SET budget =
                                budget - ?
                            WHERE role_id = ?
                            AND budget >= ?
                        `, [
                            fee,
                            team.role_id,
                            fee
                        ]);

                    if (!result.changes) {
                        return message.reply(
                            '❌ Kiralama için bütçe yetersiz.'
                        );
                    }
                }

                const oldTeam =
                    player.team_id;

                await dbRun(`
                    INSERT INTO loans (
                        player_id,
                        from_team_id,
                        to_team_id,
                        fee,
                        start_at,
                        end_at,
                        status
                    )
                    VALUES (?, ?, ?, ?, ?, ?, 'ACTIVE')
                `, [
                    playerMember.id,
                    oldTeam,
                    team.role_id,
                    fee,
                    Date.now(),
                    daysFromNow(days)
                ]);

                await dbRun(`
                    UPDATE players
                    SET team_id = ?
                    WHERE user_id = ?
                `, [
                    team.role_id,
                    playerMember.id
                ]);

                await dbRun(`
                    INSERT INTO transfer_history (
                        player_id,
                        from_team_id,
                        to_team_id,
                        season,
                        salary,
                        fee_amount,
                        transfer_type,
                        created_at
                    )
                    VALUES (?, ?, ?, ?, 0, ?, 'LOAN', ?)
                `, [
                    playerMember.id,
                    oldTeam,
                    team.role_id,
                    (await getActiveSeason())?.name ||
                        '-',
                    fee,
                    Date.now()
                ]);

                await syncPlayerRoles(
                    message.guild,
                    playerMember.id
                );

                await updateServerNickname(
                    message.guild,
                    playerMember.id
                );

                return message.reply(
                    `🔄 ${playerMember}, **${team.name}** takımına **${days} gün** kiralandı.`
                );
            }

            /* ================================================
               KİRALIKLAR
            ================================================= */

            if (
                command ===
                'kiralıklar'
            ) {
                const loans =
                    await dbAll(`
                        SELECT *
                        FROM loans
                        WHERE status = 'ACTIVE'
                        ORDER BY end_at ASC
                    `);

                if (!loans.length) {
                    return message.reply(
                        '🔄 Aktif kiralık oyuncu yok.'
                    );
                }

                const text =
                    await Promise.all(
                        loans.map(
                            async loan => {
                                const player =
                                    await getPlayer(
                                        loan.player_id
                                    );

                                const team =
                                    await getTeam(
                                        loan.to_team_id
                                    );

                                const remaining =
                                    Math.max(
                                        0,
                                        Math.ceil(
                                            (
                                                loan.end_at -
                                                Date.now()
                                            ) /
                                            86400000
                                        )
                                    );

                                return (
                                    `🔄 <@${loan.player_id}> ➜ **${team?.name || '?'}** — ${remaining} gün kaldı`
                                );
                            }
                        )
                    );

                return message.reply({
                    embeds: [
                        new EmbedBuilder()
                            .setTitle(
                                '🔄 Kiralık Oyuncular'
                            )
                            .setDescription(
                                text.join('\n')
                            )
                    ]
                });
            }

            /* ================================================
               KİRALIK BİTİR
            ================================================= */

            if (
                command ===
                'kiralebitir'
            ) {
                if (
                    !isAuthorizedTransferMaker(
                        message.member
                    )
                ) {
                    return message.reply(
                        '❌ Yetkin yok.'
                    );
                }

                const id =
                    cleanNumber(
                        args[0]
                    );

                const loan =
                    await dbGet(`
                        SELECT *
                        FROM loans
                        WHERE id = ?
                        AND status = 'ACTIVE'
                    `, [id]);

                if (!loan) {
                    return message.reply(
                        '❌ Kiralama bulunamadı.'
                    );
                }

                if (!loan.from_team_id) {
                    return message.reply(
                        '❌ Oyuncunun döneceği eski takım bulunamadı.'
                    );
                }

                await dbRun(`
                    UPDATE loans
                    SET status = 'COMPLETED'
                    WHERE id = ?
                `, [id]);

                await dbRun(`
                    UPDATE players
                    SET team_id = ?
                    WHERE user_id = ?
                `, [
                    loan.from_team_id,
                    loan.player_id
                ]);

                await syncPlayerRoles(
                    message.guild,
                    loan.player_id
                );

                await updateServerNickname(
                    message.guild,
                    loan.player_id
                );

                return message.reply(
                    `✅ <@${loan.player_id}> kiralıktan geri döndü.`
                );
            }

            /* ================================================
               ANTRENMAN
            ================================================= */

            if (
                command === 'ant' ||
                command === 'antrenman'
            ) {
                if (
                    !isTrainingChannel(
                        message.channel
                    )
                ) {
                    return message.reply(
                        `❌ Bu komut sadece adında **${TRAINING_CHANNEL_NAME}** bulunan kanalda kullanılabilir.`
                    );
                }

                const target =
                    message.mentions.members
                        .first() ||
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

                const count =
                    player.ant_count + 1;

                if (count >= 5) {
                    await dbRun(`
                        UPDATE players
                        SET ant_count = 0,
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
                    count,
                    target.id
                ]);

                return message.reply(
                    `🏋️ ${target} antrenman yaptı. **${count}/5**`
                );
            }

            /* ================================================
               PENALTI
            ================================================= */

            if (
                command === 'pen' ||
                command === 'penaltı'
            ) {
                if (
                    !isPenaltyChannel(
                        message.channel
                    )
                ) {
                    return message.reply(
                        `❌ Bu komut sadece adında **${PENALTY_CHANNEL_NAME}** bulunan kanalda kullanılabilir.`
                    );
                }

                const target =
                    message.mentions.members
                        .first() ||
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
                        '❌ Kayıtsız oyuncu kullanamaz.'
                    );
                }

                if (
                    player.suspended_until >
                    Date.now()
                ) {
                    return message.reply(
                        '🟥 Oyuncu cezalı.'
                    );
                }

                if (
                    player.injured_until >
                    Date.now()
                ) {
                    return message.reply(
                        '🏥 Oyuncu sakat.'
                    );
                }

                if (
                    randomChance(0.5)
                ) {
                    await dbRun(`
                        UPDATE players
                        SET value = value + 3,
                            goals = goals + 1
                        WHERE user_id = ?
                    `, [
                        target.id
                    ]);

                    await updateServerNickname(
                        message.guild,
                        target.id
                    );

                    await checkAchievements(
                        message.guild,
                        target.id
                    );

                    return message.reply(
                        `⚽ **GOL!** ${target} penaltıyı attı ve **+3M** kazandı!`
                    );
                }

                return message.reply(
                    `❌ ${target} penaltıyı kaçırdı.`
                );
            }

            /* ================================================
               SEZON BAŞLAT
            ================================================= */

            if (
                command ===
                'sezonbaşlat'
            ) {
                if (
                    !isAdmin(
                        message.member
                    )
                ) {
                    return message.reply(
                        '❌ Sadece yönetici sezon başlatabilir.'
                    );
                }

                const name =
                    args.join(' ')
                        .trim();

                if (!name) {
                    return message.reply(
                        '❌ Kullanım: `.sezonbaşlat 2026/27`'
                    );
                }

                await dbRun(`
                    UPDATE seasons
                    SET active = 0
                    WHERE active = 1
                `);

                const existing =
                    await dbGet(`
                        SELECT *
                        FROM seasons
                        WHERE name = ?
                    `, [name]);

                let seasonId;

                if (existing) {
                    seasonId =
                        existing.id;

                    await dbRun(`
                        UPDATE seasons
                        SET active = 1,
                            started_at = ?
                        WHERE id = ?
                    `, [
                        Date.now(),
                        seasonId
                    ]);
                } else {
                    const result =
                        await dbRun(`
                            INSERT INTO seasons (
                                name,
                                active,
                                started_at
                            )
                            VALUES (?, 1, ?)
                        `, [
                            name,
                            Date.now()
                        ]);

                    seasonId =
                        result.lastID;
                }

                await dbRun(`
                    UPDATE teams
                    SET points = 0,
                        played = 0,
                        won = 0,
                        drawn = 0,
                        lost = 0,
                        gf = 0,
                        ga = 0
                `);

                await dbRun(`
                    UPDATE players
                    SET goals = 0,
                        assists = 0,
                        appearances = 0,
                        saves = 0,
                        clean_sheets = 0,
                        yellow_cards = 0,
                        red_cards = 0
                `);

                return message.reply(
                    `🏆 **${name}** sezonu başlatıldı!`
                );
            }

            /* ================================================
               SEZON BİTİR
            ================================================= */

            if (
                command ===
                'sezonbitir'
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

                const season =
                    await getActiveSeason();

                if (!season) {
                    return message.reply(
                        '❌ Aktif sezon yok.'
                    );
                }

                const champion =
                    await dbGet(`
                        SELECT
                            season_team_stats.*,
                            teams.name
                        FROM season_team_stats
                        JOIN teams
                        ON teams.role_id =
                           season_team_stats.team_id
                        WHERE season_id = ?
                        ORDER BY points DESC,
                                 (gf - ga) DESC,
                                 gf DESC
                        LIMIT 1
                    `, [
                        season.id
                    ]);

                await dbRun(`
                    UPDATE seasons
                    SET active = 0,
                        ended_at = ?
                    WHERE id = ?
                `, [
                    Date.now(),
                    season.id
                ]);

                return message.reply(
                    `🏆 **${season.name}** sezonu tamamlandı!\n\n` +
                    `🥇 Şampiyon: **${champion?.name || 'Belirlenemedi'}**`
                );
            }

            /* ================================================
               SEZON
            ================================================= */

            if (
                command === 'sezon'
            ) {
                const season =
                    await getActiveSeason();

                if (!season) {
                    return message.reply(
                        '🏆 Aktif sezon bulunmuyor.'
                    );
                }

                return message.reply(
                    `🏆 Aktif sezon: **${season.name}**`
                );
            }

            /* ================================================
               TWEET
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
                                    message.author
                                        .username,
                                iconURL:
                                    message.author
                                        .displayAvatarURL()
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
   OTOMATİK KİRALIK KONTROLÜ
========================================================= */

setInterval(
    async () => {
        try {
            const expired =
                await dbAll(`
                    SELECT *
                    FROM loans
                    WHERE status = 'ACTIVE'
                    AND end_at <= ?
                `, [
                    Date.now()
                ]);

            for (const loan of expired) {
                if (!loan.from_team_id) {
                    continue;
                }

                await dbRun(`
                    UPDATE loans
                    SET status = 'COMPLETED'
                    WHERE id = ?
                `, [
                    loan.id
                ]);

                await dbRun(`
                    UPDATE players
                    SET team_id = ?
                    WHERE user_id = ?
                `, [
                    loan.from_team_id,
                    loan.player_id
                ]);

                for (
                    const guild of
                    client.guilds.cache.values()
                ) {
                    await syncPlayerRoles(
                        guild,
                        loan.player_id
                    );

                    await updateServerNickname(
                        guild,
                        loan.player_id
                    );

                    await writeLog(
                        guild,
                        loan.player_id,
                        'LOAN_END',
                        'Kiralık süresi otomatik olarak bitti.'
                    );
                }
            }
        } catch (err) {
            console.error(
                'Kiralık kontrol hatası:',
                err
            );
        }
    },
    60 * 1000
);

/* =========================================================
   OTOMATİK CEZA / SAKATLIK TEMİZLEME
========================================================= */

setInterval(
    async () => {
        try {
            await dbRun(`
                UPDATE players
                SET suspended_until = 0
                WHERE suspended_until > 0
                AND suspended_until <= ?
            `, [
                Date.now()
            ]);

            await dbRun(`
                UPDATE players
                SET injured_until = 0
                WHERE injured_until > 0
                AND injured_until <= ?
            `, [
                Date.now()
            ]);
        } catch (err) {
            console.error(
                'Ceza kontrol hatası:',
                err
            );
        }
    },
    60 * 1000
);

/* =========================================================
   READY
========================================================= */

client.once(
    'ready',
    async () => {
        console.log(
            `✅ ${client.user.tag} aktif!`
        );

        await initDatabase();

        for (
            const guild of
            client.guilds.cache.values()
        ) {
            try {
                const players =
                    await dbAll(`
                        SELECT user_id
                        FROM players
                    `);

                for (
                    const player of
                    players
                ) {
                    await syncPlayerRoles(
                        guild,
                        player.user_id
                    );

                    await updateServerNickname(
                        guild,
                        player.user_id
                    );
                }

                console.log(
                    `✅ ${guild.name} rol/nickname senkronizasyonu tamamlandı.`
                );
            } catch (err) {
                console.error(
                    'Başlangıç senkronizasyonu:',
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
    console.error(
        'Environment Variables kısmında değişken adı TOKEN olmalı.'
    );
} else {
    client.login(TOKEN);
}
