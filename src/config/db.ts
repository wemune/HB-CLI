import Database from 'better-sqlite3';
import path from 'path';
import { encrypt, decrypt } from './crypto';

const DB_PATH = path.join(process.cwd(), 'hb-cli.db');
const db = new Database(DB_PATH);

db.prepare(`
  CREATE TABLE IF NOT EXISTS accounts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    games TEXT NOT NULL,
    custom_title TEXT,
    appear_offline INTEGER DEFAULT 0,
    auto_restarter INTEGER DEFAULT 1,
    refresh_token TEXT
  )
`).run();

export interface Account {
    id?: number;
    username: string;
    password?: string;
    games: number[];
    custom_title: string | null;
    appear_offline: boolean;
    auto_restarter: boolean;
    refreshToken: string | null;
}

export function getAccounts(): Account[] {
    const rows = db.prepare('SELECT * FROM accounts').all() as any[];
    return rows.map(acc => {
        try {
            return {
                ...acc,
                password: acc.password ? decrypt(acc.password) : undefined,
                games: acc.games ? JSON.parse(decrypt(acc.games)) : [],
                custom_title: acc.custom_title ? decrypt(acc.custom_title) : null,
                appear_offline: !!acc.appear_offline,
                auto_restarter: !!acc.auto_restarter,
                refreshToken: acc.refresh_token ? decrypt(acc.refresh_token) : null
            };
        } catch (e) {
            log(`Could not decrypt account data for ${acc.username}. It may be corrupted or from an old, unencrypted database. Skipping.`);
            return null;
        }
    }).filter((acc): acc is Account => acc !== null);
}

export function saveAccount(account: Omit<Account, 'id'>): void {
    db.prepare(`
        INSERT INTO accounts (username, password, games, custom_title, appear_offline, auto_restarter, refresh_token)
        VALUES (@username, @password, @games, @custom_title, @appear_offline, @auto_restarter, @refreshToken)
        ON CONFLICT(username) DO UPDATE SET
            password=excluded.password,
            games=excluded.games,
            custom_title=excluded.custom_title,
            appear_offline=excluded.appear_offline,
            auto_restarter=excluded.auto_restarter,
            refresh_token=excluded.refresh_token
    `).run({
        username: account.username,
        password: account.password ? encrypt(account.password) : null,
        games: encrypt(JSON.stringify(account.games)),
        custom_title: account.custom_title ? encrypt(account.custom_title) : null,
        appear_offline: account.appear_offline ? 1 : 0,
        auto_restarter: account.auto_restarter ? 1 : 0,
        refreshToken: account.refreshToken ? encrypt(account.refreshToken) : null
    });
}

export function updateRefreshToken(username: string, refreshToken: string | null): void {
    const encryptedToken = refreshToken ? encrypt(refreshToken) : null;
    db.prepare('UPDATE accounts SET refresh_token = ? WHERE username = ?').run(encryptedToken, username);
}

export function deleteAccount(username: string): void {
    db.prepare('DELETE FROM accounts WHERE username = ?').run(username);
}

export function editAccount(username: string, updates: Partial<Account>): void {
    const fields = [];
    const values = [];

    for (let [key, value] of Object.entries(updates)) {
        if (value === undefined) continue;

        let dbKey = key;
        let dbValue: any = value;

        if (key === 'password' && typeof value === 'string') dbValue = encrypt(value);
        if (key === 'games' && Array.isArray(value)) dbValue = encrypt(JSON.stringify(value));
        if (key === 'custom_title' && typeof value === 'string') dbValue = encrypt(value);
        if (key === 'refreshToken' && typeof value === 'string') dbValue = encrypt(value);
        
        if (key === 'refreshToken') dbKey = 'refresh_token';
        if (key === 'customTitle') dbKey = 'custom_title';
        if (key === 'appearOffline') dbKey = 'appear_offline';
        if (key === 'autoRestarter') dbKey = 'auto_restarter';

        if (typeof value === 'boolean') {
            dbValue = value ? 1 : 0;
        }

        fields.push(`${dbKey} = ?`);
        values.push(dbValue);
    }

    if (fields.length === 0) return;

    values.push(username);
    db.prepare(`UPDATE accounts SET ${fields.join(', ')} WHERE username = ?`).run(...values);
}

function log(message: string) {
    console.log(`[${new Date().toISOString()}] [DB] ${message}`);
}

process.on('exit', () => db.close());
process.on('SIGHUP', () => process.exit(128 + 1));
process.on('SIGINT', () => process.exit(128 + 2));
process.on('SIGTERM', () => process.exit(128 + 15));