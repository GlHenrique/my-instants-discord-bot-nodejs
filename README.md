# MyInstants Discord Bot

A Discord bot that searches and plays audio from [myinstants.com](https://www.myinstants.com) in voice channels.

## Features

- 🔍 Searches and plays sounds from myinstants.com
- 🔊 Plays audio directly in Discord voice channels
- 📋 **Playback queue system** - add multiple audio files that will be played sequentially
- ⏱️ Automatically disconnects after 5 minutes of inactivity
- ♻️ Reuses voice connections for better performance
- 🛠️ Command management tools (list and delete)

## Tech Stack

- **TypeScript** - Type-safe JavaScript
- **Discord.js** - Discord API wrapper
- **@discordjs/voice** - Voice connection handling
- **Cheerio** - HTML parsing for web scraping
- **Axios** - HTTP client
- **FFmpeg** - Audio processing

## Requirements

- Node.js >= 22.12.0
- Discord Bot Token
- Bot permissions: Connect, Speak, View Channel

## Installation

1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```
3. Create a `.env` file with your Discord bot token:
   ```
   DISCORD_TOKEN=your_token_here
   APPLICATION_ID=your_application_id
   GUILD_ID=your_guild_id (optional, for testing)
   ```
4. Build the project:
   ```bash
   npm run build
   ```
5. Deploy commands:
   ```bash
   npm run deploy
   ```
6. Start the bot:
   ```bash
   npm start
   ```

## Commands

### `/mi`

Searches and plays audio from myinstants.com in voice channels.

**Parameters:**

- `input` (required): Search term for the audio

**How to use:**

1. Join a voice channel
2. Use `/mi input: <search term>`
3. The bot will search for the audio and add it to the playback queue

**Example:**

```
/mi input: door
```

**Behavior:**

- If nothing is playing, the audio will play immediately
- If something is already playing, the audio will be added to the queue and played in sequence
- The queue position will be informed when the audio is added

### `/clear`

Clears the playback queue and stops the current audio.

**How to use:**

```
/clear
```

**Behavior:**

- Stops the current playback
- Removes all audio from the queue
- Useful when you want to stop everything and start fresh

### `/ping`

Checks the bot's latency with Discord.

**How to use:**

```
/ping
```

**Response:**
Shows the response time in milliseconds (ms).

### `/user`

Shows information about the user who executed the command.

**How to use:**

```
/user
```

**Response:**
Displays the username of who executed the command.

## NPM Scripts

### Command Management

#### `npm run list-commands`

Lists all commands registered on Discord.

**Usage:**

```bash
npm run list-commands
```

**Behavior:**

- If `GUILD_ID` is set in `.env`, lists server commands (development mode)
- If not set, lists global commands (production mode)
- Shows the name and ID of each command

#### `npm run delete-commands`

Deletes commands from Discord.

**Usage:**

```bash
# Delete all commands
npm run delete-commands

# Delete specific commands
npm run delete-commands ping user
```

**Behavior:**

- No arguments: deletes **all** commands
- With arguments: deletes only the specified commands
- Development mode: commands disappear instantly
- Production mode: may take up to 1 hour to propagate

**Examples:**

```bash
# Delete all commands
npm run delete-commands

# Delete only 'ping' and 'user' commands
npm run delete-commands ping user
```

### Other Scripts

#### `npm run deploy`

Registers all commands on Discord.

**Usage:**

```bash
npm run deploy
```

**Behavior:**

- Registers commands on the server if `GUILD_ID` is set (development)
- Registers commands globally if not set (production)
- Should be run after creating or modifying commands

#### `npm run build`

Compiles TypeScript code to JavaScript.

**Usage:**

```bash
npm run build
```

#### `npm start`

Starts the bot.

**Usage:**

```bash
npm start
```

#### `npm run dev`

Starts the bot in development mode with auto-reload (nodemon).

**Usage:**

```bash
npm run dev
```

## Playback Queue System

The bot has a queue system that allows adding multiple audio files that will be played sequentially:

- **Per-server queue**: Each server has its own independent queue
- **Sequential playback**: Audio files are played in the order they were added
- **Add during playback**: You can add new audio files while another is playing
- **Visual feedback**: The bot informs the queue position when an audio is added
- **Automatic cleanup**: The bot automatically disconnects after 5 minutes of inactivity when the queue is empty

**Usage example:**

```
1. User 1: /mi input: door
   → Audio "door" starts playing immediately

2. User 2: /mi input: horse
   → Audio "horse" is added to the queue (position 1)

3. User 3: /mi input: laugh
   → Audio "laugh" is added to the queue (position 2)

4. When "door" ends, "horse" plays automatically
5. When "horse" ends, "laugh" plays automatically
```

## Development

```bash
# Development mode with auto-reload
npm run dev

# Format code
npm run format

# Lint code
npm run lint

# List registered commands
npm run list-commands

# Delete commands (all or specific)
npm run delete-commands
npm run delete-commands ping user
```
