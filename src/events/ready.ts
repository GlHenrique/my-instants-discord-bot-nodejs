import { Events } from 'discord.js';
import type { Event } from './index.js';

export default {
	name: Events.ClientReady,
	once: true,
	async execute(client) {
		console.log('\n✅ Bot is ONLINE and running!');
		console.log(`📱 Logged in as: ${client.user.tag}`);
		console.log(`🆔 Bot ID: ${client.user.id}`);
		console.log(`🌐 Servers: ${client.guilds.cache.size}`);
		console.log(`👥 Users: ${client.guilds.cache.reduce((acc, guild) => acc + guild.memberCount, 0)}`);
		console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
	},
} satisfies Event<Events.ClientReady>;
