import 'dotenv/config';
import logger from './config/logger';

// Graceful shutdown and error handling
process.on('uncaughtException', (error) => {
    logger.error('UNCAUGHT EXCEPTION:', error);
    process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
    logger.error('UNHANDLED REJECTION:', reason);
    promise.catch(err => logger.error('REJECTION CATCH:', err));
    setTimeout(() => process.exit(1), 2000);
});

function gracefulShutdown() {
    logger.info('Shutting down gracefully...');
    const allClients = Array.from(clients.keys());
    if (allClients.length === 0) {
        process.exit(0);
    }
    allClients.forEach(username => stopBoosting(username));
    setTimeout(() => {
        logger.info('Graceful shutdown complete.');
        process.exit(0);
    }, 2000);
}

process.on('SIGINT', gracefulShutdown);
process.on('SIGTERM', gracefulShutdown);

import SteamUser, { EResult } from 'steam-user';
import * as db from './config/db';

const clients = new Map<string, {
    client: SteamUser,
    acc: db.Account,
    idx: number,
    isLoggingIn: boolean,
    autoRestartTimeout: NodeJS.Timeout | null,
    isWaitingOnElsewhere: boolean
}>();

function stopBoosting(username: string): void {
    const entry = clients.get(username);
    if (entry) {
        logger.info(`[Account ${entry.idx}] Logging off ${username}`);
        if (entry.autoRestartTimeout) {
            clearTimeout(entry.autoRestartTimeout);
        }
        entry.client.logOff();
        clients.delete(username);
    }
}

function startBoosting(acc: db.Account, idx: number): void {
    if (clients.has(acc.username)) {
        logger.info(`[Account ${idx}] Login attempt for ${acc.username} is already in progress.`);
        return;
    }

    const client = new SteamUser({ renewRefreshTokens: true });
    const logPrefix = `[Account ${idx}]`;

    clients.set(acc.username, {
        client,
        acc,
        idx,
        isLoggingIn: true,
        autoRestartTimeout: null,
        isWaitingOnElsewhere: false
    });

    let logOnOptions: any;

    if (acc.refreshToken) {
        logOnOptions = { refreshToken: acc.refreshToken };
        logger.info(`${logPrefix} Logging in as ${acc.username} using refresh token.`);
    } else {
        logOnOptions = {
            accountName: acc.username,
            password: acc.password
        };
        logger.info(`${logPrefix} Logging in as ${acc.username} using password (refresh token not available).`);
    }

    client.logOn(logOnOptions);

    client.on('loggedOn', () => {
        const entry = clients.get(acc.username);
        if (entry) entry.isLoggingIn = false;

        logger.info(`${logPrefix} Logged in as ${acc.username}`);
        client.setPersona(acc.appear_offline ? SteamUser.EPersonaState.Offline : SteamUser.EPersonaState.Online);
        logger.info(`${logPrefix} Set status to ${acc.appear_offline ? 'Offline' : 'Online'}`);

        const gamesToPlay = acc.custom_title ? [acc.custom_title, ...acc.games] : acc.games;
        client.gamesPlayed(gamesToPlay);
        logger.info(`${logPrefix} Boosting games: ${JSON.stringify(gamesToPlay)}`);
    });

    client.on('refreshToken', (token) => {
        logger.info(`${logPrefix} Received new refresh token for ${acc.username}.`);
        db.updateRefreshToken(acc.username, token);
        acc.refreshToken = token;
    });

    client.on('error', (err: Error & { eresult?: EResult }) => {
        const entry = clients.get(acc.username);
        if (entry) {
            entry.isLoggingIn = false;
        }

        logger.error(`${logPrefix} Error: ${err.message}`, err);

        if (err.eresult === SteamUser.EResult.LoggedInElsewhere) {
            client.logOff();
            clients.delete(acc.username);

            if (acc.auto_restarter) {
                logger.info(`${logPrefix} Logged in elsewhere detected. Starting 45-minute wait before retrying.`);
                setTimeout(() => {
                    logger.info(`${logPrefix} 45 minutes have passed. Attempting to log in again.`);
                    startBoosting(acc, idx);
                }, 45 * 60 * 1000);
            } else {
                logger.info(`${logPrefix} Logged in elsewhere detected. Auto-restart is disabled, so not retrying.`);
            }
            return;
        }

        if (err.eresult === SteamUser.EResult.AccountLoginDeniedThrottle) {
            logger.warn(`${logPrefix} Login throttled. Auto-restart disabled for this session.`);
            if (entry) {
                acc.auto_restarter = false;
            }
        }
    });

    client.on('disconnected', (eresult, msg) => {
        const entry = clients.get(acc.username);
        const eresultString = SteamUser.EResult[eresult] || 'Unknown';
        logger.info(`${logPrefix} Disconnected from Steam. EResult: ${eresultString} (${eresult}), Msg: ${msg}`);

        if (!entry) {
            return;
        }

        clients.delete(acc.username);

        if (acc.auto_restarter) {
            logger.info(`${logPrefix} Auto-restarting in 10 seconds...`);
            setTimeout(() => startBoosting(acc, idx), 10000);
        }
    });
}

function updateBoosting(newAccounts: db.Account[]): void {
    const newAccountsMap = new Map(newAccounts.map(acc => [acc.username, acc]));
    const currentAccounts = new Map(Array.from(clients.values()).map(c => [c.acc.username, c.acc]));

    for (const username of currentAccounts.keys()) {
        if (!newAccountsMap.has(username)) {
            logger.info(`Account ${username} removed from database. Stopping boost.`);
            stopBoosting(username);
        }
    }

    newAccounts.forEach((newAcc, idx) => {
        const existingClient = clients.get(newAcc.username);
        const oldAcc = currentAccounts.get(newAcc.username);

        if (!existingClient) {
            logger.info(`New account ${newAcc.username} found in database. Starting boost.`);
            startBoosting(newAcc, idx + 1);
        } else if (oldAcc) {
            const needsRestart = oldAcc.password !== newAcc.password ||
                JSON.stringify(oldAcc.games) !== JSON.stringify(newAcc.games) ||
                oldAcc.appear_offline !== newAcc.appear_offline ||
                oldAcc.auto_restarter !== newAcc.auto_restarter ||
                oldAcc.custom_title !== newAcc.custom_title;

            if (needsRestart) {
                logger.info(`Configuration for ${newAcc.username} has changed. Restarting boost.`);
                stopBoosting(newAcc.username);
                startBoosting(newAcc, idx + 1);
            }
        }
    });
}

async function main() {
    logger.info('Starting Steam Hour Booster...');
    let accounts: db.Account[];
    try {
        accounts = db.getAccounts();
    } catch (e: any) {
        logger.error('CRITICAL: Failed to load accounts from the database. The file may be corrupted, unreadable, or was created with a different encryption key.', e);
        process.exit(1);
    }

    logger.info(`Loaded ${accounts.length} accounts from the database.`);
    updateBoosting(accounts);

    let lastAccountsJson = JSON.stringify(accounts);
    setInterval(() => {
        try {
            const newAccounts = db.getAccounts();
            const newAccountsJson = JSON.stringify(newAccounts);
            if (newAccountsJson !== lastAccountsJson) {
                logger.info('Database has changed. Reloading and applying changes...');
                updateBoosting(newAccounts);
                lastAccountsJson = newAccountsJson;
            }
        } catch (e: any) {
            logger.error(`Error polling for account changes: ${e.message}`, e);
        }
    }, 5000);
}

main();
