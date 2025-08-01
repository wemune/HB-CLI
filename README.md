# HB-CLI - Steam Hour Booster (Docker Edition)

HB-CLI is a robust, command-line based utility for idling games on multiple Steam accounts simultaneously to accumulate hours. This version is designed to run seamlessly inside a Docker container, making setup and deployment simple and consistent across any environment.

## Features

- **Multi-Account Support:** Boost hours on unlimited Steam accounts concurrently.
- **Containerized & Headless:** Runs as a lightweight, isolated Docker container, perfect for servers.
- **Secure:** All sensitive account information (passwords, refresh tokens) is encrypted at rest using AES-256. It requires a secret key provided via an environment variable, ensuring secrets are never stored in plaintext.
- **Interactive Manager:** A user-friendly CLI for adding, editing, and removing accounts, accessible via a simple Docker command.
- **Dynamic Updates:** The booster automatically detects and applies changes made to the database without requiring a restart.
- **Robust Error Handling:** Includes built-in logic to handle common Steam errors and connection issues.
- **Flexible Game Idling:** Idle up to 32 games simultaneously on each account.
- **Customizable Presence:** Set a custom game title to display on your Steam profile.
- **Privacy Control:** Choose to appear online or offline while idling.

## How It Works

The application is split into two main parts: the account manager and the booster, both running inside Docker.

1.  **Account Management:** You use the `docker compose run --rm app npm run manage` command to launch an interactive CLI. This tool allows you to securely add, edit, or remove Steam accounts. All credentials are encrypted and stored in a local `hb-cli.db` SQLite database file, which is mounted into the container.
2.  **Game ID Resolution:** To find the correct AppID for a game name, the manager queries the official Steam Web API. To avoid slow lookups, the entire list of Steam apps is downloaded and cached in an `applist.json` file, which is refreshed every 24 hours.
3.  **Encryption:** To keep your account details safe, all sensitive data is encrypted using AES-256-CBC. This requires a 32-character secret key that you must provide in a `.env` file.
4.  **Boosting Process:** The main booster, started with `docker compose up`, loads the accounts from the database. For each account, it uses the `steam-user` library to log in and idle the specified games.
5.  **Dynamic Reloading:** The booster automatically polls the database for changes. If you use the manager to update account settings, the booster will detect the changes and automatically restart the session for the modified account without any downtime for other accounts.

## Installation & Setup

This project is designed to be run with Docker and Docker Compose.

1.  **Install Docker:**
    Ensure you have Docker and Docker Compose installed on your system. Follow the official instructions for your operating system:
    -   [Install Docker Engine](https://docs.docker.com/engine/install/)
    -   [Install Docker Compose](https://docs.docker.com/compose/install/) (Note: Docker Compose is included with Docker Desktop for Windows and Mac).

2.  **Clone the repository:**
    ```bash
    git clone https://github.com/wemune/HB-CLI
    cd HB-CLI
    ```

3.  **Create the Environment File:**
    Copy the example `.env` file. This file is used to store your secret key and is ignored by Git.
    ```bash
    cp .env.example .env
    ```

4.  **Set Your Secret Key:**
    Open the `.env` file and replace the placeholder with your own secret key.
    **IMPORTANT:** The key MUST be exactly 32 characters long. You can generate a secure one using a password manager or a command-line tool like `openssl rand -base64 24`.

    ```ini
    # .env file
    HBCLI_DB_KEY=YOUR_32_CHARACTER_SECRET_KEY_HERE
    ```

## Usage

All commands are run from the root of the project directory.

1.  **Build and Start the Booster:**
    This command will build the Docker image for the first time and start the application in the background.
    ```bash
    docker compose up --build -d
    ```
    Your booster is now running. The `restart: always` policy in the `compose.yml` file ensures it will restart automatically if it crashes or the server reboots.

2.  **Manage Accounts:**
    To add, edit, or remove accounts, use the interactive manager. This command runs the manager script in a temporary container.
    ```bash
    docker compose run --rm app npm run manage
    ```
    The `--rm` flag is important as it automatically removes the container after the script exits, keeping your system clean.

3.  **View Logs:**
    To see the live logs from the booster, use:
    ```bash
    docker compose logs -f
    ```

4.  **Stop the Booster:**
    To stop the application and shut down the container, use:
    ```bash
    docker compose down
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
    ├── .env                    # Local environment variables (ignored by Git)
    ├── .env.example            # Example environment file
    ├── .gitignore              # Specifies intentionally untracked files to ignore
    ├── compose.yml             # Docker Compose configuration
    ├── Dockerfile              # Defines the Docker image for the application
    ├── hb-cli.db               # SQLite database file (created on first run, gitignored)
    ├── hb-cli.log              # Log file (created on first run, gitignored)
    ├── package.json
    └── tsconfig.json

## Key Dependencies

-   **[steam-user](https://github.com/DoctorMcKay/node-steam-user):** The core library for interacting with the Steam network.
-   **[better-sqlite3](https://github.com/WiseLibs/better-sqlite3):** For fast and simple SQLite database storage.
-   **[inquirer](https://github.com/SBoudrias/Inquirer.js):** Used to create the interactive command-line prompts for the account manager.
-   **[dotenv](https://github.com/motdotla/dotenv):** For loading the database encryption key from the `.env` file.

## License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.
