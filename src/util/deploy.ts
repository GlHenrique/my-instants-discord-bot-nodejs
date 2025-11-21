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
	console.error('❌ Erro: APPLICATION_ID não encontrado no arquivo .env');
	process.exit(1);
}

let result;

if (guildId) {
	// Guild commands only for development
	console.log(`🔧 Modo DESENVOLVIMENTO ativado (Guild ID: ${guildId})`);
	console.log(`📤 Registrando ${commandData.length} comandos no servidor...`);

	result = await api.applicationCommands.bulkOverwriteGuildCommands(
		applicationId,
		guildId,
		commandData as Parameters<typeof api.applicationCommands.bulkOverwriteGuildCommands>[2],
	);

	console.log(`✅ Comandos registrados no servidor: ${result.length} comandos`);
	console.log(`⚡ Os comandos devem aparecer INSTANTANEAMENTE no Discord!`);
	console.log(`💡 Dica: Se não aparecerem, tente recarregar o Discord (Ctrl+R) ou sair/entrar do servidor`);
} else {
	// Global commands for production
	console.log(`🌍 Modo PRODUÇÃO ativado (comandos globais)`);
	console.log(`📤 Registrando ${commandData.length} comandos globalmente...`);

	result = await api.applicationCommands.bulkOverwriteGlobalCommands(applicationId, commandData);

	console.log(`✅ Comandos globais registrados: ${result.length} comandos`);
	console.log(`⏱️  Nota: Os comandos podem levar até 1 hora para aparecer em todos os servidores`);
	console.log(`💡 Para atualização instantânea, defina GUILD_ID no arquivo .env`);
}
