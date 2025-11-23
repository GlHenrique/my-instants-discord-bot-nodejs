import type { Command } from './index.js';
import * as cheerio from 'cheerio';
import axios from 'axios';
import { GuildMember } from 'discord.js';
import { audioQueue } from '../util/audioQueue.js';
import ffmpegStatic from 'ffmpeg-static';

// Configure ffmpeg for HTTP URL streaming
if (ffmpegStatic && typeof ffmpegStatic === 'string') {
	process.env.FFMPEG_PATH = ffmpegStatic;
}

interface SearchResult {
	name: string;
	url: string;
}

async function searchMyInstants(query: string): Promise<SearchResult[]> {
	const searchUrl = `https://www.myinstants.com/pt/search/?name=${encodeURIComponent(query)}`;

	try {
		const response = await axios.get(searchUrl, {
			headers: {
				'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
			},
		});

		const html = response.data;
		const $ = cheerio.load(html);
		const results: SearchResult[] = [];

		// Search for elements containing the results
		// Results are in links pointing to /pt/instant/
		$('a[href^="/pt/instant/"]').each((_, element) => {
			const $element = $(element);
			const href = $element.attr('href');
			let text = $element.text().trim();

			// If text is empty, try to get it from title attribute or parent element
			if (!text) {
				text = $element.attr('title') || $element.find('span').text().trim() || '';
			}

			// Filter only valid links with text
			if (href && text && text.length > 0) {
				const fullUrl = `https://www.myinstants.com${href}`;

				// Avoid duplicates and filter very short or generic texts
				if (!results.some((r) => r.url === fullUrl) && text.length > 2) {
					results.push({
						name: text,
						url: fullUrl,
					});
				}
			}
		});

		// If no results found with specific selector, try a broader search
		if (results.length === 0) {
			$('a').each((_, element) => {
				const $element = $(element);
				const href = $element.attr('href');
				const text = $element.text().trim();

				if (href && href.includes('/instant/') && text && text.length > 2) {
					const fullUrl = href.startsWith('http') ? href : `https://www.myinstants.com${href}`;

					if (!results.some((r) => r.url === fullUrl)) {
						results.push({
							name: text,
							url: fullUrl,
						});
					}
				}
			});
		}

		return results.slice(0, 1); // Limit to first result
	} catch (error) {
		console.error('Error searching myinstants:', error);
		throw error;
	}
}

