import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { API } from '@discordjs/core/http-only';
import { REST } from 'discord.js';
import { loadCommands } from './loaders.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const commandsDir = join(__dirname, '../commands');

const commands = await loadCommands(commandsDir);
const commandData = [...commands.values()].map((command) => command.data);

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN!);
const api = new API(rest);

const guildId = process.env.GUILD_ID;
const applicationId = process.env.APPLICATION_ID!;

if (!applicationId) {
	console.error('❌ Error: APPLICATION_ID not found in .env file');
	process.exit(1);
}

let result;

if (guildId) {
	// Guild commands only for development
	console.log(`🔧 DEVELOPMENT mode activated (Guild ID: ${guildId})`);
	console.log(`📤 Registering ${commandData.length} commands on the server...`);

	result = await api.applicationCommands.bulkOverwriteGuildCommands(
		applicationId,
		guildId,
		commandData as Parameters<typeof api.applicationCommands.bulkOverwriteGuildCommands>[2],
	);

	console.log(`✅ Commands registered on the server: ${result.length} commands`);
	console.log(`⚡ Commands should appear INSTANTLY on Discord!`);
	console.log(`💡 Tip: If they don't appear, try reloading Discord (Ctrl+R) or leaving/joining the server`);
} else {
	// Global commands for production
	console.log(`🌍 PRODUCTION mode activated (global commands)`);
	console.log(`📤 Registering ${commandData.length} commands globally...`);

	result = await api.applicationCommands.bulkOverwriteGlobalCommands(applicationId, commandData);

	console.log(`✅ Global commands registered: ${result.length} commands`);
	console.log(`⏱️  Note: Commands may take up to 1 hour to appear on all servers`);
	console.log(`💡 For instant updates, set GUILD_ID in the .env file`);
}
