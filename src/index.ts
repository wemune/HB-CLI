import 'dotenv/config';
import SteamUser, { EResult } from 'steam-user';
import * as db from './config/db';
import { log } from './config/logger';

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
        log(`[Account ${entry.idx}] Logging off ${username}`);
        if (entry.autoRestartTimeout) {
            clearTimeout(entry.autoRestartTimeout);
        }
        entry.client.logOff();
        clients.delete(username);
    }
}

function startBoosting(acc: db.Account, idx: number): void {
    if (clients.has(acc.username)) {
        log(`[Account ${idx}] Login attempt for ${acc.username} is already in progress.`);
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
        log(`${logPrefix} Logging in as ${acc.username} using refresh token.`);
    } else {
        logOnOptions = {
            accountName: acc.username,
            password: acc.password
        };
        log(`${logPrefix} Logging in as ${acc.username} using password (refresh token not available).`);
    }

    client.logOn(logOnOptions);

    client.on('loggedOn', () => {
        const entry = clients.get(acc.username);
        if (entry) entry.isLoggingIn = false;

        log(`${logPrefix} Logged in as ${acc.username}`);
        client.setPersona(acc.appear_offline ? SteamUser.EPersonaState.Offline : SteamUser.EPersonaState.Online);
        log(`${logPrefix} Set status to ${acc.appear_offline ? 'Offline' : 'Online'}`);

        const gamesToPlay = acc.custom_title ? [acc.custom_title, ...acc.games] : acc.games;
        client.gamesPlayed(gamesToPlay);
        log(`${logPrefix} Boosting games: ${JSON.stringify(gamesToPlay)}`);
    });

    client.on('refreshToken', (token) => {
        log(`${logPrefix} Received new refresh token for ${acc.username}.`);
        db.updateRefreshToken(acc.username, token);
        acc.refreshToken = token;
    });

    client.on('error', (err: Error & { eresult?: EResult }) => {
        const entry = clients.get(acc.username);
        if (entry) entry.isLoggingIn = false;

        log(`${logPrefix} Error: ${err.message}`);

        if (err.eresult === SteamUser.EResult.AccountLoginDeniedThrottle) {
            log(`${logPrefix} Login throttled. Auto-restart disabled for this session.`);
            if (entry) acc.auto_restarter = false;
        }
    });

    client.on('disconnected', (eresult, msg) => {
        const entry = clients.get(acc.username);
        const eresultString = SteamUser.EResult[eresult] || 'Unknown';
        log(`${logPrefix} Disconnected from Steam. EResult: ${eresultString} (${eresult}), Msg: ${msg}`);
        clients.delete(acc.username);

        if (eresult === SteamUser.EResult.LoggedInElsewhere) {
            log(`${logPrefix} Logged in elsewhere detected. Starting 45-minute wait before retrying.`);
            setTimeout(() => {
                log(`${logPrefix} 45 minutes have passed. Attempting to log in again.`);
                startBoosting(acc, idx);
            }, 45 * 60 * 1000);
            return;
        }

        if (acc.auto_restarter) {
            log(`${logPrefix} Auto-restarting in 10 seconds...`);
            const timeout = setTimeout(() => startBoosting(acc, idx), 10000);
            clients.set(acc.username, {
                client,
                acc,
                idx,
                isLoggingIn: false,
                autoRestartTimeout: timeout,
                isWaitingOnElsewhere: false
            });
        }
    });
}

function updateBoosting(newAccounts: db.Account[]): void {
    const newAccountsMap = new Map(newAccounts.map(acc => [acc.username, acc]));
    const currentAccounts = new Map(Array.from(clients.values()).map(c => [c.acc.username, c.acc]));

    for (const username of currentAccounts.keys()) {
        if (!newAccountsMap.has(username)) {
            log(`Account ${username} removed from database. Stopping boost.`);
            stopBoosting(username);
        }
    }

    newAccounts.forEach((newAcc, idx) => {
        const existingClient = clients.get(newAcc.username);
        const oldAcc = currentAccounts.get(newAcc.username);

        if (!existingClient) {
            log(`New account ${newAcc.username} found in database. Starting boost.`);
            startBoosting(newAcc, idx + 1);
        } else if (oldAcc) {
            const needsRestart = oldAcc.password !== newAcc.password ||
                JSON.stringify(oldAcc.games) !== JSON.stringify(newAcc.games) ||
                oldAcc.appear_offline !== newAcc.appear_offline ||
                oldAcc.auto_restarter !== newAcc.auto_restarter ||
                oldAcc.custom_title !== newAcc.custom_title;

            if (needsRestart) {
                log(`Configuration for ${newAcc.username} has changed. Restarting boost.`);
                stopBoosting(newAcc.username);
                startBoosting(newAcc, idx + 1);
            }
        }
    });
}

async function main() {
    log('Starting Steam Hour Booster...');
    let accounts: db.Account[];
    try {
        accounts = db.getAccounts();
    } catch (e: any) {
        log('CRITICAL: Failed to load accounts from the database. The file may be corrupted, unreadable, or was created with a different encryption key.');
        log(`Underlying error: ${e.message}`);
        process.exit(1);
    }

    log(`Loaded ${accounts.length} accounts from the database.`);
    updateBoosting(accounts);

    let lastAccountsJson = JSON.stringify(accounts);
    setInterval(() => {
        try {
            const newAccounts = db.getAccounts();
            const newAccountsJson = JSON.stringify(newAccounts);
            if (newAccountsJson !== lastAccountsJson) {
                log('Database has changed. Reloading and applying changes...');
                updateBoosting(newAccounts);
                lastAccountsJson = newAccountsJson;
            }
        } catch (e: any) {
            log(`Error polling for account changes: ${e.message}`);
        }
    }, 5000);
}

function gracefulShutdown() {
    log('Shutting down gracefully...');
    const allClients = Array.from(clients.keys());
    if (allClients.length === 0) {
        process.exit(0);
    }
    allClients.forEach(username => stopBoosting(username));
    setTimeout(() => {
        log('Graceful shutdown complete.');
        process.exit(0);
    }, 2000);
}

process.on('SIGINT', gracefulShutdown);
process.on('SIGTERM', gracefulShutdown);

main();
