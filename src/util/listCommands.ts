import { API } from '@discordjs/core/http-only';
import { REST } from 'discord.js';
import { fileURLToPath } from 'node:url';

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN!);
const api = new API(rest);

const guildId = process.env.GUILD_ID;
const applicationId = process.env.APPLICATION_ID!;

// Check if this file is being run directly (via npm script or directly)
const currentFile = fileURLToPath(import.meta.url);
const mainFile = process.argv[1];
const isMainModule =
	mainFile?.includes('listCommands.js') || mainFile?.includes('listCommands') || currentFile === mainFile;

export async function listCommands() {
	try {
		let commands;
		if (guildId) {
			commands = await api.applicationCommands.getGuildCommands(applicationId, guildId);
		} else {
			commands = await api.applicationCommands.getGlobalCommands(applicationId);
		}

		if (commands.length === 0) {
			console.log('📋 Nenhum comando registrado.');
			return [];
		}

		console.log('📋 Comandos registrados:');
		commands.forEach((cmd) => {
			console.log(`   • ${cmd.name} (ID: ${cmd.id})`);
		});
		return commands;
	} catch (error) {
		console.error('❌ Erro ao listar comandos:', error);
		return [];
	}
}

if (isMainModule) {
	if (!applicationId) {
		console.error('❌ Erro: APPLICATION_ID não encontrado no arquivo .env');
		process.exit(1);
	}

	console.log('📋 Listando comandos...');
	if (guildId) {
		console.log(`🔧 Modo DESENVOLVIMENTO (Guild ID: ${guildId})`);
	} else {
		console.log(`🌍 Modo PRODUÇÃO (comandos globais)`);
	}
	listCommands().catch((error) => {
		console.error('❌ Erro ao executar listagem:', error);
		process.exit(1);
	});
}