async function getMp3Url(instantUrl: string): Promise<string | null> {
	try {
		const response = await axios.get(instantUrl, {
			headers: {
				'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
			},
		});

		const html = response.data;
		const $ = cheerio.load(html);

		// Try to find MP3 link in various ways
		// 1. Search for source or audio elements
		let mp3Url: string | null = $('source[src*=".mp3"]').attr('src') || null;
		if (mp3Url) {
			if (!mp3Url.startsWith('http')) {
				mp3Url = `https://www.myinstants.com${mp3Url}`;
			}
			return mp3Url;
		}

		// 2. Search for onclick or data-url attributes containing .mp3
		$('[onclick*=".mp3"], [data-url*=".mp3"]').each((_, element) => {
			if (mp3Url) return false; // Break if already found
			const $element = $(element);
			const onclick = $element.attr('onclick') || '';
			const dataUrl = $element.attr('data-url') || '';
			const url = onclick.match(/['"]([^'"]*\.mp3[^'"]*)['"]/) || dataUrl.match(/(https?:\/\/[^\s]*\.mp3)/);
			if (url && url[1]) {
				mp3Url = url[1];
				if (!mp3Url.startsWith('http')) {
					mp3Url = `https://www.myinstants.com${mp3Url}`;
				}
				return false; // Break
			}
			return undefined; // Ensure all paths return a value
		});

		if (mp3Url) return mp3Url;

		// 3. Search for patterns in the page (usually in a script or hidden element)
		const scriptContent = $('script').text();
		const mp3Match = scriptContent.match(/(https?:\/\/[^\s"'<>]*\.mp3[^\s"'<>]*)/i);
		if (mp3Match && mp3Match[1]) {
			return mp3Match[1];
		}

		// 4. Try common myinstants pattern: /media/sounds/
		const mediaMatch = html.match(/['"](\/media\/sounds\/[^'"]*\.mp3[^'"]*)['"]/i);
		if (mediaMatch && mediaMatch[1]) {
			return `https://www.myinstants.com${mediaMatch[1]}`;
		}

		return null;
	} catch (error) {
		console.error('Error extracting MP3 URL:', error);
		return null;
	}
}

export default {
	data: {
		name: 'mi',
		description: 'Search for a myinstants audio.',
		options: [
			{
				name: 'input',
				description: 'The search query for the myinstants audio.',
				type: 3, // STRING type
				required: true,
			},
		],
	},
	async execute(interaction) {
		// Get the query from the interaction
		const input = interaction.options.getString('input', true);
		console.log(`Searching for: ${input}`);

		// Check if user is in a voice channel
		const member = interaction.member;
		if (!member || !(member instanceof GuildMember) || !member.voice.channel) {
			await interaction.reply({
				content: '❌ You need to be in a voice channel to use this command!',
				ephemeral: true,
			});
			return;
		}

		const voiceChannel = member.voice.channel;
		console.log(`📢 Voice channel identified: ${voiceChannel.name} (${voiceChannel.id})`);
		console.log(`👥 Members in channel: ${voiceChannel.members.size}`);

		// Check if bot has permissions to join the channel
		const botMember = interaction.guild?.members.me;
		if (botMember) {
			console.log(`🤖 Bot member found: ${botMember.user.tag}`);
			console.log(`🆔 Bot ID: ${botMember.id}`);

			// Check server permissions
			const guildPermissions = botMember.permissions;
			console.log(`🔐 Bot permissions on server:`, {
				Connect: guildPermissions.has('Connect'),
				Speak: guildPermissions.has('Speak'),
				ViewChannel: guildPermissions.has('ViewChannel'),
			});

			// Check specific channel permissions
			const channelPermissions = voiceChannel.permissionsFor(botMember);
			console.log(`🔐 Bot permissions on channel "${voiceChannel.name}":`, {
				Connect: channelPermissions?.has('Connect'),
				Speak: channelPermissions?.has('Speak'),
				ViewChannel: channelPermissions?.has('ViewChannel'),
			});

			// Check calculated permissions (considering overrides)
			const calculatedPermissions = voiceChannel.permissionsFor(botMember, true);
			console.log(`🔐 Calculated permissions (with overrides):`, {
				Connect: calculatedPermissions?.has('Connect'),
				Speak: calculatedPermissions?.has('Speak'),
				ViewChannel: calculatedPermissions?.has('ViewChannel'),
			});

			// Check if it has the necessary permissions (use calculatedPermissions which considers all overrides)
			if (!calculatedPermissions?.has(['Connect', 'Speak'])) {
				const missingPerms = [];
				if (!calculatedPermissions?.has('Connect')) missingPerms.push('Connect');
				if (!calculatedPermissions?.has('Speak')) missingPerms.push('Speak');

				// Check if the problem is in the server or channel
				const hasGuildConnect = guildPermissions.has('Connect');
				const hasGuildSpeak = guildPermissions.has('Speak');
				const hasChannelConnect = channelPermissions?.has('Connect') ?? false;
				const hasChannelSpeak = channelPermissions?.has('Speak') ?? false;

				let problemDescription = '';
				if (hasGuildConnect && hasGuildSpeak && (!hasChannelConnect || !hasChannelSpeak)) {
					problemDescription =
						`⚠️ **Problem identified:** The bot has permissions on the server, but there's a **channel override** blocking it!\n\n` +
						`**Solution:**\n` +
						`1. Right-click on the voice channel **"${voiceChannel.name}"**\n` +
						`2. Select **"Edit Channel"**\n` +
						`3. Go to the **"Permissions"** tab\n` +
						`4. Find your bot's role (or add the bot if it's not there)\n` +
						`5. **Enable** the permissions:\n` +
						`   ✅ **Connect**\n` +
						`   ✅ **Speak**\n` +
						`6. Make sure there are **no overrides denying** these permissions\n` +
						`7. Save the changes`;
				} else if (!hasGuildConnect || !hasGuildSpeak) {
					problemDescription =
						`⚠️ **Problem identified:** The bot doesn't have permissions on the server!\n\n` +
						`**Solution:**\n` +
						`1. Go to **Server Settings** → **Roles**\n` +
						`2. Find your bot's role (or create a new one)\n` +
						`3. **Enable** the permissions:\n` +
						`   ✅ **Connect**\n` +
						`   ✅ **Speak**\n` +
						`4. Make sure the bot has this role assigned\n` +
						`5. Save the changes`;
				} else {
					problemDescription =
						`⚠️ **Problem identified:** There's a permission override blocking the bot!\n\n` +
						`**Solution:**\n` +
						`1. Check the bot's permissions on the server (Roles)\n` +
						`2. Check the bot's permissions on the specific channel\n` +
						`3. Check if there are permission overrides that are blocking\n` +
						`4. Make sure the bot has the correct role assigned`;
				}

				await interaction.reply({
					content:
						`❌ **The bot doesn't have permissions to join and speak in the voice channel!**\n\n` +
						`**Missing permissions:** ${missingPerms.join(', ')}\n\n` +
						`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
						problemDescription,
					ephemeral: true,
				});
				return;
			}

			// Check if channel is full
			if (voiceChannel.userLimit && voiceChannel.userLimit > 0) {
				const currentMembers = voiceChannel.members.size;
				console.log(`👥 Members in channel: ${currentMembers}/${voiceChannel.userLimit}`);
				if (currentMembers >= voiceChannel.userLimit) {
					await interaction.reply({
						content: '❌ The voice channel is full!',
						ephemeral: true,
					});
					return;
				}
			}
		} else {
			console.error('❌ Bot member not found on server!');
			await interaction.reply({
				content: '❌ Error: Bot not found on server. Please try again.',
				ephemeral: true,
			});
			return;
		}

		// Indicate that it's processing
		await interaction.deferReply();

		try {
			const results = await searchMyInstants(input);

			if (results.length === 0) {
				await interaction.editReply(`❌ No results found for: **${input}**`);
				return;
			}

			const firstResult = results[0];

			// Extract MP3 URL
			const mp3Url = await getMp3Url(firstResult.url);

			if (!mp3Url) {
				await interaction.editReply(`❌ Could not find audio file for: **${firstResult.name}**`);
				return;
			}

			console.log(`Playing: ${mp3Url}`);

			// Check if MP3 URL is accessible before trying to play
			try {
				const headResponse = await axios.head(mp3Url, {
					timeout: 5000,
					validateStatus: (status) => status < 400,
				});
				console.log(`✅ MP3 file accessible. Size: ${headResponse.headers['content-length'] || 'unknown'} bytes`);
			} catch (error) {
				console.warn('⚠️ Could not verify MP3 file, but trying to play anyway:', error);
			}

			// Add to playback queue
			try {
				const guildId = interaction.guild?.id;
				if (!guildId) {
					throw new Error('Guild ID not found');
				}

				const queueSize = audioQueue.getQueueSize(guildId);
				const isPlaying = audioQueue.isCurrentlyPlaying(guildId);

				await audioQueue.addToQueue(guildId, {
					name: firstResult.name,
					mp3Url,
					channel: voiceChannel,
				});

				// Response message based on queue state
				if (isPlaying || queueSize > 0) {
					const position = queueSize + 1;
					await interaction.editReply(
						`📥 **${firstResult.name}** added to queue!\n` +
							`🔗 ${firstResult.url}\n` +
							`📍 Queue position: ${position}`,
					);
				} else {
					await interaction.editReply(`🎵 Playing: **${firstResult.name}**\n` + `🔗 ${firstResult.url}`);
				}
			} catch (error) {
				console.error('Error adding to queue:', error);
				const errorMessage = error instanceof Error ? error.message : String(error);

				if (
					errorMessage.includes('permission') ||
					errorMessage.includes('Missing') ||
					errorMessage.includes('Timeout')
				) {
					await interaction.editReply(
						`❌ **Error connecting to voice channel!**\n\n` +
							`**Possible causes:**\n` +
							`• The bot doesn't have permission to join the channel\n` +
							`• The bot doesn't have permission to speak in the channel\n` +
							`• The channel is full\n` +
							`• Connection problem with the voice server\n\n` +
							`**Solution:** Check the bot's permissions on the server and channel.`,
					);
				} else {
					await interaction.editReply(`❌ Error adding to queue: ${errorMessage}`);
				}
			}
		} catch (error) {
			console.error('Error executing search:', error);
			await interaction.editReply(`❌ Error searching myinstants.com. Please try again later.`);
		}
	},
} satisfies Command;
