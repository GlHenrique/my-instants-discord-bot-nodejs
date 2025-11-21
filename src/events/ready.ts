import { Events } from 'discord.js';
import type { Event } from './index.js';

export default {
	name: Events.ClientReady,
	once: true,
	async execute(client) {
		console.log('\n✅ Bot está ONLINE e rodando!');
		console.log(`📱 Logado como: ${client.user.tag}`);
		console.log(`🆔 ID do Bot: ${client.user.id}`);
		console.log(`🌐 Servidores: ${client.guilds.cache.size}`);
		console.log(`👥 Usuários: ${client.guilds.cache.reduce((acc, guild) => acc + guild.memberCount, 0)}`);
		console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
	},
} satisfies Event<Events.ClientReady>;
