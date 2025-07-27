import 'dotenv/config';
import inquirer from 'inquirer';
import SteamUser from 'steam-user';
import * as db from './config/db';
import log from './config/logger';
import fs from 'fs';
import path from 'path';

const APP_LIST_CACHE_PATH = path.join(process.cwd(), 'applist.json');
const APP_LIST_API_URL = 'https://api.steampowered.com/ISteamApps/GetAppList/v2/';
const CACHE_DURATION_HOURS = 24;

interface SteamApp {
    appid: number;
    name: string;
}

let appListCache: SteamApp[] | null = null;

async function getAppList(): Promise<SteamApp[]> {
    if (appListCache) {
        return appListCache;
    }

    const cacheExists = fs.existsSync(APP_LIST_CACHE_PATH);
    let isCacheValid = false;

    if (cacheExists) {
        const stats = fs.statSync(APP_LIST_CACHE_PATH);
        const hoursSinceModified = (new Date().getTime() - stats.mtime.getTime()) / (1000 * 60 * 60);
        if (hoursSinceModified < CACHE_DURATION_HOURS) {
            isCacheValid = true;
        }
    }

    if (isCacheValid) {
        log.info('Loading Steam app list from cache...');
        const fileContent = fs.readFileSync(APP_LIST_CACHE_PATH, 'utf-8');
        appListCache = JSON.parse(fileContent);
        return appListCache!;
    } else {
        log.info('Fetching updated Steam app list from API...');
        try {
            const response = await fetch(APP_LIST_API_URL);
            if (!response.ok) {
                throw new Error(`Failed to fetch app list: ${response.statusText}`);
            }
            const data = await response.json() as { applist: { apps: SteamApp[] } };
            appListCache = data.applist.apps;
            fs.writeFileSync(APP_LIST_CACHE_PATH, JSON.stringify(appListCache));
            log.info('App list updated and cached.');
            return appListCache!;
        } catch (e: any) {
            log.error(`Error fetching app list: ${e.message}`);
            if (cacheExists) {
                log.info('Using stale cache as a fallback.');
                const fileContent = fs.readFileSync(APP_LIST_CACHE_PATH, 'utf-8');
                appListCache = JSON.parse(fileContent);
                return appListCache!;
            }
            throw new Error('Failed to get app list and no cache is available.');
        }
    }
}

async function resolveGameIds(input: string): Promise<number[]> {
    if (!input) return [];
    const items = input.split(',').map(x => x.trim().toLowerCase()).filter(Boolean);
    const ids: number[] = [];
    
    if (items.length === 0) return [];

    const appList = await getAppList();
    log.info(`Resolving app IDs for: ${items.join(', ')}`);

    for (const item of items) {
        if (/^\d+$/.test(item)) {
            ids.push(Number(item));
        } else {
            const foundApp = appList.find(app => app.name.toLowerCase() === item);
            if (foundApp) {
                ids.push(foundApp.appid);
                log.info(`Resolved "${item}" to appid ${foundApp.appid}`);
            } else {
                log.warn(`Could not resolve "${item}" to an appid.`);
            }
        }
    }
    return ids;
}

