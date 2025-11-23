import type { Command } from './index.js';
import { audioQueue } from '../util/audioQueue.js';

export default {
	data: {
		name: 'clear',
		description: 'Clear audio queue.',
	},
	async execute(interaction) {
		if (!interaction.guildId) {
			await interaction.reply(`This command can only be used in a guild.`);
			return;
		}
		audioQueue.stop(interaction.guildId);
		await interaction.reply(`Audio queue cleared.`);
	},
} satisfies Command;
