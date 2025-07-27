import winston from 'winston';
import path from 'path';

const LOG_PATH = path.join(process.cwd(), 'hb-cli.log');

const logger = winston.createLogger({
    level: 'info',
    format: winston.format.combine(
        winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        winston.format.errors({ stack: true }),
        winston.format.splat(),
        winston.format.json()
    ),
    transports: [
        new winston.transports.File({
            filename: LOG_PATH,
            format: winston.format.combine(
                winston.format.printf(info => `[${info.timestamp}] ${info.level.toUpperCase()}: ${info.message} ${info.stack ? `\n${info.stack}` : ''}`)
            )
        }),
        new winston.transports.Console({
            format: winston.format.combine(
                winston.format.colorize(),
                winston.format.printf(info => `[${info.timestamp}] ${info.level}: ${info.message}`)
            )
        })
    ]
});

export default logger;