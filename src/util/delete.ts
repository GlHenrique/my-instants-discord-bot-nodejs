import { API } from '@discordjs/core/http-only';
import { REST } from 'discord.js';
import { listCommands } from './listCommands.js';

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN!);
const api = new API(rest);

const guildId = process.env.GUILD_ID;
const applicationId = process.env.APPLICATION_ID!;

if (!applicationId) {
	console.error('❌ Error: APPLICATION_ID not found in .env file');
	process.exit(1);
}

// Get command names from command line arguments
const commandNamesToDelete = process.argv.slice(2);

async function deleteCommands() {
	try {
		// List existing commands first
		const existingCommands = await listCommands();

		if (existingCommands.length === 0) {
			console.log('✅ No commands to delete.');
			return;
		}

		if (commandNamesToDelete.length === 0) {
			// Delete all commands
			if (guildId) {
				console.log(`\n🔧 DEVELOPMENT mode (Guild ID: ${guildId})`);
				console.log(`🗑️  Deleting ALL server commands...`);

				await api.applicationCommands.bulkOverwriteGuildCommands(applicationId, guildId, []);

				console.log(`✅ All server commands deleted!`);
				console.log(`⚡ Commands should disappear INSTANTLY on Discord!`);
			} else {
				console.log(`\n🌍 PRODUCTION mode (global commands)`);
				console.log(`🗑️  Deleting ALL global commands...`);

				await api.applicationCommands.bulkOverwriteGlobalCommands(applicationId, []);

				console.log(`✅ All global commands deleted!`);
				console.log(`⏱️  Note: It may take up to 1 hour for commands to disappear on all servers`);
			}
		} else {
			// Delete specific commands
			console.log(`\n🗑️  Deleting specific commands: ${commandNamesToDelete.join(', ')}`);

			const commandsToKeep = existingCommands.filter((cmd) => !commandNamesToDelete.includes(cmd.name));

			const deletedCount = existingCommands.length - commandsToKeep.length;

			if (deletedCount === 0) {
				console.log('⚠️  None of the specified commands were found.');
				console.log('💡 Use the exact command name (without /)');
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
				console.log(`🔧 DEVELOPMENT mode (Guild ID: ${guildId})`);
				await api.applicationCommands.bulkOverwriteGuildCommands(
					applicationId,
					guildId,
					commandsData as unknown as Parameters<typeof api.applicationCommands.bulkOverwriteGuildCommands>[2],
				);
				console.log(`✅ ${deletedCount} command(s) deleted from server!`);
				console.log(`⚡ Commands should disappear INSTANTLY on Discord!`);
			} else {
				console.log(`🌍 PRODUCTION mode (global commands)`);
				await api.applicationCommands.bulkOverwriteGlobalCommands(
					applicationId,
					commandsData as unknown as Parameters<typeof api.applicationCommands.bulkOverwriteGlobalCommands>[1],
				);
				console.log(`✅ ${deletedCount} command(s) deleted globally!`);
				console.log(`⏱️  Note: It may take up to 1 hour for commands to disappear on all servers`);
			}

			console.log(`📋 Remaining commands: ${commandsToKeep.length}`);
			if (commandsToKeep.length > 0) {
				console.log(`   • ${commandsToKeep.map((c) => c.name).join(', ')}`);
			}
		}
	} catch (error) {
		console.error('❌ Error deleting commands:', error);
		process.exit(1);
	}
}

deleteCommands();
