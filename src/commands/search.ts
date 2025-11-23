import type { Command } from './index.js';
import * as cheerio from 'cheerio';
import axios from 'axios';
import type { Readable } from 'stream';
import {
	AudioPlayerStatus,
	createAudioPlayer,
	createAudioResource,
	joinVoiceChannel,
	VoiceConnectionStatus,
	type VoiceConnection,
} from '@discordjs/voice';
import type { VoiceBasedChannel } from 'discord.js';
import { GuildMember } from 'discord.js';
import ffmpegStatic from 'ffmpeg-static';

// Store active connections by guild ID
const activeConnections = new Map<string, VoiceConnection>();
// Store disconnection timers by guild ID
const disconnectTimers = new Map<string, NodeJS.Timeout>();

// Function to disconnect after timeout
function scheduleDisconnect(guildId: string, connection: VoiceConnection) {
	// Clear existing timer if any
	if (disconnectTimers.has(guildId)) {
		clearTimeout(disconnectTimers.get(guildId)!);
	}

	console.log('⏰ Agendando desconexão em 5 minutos...');
	const timer = setTimeout(
		() => {
			console.log(`🔌 Desconectando do canal de voz após 5 minutos de inatividade (Guild: ${guildId})`);
			connection.destroy();
			activeConnections.delete(guildId);
			disconnectTimers.delete(guildId);
		},
		5 * 60 * 1000,
	); // 5 minutes in milliseconds

	disconnectTimers.set(guildId, timer);
}

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

