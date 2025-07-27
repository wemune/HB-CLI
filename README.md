# HB-CLI - Steam Hour Booster

HB-CLI is a robust, command-line based utility for idling games on multiple Steam accounts simultaneously to accumulate hours. It is designed for headless operation on a server and managed via a secure, interactive command-line interface.

## Features

- **Multi-Account Support:** Boost hours on unlimited Steam accounts concurrently.
- **Headless & Non-Interactive:** The core booster is designed to run as a background service (e.g., with `pm2`) without requiring any manual input.
- **Secure:** All sensitive account information (passwords, refresh tokens) is encrypted at rest in the database using AES-256. It requires a secret key provided via an environment variable, ensuring secrets are never stored in plaintext.
- **Interactive Manager:** A user-friendly CLI for adding, editing, and removing accounts.
- **Dynamic Updates:** The booster automatically detects and applies changes made to the database without requiring a restart.
- **Robust Error Handling:** Includes built-in logic to handle common Steam errors, such as "Logged In Elsewhere" (with a configurable 45-minute cooldown) and connection issues.
- **Flexible Game Idling:** Idle up to 32 games simultaneously on each account.
- **Customizable Presence:** Set a custom game title to display on your Steam profile.
- **Privacy Control:** Choose to appear online or offline while idling.
- **Auto-Restart:** Automatically restart the booster if it crashes or the connection is lost.

## How It Works

The application is split into two main parts: the account manager and the booster.

1.  **Account Management:** You use the `npm run manage` script to launch an interactive command-line interface. This tool allows you to securely add, edit, or remove Steam accounts. All credentials are encrypted and stored in a local `hb-cli.db` SQLite database file.
2.  **Game ID Resolution:** To find the correct AppID for a game name, the manager queries the official Steam Web API. To avoid slow lookups, the entire list of Steam apps is downloaded and cached in an `applist.json` file, which is refreshed every 24 hours.
3.  **Encryption:** To keep your account details safe, all sensitive data (password and Steam refresh token) is encrypted using AES-256-CBC via Node.js's built-in `crypto` module. This requires a 32-character secret key that you must provide in a `.env` file.
4.  **Boosting Process:** The main booster, started with `npm start`, loads the accounts from the database. For each account, it uses the `steam-user` library to log in and idle the specified games.
5.  **Dynamic Reloading:** The booster automatically polls the database for changes every 5 seconds. If you use the manager to update account settings, the booster will detect the changes and automatically restart the session for the modified account without any downtime for other accounts.

## Installation

1.  **Clone the repository:**
    ```bash
    git clone https://github.com/wemune/HB-CLI
    cd hb-cli
    ```

2.  **Install dependencies:**
    ```bash
    npm install
    ```

3.  **Build the project:**
    This project is written in TypeScript and must be compiled to JavaScript before it can be run.
    ```bash
    npm run build
    ```
    This command compiles all the TypeScript files from the `src` directory and outputs the JavaScript files to the `dist` directory.

## Configuration

This application requires a secret key for database encryption. This key is provided via an environment variable.

1.  **Create a `.env` file:**
    Copy the example file to a new file named `.env`. This file is used for local development and is ignored by Git.
    ```bash
    cp .env.example .env
    ```

2.  **Set your secret key:**
    Open the `.env` file and replace the placeholder with your own secret key.
    **IMPORTANT:** The key MUST be exactly 32 characters long. You can generate a secure one using a password manager or a command-line tool like `openssl rand -base64 24`.

    ```ini
    # .env file
    HBCLI_DB_KEY=YOUR_32_CHARACTER_SECRET_KEY_HERE
    ```

## Usage

There are two main scripts: the account manager and the booster itself.

1.  **Manage Accounts:**
    Use the interactive manager to add, edit, or remove accounts.
    ```bash
    npm run manage
    ```

2.  **Run the Booster:**
    To start the booster process, use the `start` script. For long-term, reliable operation, it is highly recommended to use `pm2`.

    **Using `pm2` (Recommended):**
    ```bash
    # Start the application using the ecosystem file
    pm2 start ecosystem.config.js

    # To monitor logs
    pm2 logs hb-cli-booster

    # To make the process restart on server reboot
    pm2 startup
    pm2 save
    ```

    **Running directly:**
    ```bash
    npm start
    ```

## Project Structure

    hb-cli/
    ├── src/
    │   ├── index.ts            # Main booster process
    │   ├── manager.ts          # Interactive account manager
    │   └── config/
    │       ├── crypto.ts       # Handles AES-256 encryption/decryption
    │       ├── db.ts           # Manages the SQLite database
    │       └── logger.ts       # Simple file and console logger
    ├── dist/                   # Compiled JavaScript output
    ├── .env.example            # Example environment file
    ├── ecosystem.config.js     # PM2 process manager configuration
    ├── package.json
    └── tsconfig.json

## Key Dependencies

-   **[steam-user](https://github.com/DoctorMcKay/node-steam-user):** The core library for interacting with the Steam network.
-   **[better-sqlite3](https://github.com/WiseLibs/better-sqlite3):** For fast and simple SQLite database storage.
-   **[inquirer](https://github.com/SBoudrias/Inquirer.js):** Used to create the interactive command-line prompts for the account manager.
-   **[dotenv](https://github.com/motdotla/dotenv):** For loading the database encryption key from the `.env` file.

## License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.