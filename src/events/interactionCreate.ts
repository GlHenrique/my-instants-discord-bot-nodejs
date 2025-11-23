import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { Events } from 'discord.js';
import { loadCommands } from '../util/loaders.js';
import type { Event } from './index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const commandsDir = join(__dirname, '../commands');

const commands = await loadCommands(commandsDir);
console.log(`📋 Commands loaded: ${[...commands.keys()].join(', ')}`);

export default {
	name: Events.InteractionCreate,
	async execute(interaction) {
		if (interaction.isChatInputCommand()) {
			console.log(`🔔 Command received: /${interaction.commandName}`);
			const command = commands.get(interaction.commandName);

			if (!command) {
				console.error(
					`❌ Command '${interaction.commandName}' not found. Available commands: ${[...commands.keys()].join(', ')}`,
				);
				await interaction.reply({ content: `Command not found!`, ephemeral: true });
				return;
			}

			try {
				await command.execute(interaction);
			} catch (error) {
				console.error(`❌ Error executing command ${interaction.commandName}:`, error);
				if (!interaction.replied && !interaction.deferred) {
					await interaction.reply({ content: 'An error occurred while executing this command!', ephemeral: true });
				}
			}
		}
	},
} satisfies Event<Events.InteractionCreate>;
