import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { Client, Events, GatewayIntentBits } from 'discord.js';
import { loadEvents } from './util/loaders.js';

console.log('🚀 Starting Discord bot...');

// Initialize the client
const client = new Client({
	intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates],
});

// Load the events and commands
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const eventsDir = join(__dirname, 'events');
const events = await loadEvents(eventsDir);
console.log(`✅ ${events.length} event(s) loaded`);

// Register the event handlers
for (const event of events) {
	client[event.once ? 'once' : 'on'](event.name, async (...args) => {
		try {
			await event.execute(...args);
		} catch (error) {
			console.error(`Error executing event ${String(event.name)}:`, error);
		}
	});
}

// Handle login errors
client.on('error', (error) => {
	console.error('❌ Discord client error:', error);
});

client.on('warn', (warning) => {
	console.warn('⚠️ Discord warning:', warning);
});

client.once(Events.ClientReady, (client) => {
	console.log(`Ready! Logged in as ${client.user.tag}`);
});

// Login to the client
if (!process.env.DISCORD_TOKEN) {
	console.error('❌ Error: DISCORD_TOKEN not found in .env file');
	process.exit(1);
}

console.log('🔐 Connecting to Discord...');
void client.login(process.env.DISCORD_TOKEN);
