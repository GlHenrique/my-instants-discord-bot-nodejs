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
		console.error('Erro ao buscar no myinstants:', error);
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
		console.error('Erro ao extrair URL do MP3:', error);
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
		console.log(`Pesquisando por: ${input}`);

		// Check if user is in a voice channel
		const member = interaction.member;
		if (!member || !(member instanceof GuildMember) || !member.voice.channel) {
			await interaction.reply({
				content: '❌ Você precisa estar em um canal de voz para usar este comando!',
				ephemeral: true,
			});
			return;
		}

		const voiceChannel = member.voice.channel;
		console.log(`📢 Canal de voz identificado: ${voiceChannel.name} (${voiceChannel.id})`);
		console.log(`👥 Membros no canal: ${voiceChannel.members.size}`);

		// Check if bot has permissions to join the channel
		const botMember = interaction.guild?.members.me;
		if (botMember) {
			console.log(`🤖 Bot member encontrado: ${botMember.user.tag}`);
			console.log(`🆔 Bot ID: ${botMember.id}`);

			// Check server permissions
			const guildPermissions = botMember.permissions;
			console.log(`🔐 Permissões do bot no servidor:`, {
				Connect: guildPermissions.has('Connect'),
				Speak: guildPermissions.has('Speak'),
				ViewChannel: guildPermissions.has('ViewChannel'),
			});

			// Check specific channel permissions
			const channelPermissions = voiceChannel.permissionsFor(botMember);
			console.log(`🔐 Permissões do bot no canal "${voiceChannel.name}":`, {
				Connect: channelPermissions?.has('Connect'),
				Speak: channelPermissions?.has('Speak'),
				ViewChannel: channelPermissions?.has('ViewChannel'),
			});

			// Check calculated permissions (considering overrides)
			const calculatedPermissions = voiceChannel.permissionsFor(botMember, true);
			console.log(`🔐 Permissões calculadas (com sobreposições):`, {
				Connect: calculatedPermissions?.has('Connect'),
				Speak: calculatedPermissions?.has('Speak'),
				ViewChannel: calculatedPermissions?.has('ViewChannel'),
			});

			// Check if it has the necessary permissions (use calculatedPermissions which considers all overrides)
			if (!calculatedPermissions?.has(['Connect', 'Speak'])) {
				const missingPerms = [];
				if (!calculatedPermissions?.has('Connect')) missingPerms.push('Conectar');
				if (!calculatedPermissions?.has('Speak')) missingPerms.push('Falar');

				// Check if the problem is in the server or channel
				const hasGuildConnect = guildPermissions.has('Connect');
				const hasGuildSpeak = guildPermissions.has('Speak');
				const hasChannelConnect = channelPermissions?.has('Connect') ?? false;
				const hasChannelSpeak = channelPermissions?.has('Speak') ?? false;

				let problemDescription = '';
				if (hasGuildConnect && hasGuildSpeak && (!hasChannelConnect || !hasChannelSpeak)) {
					problemDescription =
						`⚠️ **Problema identificado:** O bot tem as permissões no servidor, mas há uma **sobreposição no canal** que está bloqueando!\n\n` +
						`**Solução:**\n` +
						`1. Clique com o botão direito no canal de voz **"${voiceChannel.name}"**\n` +
						`2. Selecione **"Editar Canal"**\n` +
						`3. Vá na aba **"Permissões"**\n` +
						`4. Encontre a função do seu bot (ou adicione o bot se não estiver lá)\n` +
						`5. **Ative** as permissões:\n` +
						`   ✅ **Conectar**\n` +
						`   ✅ **Falar**\n` +
						`6. Certifique-se de que **não há sobreposições negando** essas permissões\n` +
						`7. Salve as alterações`;
				} else if (!hasGuildConnect || !hasGuildSpeak) {
					problemDescription =
						`⚠️ **Problema identificado:** O bot não tem as permissões no servidor!\n\n` +
						`**Solução:**\n` +
						`1. Vá em **Configurações do Servidor** → **Funções**\n` +
						`2. Encontre a função do seu bot (ou crie uma nova)\n` +
						`3. **Ative** as permissões:\n` +
						`   ✅ **Conectar**\n` +
						`   ✅ **Falar**\n` +
						`4. Certifique-se de que o bot tem essa função atribuída\n` +
						`5. Salve as alterações`;
				} else {
					problemDescription =
						`⚠️ **Problema identificado:** Há uma sobreposição de permissões bloqueando o bot!\n\n` +
						`**Solução:**\n` +
						`1. Verifique as permissões do bot no servidor (Funções)\n` +
						`2. Verifique as permissões do bot no canal específico\n` +
						`3. Verifique se há sobreposições de permissões que estão bloqueando\n` +
						`4. Certifique-se de que o bot tem a função correta atribuída`;
				}

				await interaction.reply({
					content:
						`❌ **O bot não tem permissões para entrar e falar no canal de voz!**\n\n` +
						`**Permissões faltando:** ${missingPerms.join(', ')}\n\n` +
						`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
						problemDescription,
					ephemeral: true,
				});
				return;
			}

			// Check if channel is full
			if (voiceChannel.userLimit && voiceChannel.userLimit > 0) {
				const currentMembers = voiceChannel.members.size;
				console.log(`👥 Membros no canal: ${currentMembers}/${voiceChannel.userLimit}`);
				if (currentMembers >= voiceChannel.userLimit) {
					await interaction.reply({
						content: '❌ O canal de voz está cheio!',
						ephemeral: true,
					});
					return;
				}
			}
		} else {
			console.error('❌ Bot member não encontrado no servidor!');
			await interaction.reply({
				content: '❌ Erro: Bot não encontrado no servidor. Tente novamente.',
				ephemeral: true,
			});
			return;
		}

		// Indicate that it's processing
		await interaction.deferReply();

		try {
			const results = await searchMyInstants(input);

			if (results.length === 0) {
				await interaction.editReply(`❌ Nenhum resultado encontrado para: **${input}**`);
				return;
			}

			const firstResult = results[0];

			// Extract MP3 URL
			const mp3Url = await getMp3Url(firstResult.url);

			if (!mp3Url) {
				await interaction.editReply(`❌ Não foi possível encontrar o arquivo de áudio para: **${firstResult.name}**`);
				return;
			}

			console.log(`Tocando: ${mp3Url}`);

			// Check if MP3 URL is accessible before trying to play
			try {
				const headResponse = await axios.head(mp3Url, {
					timeout: 5000,
					validateStatus: (status) => status < 400,
				});
				console.log(
					`✅ Arquivo MP3 acessível. Tamanho: ${headResponse.headers['content-length'] || 'desconhecido'} bytes`,
				);
			} catch (error) {
				console.warn('⚠️ Não foi possível verificar o arquivo MP3, mas tentando reproduzir mesmo assim:', error);
			}

			// Adiciona à fila de reprodução
			try {
				const guildId = interaction.guild?.id;
				if (!guildId) {
					throw new Error('Guild ID não encontrado');
				}

				const queueSize = audioQueue.getQueueSize(guildId);
				const isPlaying = audioQueue.isCurrentlyPlaying(guildId);

				await audioQueue.addToQueue(guildId, {
					name: firstResult.name,
					mp3Url,
					channel: voiceChannel,
				});

				// Mensagem de resposta baseada no estado da fila
				if (isPlaying || queueSize > 0) {
					const position = queueSize + 1;
					await interaction.editReply(
						`📥 **${firstResult.name}** adicionado à fila!\n` +
							`🔗 ${firstResult.url}\n` +
							`📍 Posição na fila: ${position}`,
					);
				} else {
					await interaction.editReply(`🎵 Tocando: **${firstResult.name}**\n` + `🔗 ${firstResult.url}`);
				}
			} catch (error) {
				console.error('Erro ao adicionar à fila:', error);
				const errorMessage = error instanceof Error ? error.message : String(error);

				if (
					errorMessage.includes('permission') ||
					errorMessage.includes('Missing') ||
					errorMessage.includes('Timeout')
				) {
					await interaction.editReply(
						`❌ **Erro ao conectar ao canal de voz!**\n\n` +
							`**Possíveis causas:**\n` +
							`• O bot não tem permissão para entrar no canal\n` +
							`• O bot não tem permissão para falar no canal\n` +
							`• O canal está cheio\n` +
							`• Problema de conexão com o servidor de voz\n\n` +
							`**Solução:** Verifique as permissões do bot no servidor e no canal.`,
					);
				} else {
					await interaction.editReply(`❌ Erro ao adicionar à fila: ${errorMessage}`);
				}
			}
		} catch (error) {
			console.error('Erro ao executar busca:', error);
			await interaction.editReply(`❌ Erro ao buscar no myinstants.com. Tente novamente mais tarde.`);
		}
	},
} satisfies Command;