async function playAudio(channel: VoiceBasedChannel, mp3Url: string): Promise<void> {
	console.log(`🔊 Tentando conectar ao canal de voz: ${channel.name} (ID: ${channel.id})`);
	console.log(`📋 Guild ID: ${channel.guild.id}`);
	console.log(`🔌 Adapter Creator disponível: ${!!channel.guild.voiceAdapterCreator}`);

	// Check if adapterCreator is available
	if (!channel.guild.voiceAdapterCreator) {
		throw new Error('Voice adapter creator não está disponível. O bot pode não estar totalmente conectado ao Discord.');
	}

	const guildId = channel.guild.id;

	// Cancel disconnection timer if exists (new playback is starting)
	if (disconnectTimers.has(guildId)) {
		console.log('⏸️ Cancelando timer de desconexão - nova reprodução iniciada');
		clearTimeout(disconnectTimers.get(guildId)!);
		disconnectTimers.delete(guildId);
	}

	// Check if there's already an active connection for this guild
	let connection = activeConnections.get(guildId);

	// If connection doesn't exist or was destroyed, create a new one
	if (!connection || connection.state.status === VoiceConnectionStatus.Destroyed) {
		connection = joinVoiceChannel({
			channelId: channel.id,
			guildId: channel.guild.id,
			adapterCreator: channel.guild.voiceAdapterCreator,
			selfDeaf: false,
			selfMute: false,
		});
		activeConnections.set(guildId, connection);
		console.log(`✅ Nova conexão criada. Estado inicial: ${connection.state.status}`);
	} else {
		// If connection exists but is in a different channel, we need to reconnect
		if (connection.joinConfig.channelId !== channel.id) {
			console.log('🔄 Reconectando ao novo canal...');
			connection.destroy();
			connection = joinVoiceChannel({
				channelId: channel.id,
				guildId: channel.guild.id,
				adapterCreator: channel.guild.voiceAdapterCreator,
				selfDeaf: false,
				selfMute: false,
			});
			activeConnections.set(guildId, connection);
		}
	}

	// Try to download audio as stream to ensure correct processing
	let audioStream: Readable | string = mp3Url;
	try {
		const response = await axios.get(mp3Url, {
			responseType: 'stream',
			timeout: 10000,
		});
		audioStream = response.data;
		console.log('✅ Stream de áudio obtido com sucesso');
	} catch (error) {
		console.warn('⚠️ Não foi possível obter stream, usando URL diretamente:', error);
		audioStream = mp3Url; // Fallback to URL
	}

	return new Promise((resolve, reject) => {
		let timeoutId: NodeJS.Timeout | null = null;
		let isResolved = false;

		const cleanup = () => {
			if (timeoutId) {
				clearTimeout(timeoutId);
				timeoutId = null;
			}
		};

		const safeResolve = () => {
			if (!isResolved) {
				isResolved = true;
				cleanup();
				resolve();
			}
		};

		const safeReject = (error: Error) => {
			if (!isResolved) {
				isResolved = true;
				cleanup();
				reject(error);
			}
		};

		// Function to create and play audio (reusable for both Ready event and immediate playback)
		const createAndPlayAudio = () => {
			try {
				cleanup(); // Clear timeout when connection is ready

				// Stop any existing player before creating a new one
				const existingSubscription =
					connection.state.status === VoiceConnectionStatus.Ready ? connection.state.subscription : null;
				if (existingSubscription) {
					console.log('🛑 Parando player anterior...');
					existingSubscription.player.stop();
					existingSubscription.unsubscribe();
				}

				const player = createAudioPlayer();
				console.log('🎵 Player de áudio criado');

				// Create audio resource
				// If audioStream is a Readable stream, use it directly
				// If it's a string (URL), ffmpeg will process it automatically
				const resource = createAudioResource(audioStream, {
					inlineVolume: true,
				});

				console.log(`🎶 Recurso de áudio criado (tipo: ${typeof audioStream === 'string' ? 'URL' : 'Stream'})`);
				console.log(`🎶 Recurso de áudio criado para: ${mp3Url}`);

				// Configure volume (100% = 1.0)
				resource.volume?.setVolume(1.0);

				// Verify connection is really ready before playing
				if (connection.state.status !== VoiceConnectionStatus.Ready) {
					console.error('❌ Conexão não está pronta! Estado:', connection.state.status);
					safeReject(new Error('Conexão de voz não está pronta'));
					return;
				}

				player.play(resource);
				connection.subscribe(player);
				console.log('▶️ Áudio iniciado');

				// Additional log for debug
				console.log(`📊 Estado do player após iniciar: ${player.state.status}`);
				console.log(`📊 Estado da conexão: ${connection.state.status}`);

				// Wait for player to be ready before considering success
				player.on(AudioPlayerStatus.Playing, () => {
					console.log('🎵 Player está reproduzindo áudio agora!');
					console.log(`📊 Estado da conexão durante reprodução: ${connection.state.status}`);

					// Verify connection is still active
					if (connection.state.status !== VoiceConnectionStatus.Ready) {
						console.error('❌ Conexão perdeu o estado Ready durante reprodução!');
					}
				});

				player.on(AudioPlayerStatus.Idle, () => {
					console.log('⏹️ Player em estado Idle - áudio terminou');
					// Schedule disconnection in 5 minutes instead of disconnecting immediately
					scheduleDisconnect(guildId, connection);
					safeResolve();
				});

				player.on('error', (error) => {
					console.error('Erro no player de áudio:', {
						name: error instanceof Error ? error.name : 'Unknown',
						message: error instanceof Error ? error.message : String(error),
						stack: error instanceof Error ? error.stack : undefined,
					});
					// Clear timers and connection
					if (disconnectTimers.has(guildId)) {
						clearTimeout(disconnectTimers.get(guildId)!);
						disconnectTimers.delete(guildId);
					}
					activeConnections.delete(guildId);
					connection.destroy();
					safeReject(error);
				});

				player.on('stateChange', (oldState, newState) => {
					console.log(`🎵 Mudança de estado do player: ${oldState.status} → ${newState.status}`);

					// Additional log when starting to play
					if (newState.status === AudioPlayerStatus.Playing) {
						console.log('✅ Áudio está sendo reproduzido agora!');
					}

					// Log when buffering
					if (newState.status === AudioPlayerStatus.Buffering) {
						console.log('⏳ Player está em buffering (carregando áudio)...');
					}
				});

				// Listener for errors in the resource
				resource.playStream?.on('error', (error) => {
					console.error('❌ Erro no stream de áudio:', error);
				});
			} catch (error) {
				console.error('❌ Erro ao configurar áudio:', error);
				// Clear timers and connection
				if (disconnectTimers.has(guildId)) {
					clearTimeout(disconnectTimers.get(guildId)!);
					disconnectTimers.delete(guildId);
				}
				activeConnections.delete(guildId);
				connection.destroy();
				safeReject(error as Error);
			}
		};

		// Listener for all connection states (debug and disconnect handling)
		connection.on('stateChange', (oldState, newState) => {
			console.log(`🔄 Mudança de estado da conexão: ${oldState.status} → ${newState.status}`);

			// Detect disconnections
			if (newState.status === VoiceConnectionStatus.Disconnected) {
				console.log(
					`🔌 Desconectado do canal de voz. Estado anterior: ${oldState.status}, novo estado: ${newState.status}`,
				);
				// If disconnected before being ready, might be a permission issue
				if (!isResolved && oldState.status !== VoiceConnectionStatus.Ready) {
					console.error('❌ Conexão desconectada antes de estar pronta - possível problema de permissão');
					// Clear timers and connection
					if (disconnectTimers.has(guildId)) {
						clearTimeout(disconnectTimers.get(guildId)!);
						disconnectTimers.delete(guildId);
					}
					activeConnections.delete(guildId);
					safeReject(new Error('Conexão perdida - verifique as permissões do bot no canal de voz'));
				} else if (oldState.status === VoiceConnectionStatus.Ready) {
					// If already ready, just resolve (audio finished or manual disconnect)
					// Don't destroy here - let the 5 minute timer handle it
					// But if it was a manual disconnect, clear the timers
					if (disconnectTimers.has(guildId)) {
						clearTimeout(disconnectTimers.get(guildId)!);
						disconnectTimers.delete(guildId);
					}
					activeConnections.delete(guildId);
					safeResolve();
				}
			}
		});

		// Check if connection is already ready (for reusing existing connections)
		if (connection.state.status === VoiceConnectionStatus.Ready) {
			createAndPlayAudio();
		} else {
			// Wait for Ready event if connection is not ready yet
			connection.on(VoiceConnectionStatus.Ready, () => {
				createAndPlayAudio();
			});
		}

		connection.on(VoiceConnectionStatus.Connecting, () => {
			console.log('🔄 Conectando ao canal de voz...');
		});

		connection.on('error', (error) => {
			console.error('Erro na conexão de voz:', {
				name: error instanceof Error ? error.name : 'Unknown',
				message: error instanceof Error ? error.message : String(error),
				stack: error instanceof Error ? error.stack : undefined,
			});
			// Clear timers and connection
			if (disconnectTimers.has(guildId)) {
				clearTimeout(disconnectTimers.get(guildId)!);
				disconnectTimers.delete(guildId);
			}
			activeConnections.delete(guildId);
			connection.destroy();
			// Check if it's a permission error
			const errorMessage = error instanceof Error ? error.message : String(error);
			if (errorMessage.includes('permission') || errorMessage.includes('Missing')) {
				safeReject(new Error('Sem permissões para entrar no canal de voz. Verifique as permissões do bot.'));
			} else {
				safeReject(error);
			}
		});

		// Timeout to avoid infinite wait (increased to 20 seconds)
		timeoutId = setTimeout(() => {
			const currentStatus = connection.state.status;
			console.error(`⏱️ Timeout ao conectar ao canal de voz. Estado atual: ${currentStatus}`);
			if (currentStatus !== VoiceConnectionStatus.Ready && currentStatus !== VoiceConnectionStatus.Destroyed) {
				// Clear timers and connection
				if (disconnectTimers.has(guildId)) {
					clearTimeout(disconnectTimers.get(guildId)!);
					disconnectTimers.delete(guildId);
				}
				activeConnections.delete(guildId);
				connection.destroy();
				safeReject(new Error(`Timeout ao conectar ao canal de voz. Estado final: ${currentStatus}`));
			}
		}, 20000);
	});
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
			await interaction.editReply(`🎵 Tocando: **${firstResult.name}**\n🔗 ${firstResult.url}`);

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

			// Play audio
			try {
				await playAudio(voiceChannel, mp3Url);
				await interaction.editReply(`✅ **${firstResult.name}** reproduzido com sucesso!`);
			} catch (error) {
				console.error('Erro ao tocar áudio:', error);
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
					await interaction.editReply(`❌ Erro ao reproduzir o áudio: ${errorMessage}`);
				}
			}
		} catch (error) {
			console.error('Erro ao executar busca:', error);
			await interaction.editReply(`❌ Erro ao buscar no myinstants.com. Tente novamente mais tarde.`);
		}
	},
} satisfies Command;
