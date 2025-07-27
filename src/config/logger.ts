import fs from 'fs';
import path from 'path';

const LOG_PATH = path.join(process.cwd(), 'hb-cli.log');

export function log(message: string): void {
    const timestamp = new Date().toISOString();
    const logLine = `[${timestamp}] ${message}`;

    console.log(logLine);

    try {
        fs.appendFileSync(LOG_PATH, logLine + '\n', { encoding: 'utf8' });
    } catch (error) {
        console.log(`[${timestamp}] Failed to write to log file: ${error}`);
    }
}
