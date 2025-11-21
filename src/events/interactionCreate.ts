import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { Events } from 'discord.js';
import { loadCommands } from '../util/loaders.js';
import type { Event } from './index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const commandsDir = join(__dirname, '../commands');

const commands = await loadCommands(commandsDir);
console.log(`📋 Comandos carregados: ${[...commands.keys()].join(', ')}`);

export default {
	name: Events.InteractionCreate,
	async execute(interaction) {
		if (interaction.isChatInputCommand()) {
			console.log(`🔔 Comando recebido: /${interaction.commandName}`);
			const command = commands.get(interaction.commandName);

			if (!command) {
				console.error(
					`❌ Comando '${interaction.commandName}' não encontrado. Comandos disponíveis: ${[...commands.keys()].join(', ')}`,
				);
				await interaction.reply({ content: `Comando não encontrado!`, ephemeral: true });
				return;
			}

			try {
				await command.execute(interaction);
			} catch (error) {
				console.error(`❌ Erro ao executar comando ${interaction.commandName}:`, error);
				if (!interaction.replied && !interaction.deferred) {
					await interaction.reply({ content: 'Ocorreu um erro ao executar este comando!', ephemeral: true });
				}
			}
		}
	},
} satisfies Event<Events.InteractionCreate>;
