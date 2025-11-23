import { API } from '@discordjs/core/http-only';
import { REST } from 'discord.js';
import { listCommands } from './listCommands.js';

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN!);
const api = new API(rest);

const guildId = process.env.GUILD_ID;
const applicationId = process.env.APPLICATION_ID!;

if (!applicationId) {
	console.error('❌ Erro: APPLICATION_ID não encontrado no arquivo .env');
	process.exit(1);
}

// Get command names from command line arguments
const commandNamesToDelete = process.argv.slice(2);

async function deleteCommands() {
	try {
		// List existing commands first
		const existingCommands = await listCommands();

		if (existingCommands.length === 0) {
			console.log('✅ Não há comandos para deletar.');
			return;
		}

		if (commandNamesToDelete.length === 0) {
			// Delete all commands
			if (guildId) {
				console.log(`\n🔧 Modo DESENVOLVIMENTO (Guild ID: ${guildId})`);
				console.log(`🗑️  Deletando TODOS os comandos do servidor...`);

				await api.applicationCommands.bulkOverwriteGuildCommands(applicationId, guildId, []);

				console.log(`✅ Todos os comandos do servidor foram deletados!`);
				console.log(`⚡ Os comandos devem desaparecer INSTANTANEAMENTE no Discord!`);
			} else {
				console.log(`\n🌍 Modo PRODUÇÃO (comandos globais)`);
				console.log(`🗑️  Deletando TODOS os comandos globais...`);

				await api.applicationCommands.bulkOverwriteGlobalCommands(applicationId, []);

				console.log(`✅ Todos os comandos globais foram deletados!`);
				console.log(`⏱️  Nota: Pode levar até 1 hora para os comandos desaparecerem em todos os servidores`);
			}
		} else {
			// Delete specific commands
			console.log(`\n🗑️  Deletando comandos específicos: ${commandNamesToDelete.join(', ')}`);

			const commandsToKeep = existingCommands.filter((cmd) => !commandNamesToDelete.includes(cmd.name));

			const deletedCount = existingCommands.length - commandsToKeep.length;

			if (deletedCount === 0) {
				console.log('⚠️  Nenhum dos comandos especificados foi encontrado.');
				console.log('💡 Use o nome exato do comando (sem /)');
				return;
			}

			// Convert to command data format (remove id and other metadata)
			const commandsData = commandsToKeep.map((cmd) => {
				const data: Record<string, unknown> = {
					name: cmd.name,
					description: cmd.description,
					options: cmd.options,
					default_member_permissions: cmd.default_member_permissions,
				};
				// Add dm_permission if it exists
				if ('dm_permission' in cmd && cmd.dm_permission !== undefined && cmd.dm_permission !== null) {
					data.dm_permission = cmd.dm_permission;
				}
				return data;
			});

			if (guildId) {
				console.log(`🔧 Modo DESENVOLVIMENTO (Guild ID: ${guildId})`);
				await api.applicationCommands.bulkOverwriteGuildCommands(
					applicationId,
					guildId,
					commandsData as unknown as Parameters<typeof api.applicationCommands.bulkOverwriteGuildCommands>[2],
				);
				console.log(`✅ ${deletedCount} comando(s) deletado(s) do servidor!`);
				console.log(`⚡ Os comandos devem desaparecer INSTANTANEAMENTE no Discord!`);
			} else {
				console.log(`🌍 Modo PRODUÇÃO (comandos globais)`);
				await api.applicationCommands.bulkOverwriteGlobalCommands(
					applicationId,
					commandsData as unknown as Parameters<typeof api.applicationCommands.bulkOverwriteGlobalCommands>[1],
				);
				console.log(`✅ ${deletedCount} comando(s) deletado(s) globalmente!`);
				console.log(`⏱️  Nota: Pode levar até 1 hora para os comandos desaparecerem em todos os servidores`);
			}

			console.log(`📋 Comandos restantes: ${commandsToKeep.length}`);
			if (commandsToKeep.length > 0) {
				console.log(`   • ${commandsToKeep.map((c) => c.name).join(', ')}`);
			}
		}
	} catch (error) {
		console.error('❌ Erro ao deletar comandos:', error);
		process.exit(1);
	}
}

deleteCommands();