async function addAccount() {
    const answers = await inquirer.prompt([
        { type: 'input', name: 'username', message: 'Steam username:' },
        { type: 'password', name: 'password', message: 'Steam password:', mask: '*' },
        { type: 'input', name: 'games', message: 'Game IDs or names to boost (comma separated):' },
        { type: 'input', name: 'custom_title', message: 'Custom title (optional, press enter to skip):' },
        { type: 'confirm', name: 'appear_offline', message: 'Appear offline?', default: false },
        { type: 'confirm', name: 'auto_restarter', message: 'Enable auto-restart on disconnect?', default: true }
    ]);

    const client = new SteamUser();
    log.info(`Attempting to log in as ${answers.username} to get refresh token...`);

    client.logOn({
        accountName: answers.username,
        password: answers.password
    });

    client.on('steamGuard', async (domain, callback) => {
        const { code } = await inquirer.prompt([{
            type: 'input',
            name: 'code',
            message: `Enter Steam Guard code${domain ? ` from email (${domain})` : ' from authenticator'}:`
        }]);
        callback(code);
    });

    client.on('error', (err) => {
        log.error(`Failed to get refresh token: ${err.message}`);
        mainMenu();
    });

    client.on('loggedOn', () => {
        log.info('Successfully logged on, waiting for refresh token...');
    });

    client.on('refreshToken', async (token) => {
        log.info('New refresh token received. Saving account...');
        const games = await resolveGameIds(answers.games);
        db.saveAccount({
            username: answers.username,
            password: answers.password,
            games,
            custom_title: answers.custom_title || null,
            appear_offline: answers.appear_offline,
            auto_restarter: answers.auto_restarter,
            refreshToken: token
        });
        log.info(`Account for ${answers.username} has been saved successfully.`);
        process.exit(0);
    });
}

async function editAccount() {
    const accounts = db.getAccounts();
    if (accounts.length === 0) {
        log.info('No accounts to edit.');
        return;
    }

    const { username } = await inquirer.prompt([{
        type: 'list',
        name: 'username',
        message: 'Select account to edit:',
        choices: accounts.map(acc => acc.username)
    }]);

    const acc = accounts.find(a => a.username === username)!;

    const prompts = [
        { name: 'password', message: 'New password (leave blank to keep current):', type: 'password', mask: '*' },
        { name: 'games', message: 'Game IDs/names:', type: 'input', default: acc.games.join(',') },
        { name: 'custom_title', message: 'Custom title:', type: 'input', default: acc.custom_title || '' },
        { name: 'appear_offline', message: 'Appear offline?', type: 'confirm', default: acc.appear_offline },
        { name: 'auto_restarter', message: 'Auto restarter?', type: 'confirm', default: acc.auto_restarter }
    ];

    const updates = await inquirer.prompt(prompts as any);
    const editFields: Partial<db.Account> = {};

    if (updates.password) {
        editFields.password = updates.password;
    }
    if (updates.games !== acc.games.join(',')) {
        editFields.games = await resolveGameIds(updates.games);
    }
    if (updates.custom_title !== (acc.custom_title || '')) {
        editFields.custom_title = updates.custom_title || null;
    }
    if (updates.appear_offline !== acc.appear_offline) {
        editFields.appear_offline = updates.appear_offline;
    }
    if (updates.auto_restarter !== acc.auto_restarter) {
        editFields.auto_restarter = updates.auto_restarter;
    }

    if (Object.keys(editFields).length > 0) {
        db.editAccount(username, editFields);
        log.info('Account updated successfully.');
    } else {
        log.info('No changes were made.');
    }
}

async function removeAccount() {
    const accounts = db.getAccounts();
    if (accounts.length === 0) {
        log.info('No accounts to remove.');
        return;
    }

    const { username } = await inquirer.prompt([{
        type: 'list',
        name: 'username',
        message: 'Select account to remove:',
        choices: accounts.map(acc => acc.username)
    }]);

    const { confirm } = await inquirer.prompt([{
        type: 'confirm',
        name: 'confirm',
        message: `Are you sure you want to remove the account "${username}"? This cannot be undone.`,
        default: false
    }]);

    if (confirm) {
        db.deleteAccount(username);
        log.info('Account removed successfully.');
    } else {
        log.info('Account removal cancelled.');
    }
}

async function mainMenu() {
    const { action } = await inquirer.prompt([{
        type: 'list',
        name: 'action',
        message: 'Account Manager',
        choices: ['Add Account', 'Edit Account', 'Remove Account', 'Exit']
    }]);

    switch (action) {
        case 'Add Account':
            await addAccount();
            break;
        case 'Edit Account':
            await editAccount();
            mainMenu();
            break;
        case 'Remove Account':
            await removeAccount();
            mainMenu();
            break;
        case 'Exit':
            process.exit(0);
    }
}

mainMenu();