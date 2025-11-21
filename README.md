# MyInstants Discord Bot

A Discord bot that searches and plays audio from [myinstants.com](https://www.myinstants.com) in voice channels.

## Features

- 🔍 Search for sounds using `/search` command
- 🔊 Play sounds directly in Discord voice channels
- ⏱️ Automatically disconnects after 5 minutes of inactivity
- ♻️ Reuses voice connections for better performance

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

## Usage

Join a voice channel and use the `/search` command with a query to search and play sounds from myinstants.com.

## Development

```bash
# Development mode with auto-reload
npm run dev

# Format code
npm run format

# Lint code
npm run lint
```

