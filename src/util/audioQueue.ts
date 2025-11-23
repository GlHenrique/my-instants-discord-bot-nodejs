import type { Readable } from 'stream';
import {
	AudioPlayerStatus,
	createAudioPlayer,
	createAudioResource,
	joinVoiceChannel,
	VoiceConnectionStatus,
	type VoiceConnection,
	type AudioPlayer,
} from '@discordjs/voice';
import type { VoiceBasedChannel } from 'discord.js';
import axios from 'axios';

// Interface para itens da fila
export interface QueueItem {
	name: string;
	mp3Url: string;
	channel: VoiceBasedChannel;
}

// Classe para gerenciar a fila de reprodução por guild
class AudioQueueManager {
	private queues = new Map<string, QueueItem[]>();
	private activeConnections = new Map<string, VoiceConnection>();
	private activePlayers = new Map<string, AudioPlayer>();
	private disconnectTimers = new Map<string, NodeJS.Timeout>();
	private isPlaying = new Map<string, boolean>();

	/**
	 * Adiciona um item à fila de reprodução
	 */
	async addToQueue(guildId: string, item: QueueItem): Promise<void> {
		if (!this.queues.has(guildId)) {
			this.queues.set(guildId, []);
		}

		const queue = this.queues.get(guildId)!;
		queue.push(item);

		console.log(`📥 Item adicionado à fila: "${item.name}" (Posição: ${queue.length})`);

		// Se não está tocando, inicia a reprodução
		if (!this.isPlaying.get(guildId)) {
			await this.processQueue(guildId);
		}
	}

	/**
	 * Processa a fila de reprodução
	 */
	private async processQueue(guildId: string): Promise<void> {
		const queue = this.queues.get(guildId);
		if (!queue || queue.length === 0) {
			this.isPlaying.set(guildId, false);
			return;
		}

		// Se já está tocando, não processa novamente
		if (this.isPlaying.get(guildId)) {
			return;
		}

		this.isPlaying.set(guildId, true);
		const item = queue.shift()!;

		console.log(`▶️ Reproduzindo da fila: "${item.name}" (${queue.length} item(s) restante(s))`);

		try {
			await this.playAudio(item.channel, item.mp3Url, item.name);
		} catch (error) {
			console.error(`❌ Erro ao reproduzir "${item.name}":`, error);
		}

		// Processa o próximo item da fila
		this.isPlaying.set(guildId, false);
		await this.processQueue(guildId);
	}

	/**
	 * Reproduz um áudio no canal de voz
	 */
	private async playAudio(channel: VoiceBasedChannel, mp3Url: string, itemName: string): Promise<void> {
		const guildId = channel.guild.id;

		// Verifica se o adapterCreator está disponível
		if (!channel.guild.voiceAdapterCreator) {
			throw new Error(
				'Voice adapter creator não está disponível. O bot pode não estar totalmente conectado ao Discord.',
			);
		}

		// Cancela timer de desconexão se existir
		if (this.disconnectTimers.has(guildId)) {
			console.log('⏸️ Cancelando timer de desconexão - nova reprodução iniciada');
			clearTimeout(this.disconnectTimers.get(guildId)!);
			this.disconnectTimers.delete(guildId);
		}

		// Obtém ou cria conexão de voz
		let connection = this.activeConnections.get(guildId);

		if (!connection || connection.state.status === VoiceConnectionStatus.Destroyed) {
			connection = joinVoiceChannel({
				channelId: channel.id,
				guildId: channel.guild.id,
				adapterCreator: channel.guild.voiceAdapterCreator,
				selfDeaf: false,
				selfMute: false,
			});
			this.activeConnections.set(guildId, connection);
			console.log(`✅ Nova conexão criada. Estado inicial: ${connection.state.status}`);
		} else {
			// Se a conexão existe mas está em um canal diferente, reconecta
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
				this.activeConnections.set(guildId, connection);
			}
		}

		// Obtém stream de áudio
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
			audioStream = mp3Url;
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

			const createAndPlayAudio = () => {
				try {
					cleanup();

					// Para player anterior se existir
					const existingSubscription =
						connection.state.status === VoiceConnectionStatus.Ready ? connection.state.subscription : null;
					if (existingSubscription) {
						console.log('🛑 Parando player anterior...');
						existingSubscription.player.stop();
						existingSubscription.unsubscribe();
					}

					const player = createAudioPlayer();
					this.activePlayers.set(guildId, player);
					console.log('🎵 Player de áudio criado');

					const resource = createAudioResource(audioStream, {
						inlineVolume: true,
					});

					console.log(`🎶 Recurso de áudio criado (tipo: ${typeof audioStream === 'string' ? 'URL' : 'Stream'})`);
					console.log(`🎶 Reproduzindo: ${itemName}`);

					resource.volume?.setVolume(1.0);

					if (connection.state.status !== VoiceConnectionStatus.Ready) {
						console.error('❌ Conexão não está pronta! Estado:', connection.state.status);
						safeReject(new Error('Conexão de voz não está pronta'));
						return;
					}

					player.play(resource);
					connection.subscribe(player);
					console.log('▶️ Áudio iniciado');

					player.on(AudioPlayerStatus.Playing, () => {
						console.log(`🎵 Reproduzindo: "${itemName}"`);
					});

					player.on(AudioPlayerStatus.Idle, () => {
						console.log(`⏹️ Áudio terminou: "${itemName}"`);
						// Agenda desconexão em 5 minutos se não houver mais itens na fila
						const queue = this.queues.get(guildId);
						if (!queue || queue.length === 0) {
							this.scheduleDisconnect(guildId);
						}
						safeResolve();
					});

					player.on('error', (error) => {
						console.error(`Erro no player de áudio para "${itemName}":`, {
							name: error instanceof Error ? error.name : 'Unknown',
							message: error instanceof Error ? error.message : String(error),
						});
						this.cleanupGuild(guildId);
						safeReject(error);
					});

					player.on('stateChange', (oldState, newState) => {
						console.log(`🎵 Mudança de estado do player: ${oldState.status} → ${newState.status} (${itemName})`);
					});

					resource.playStream?.on('error', (error) => {
						console.error(`❌ Erro no stream de áudio para "${itemName}":`, error);
					});
				} catch (error) {
					console.error(`❌ Erro ao configurar áudio para "${itemName}":`, error);
					this.cleanupGuild(guildId);
					safeReject(error as Error);
				}
			};

			// Listener para mudanças de estado da conexão
			connection.on('stateChange', (oldState, newState) => {
				console.log(`🔄 Mudança de estado da conexão: ${oldState.status} → ${newState.status}`);

				if (newState.status === VoiceConnectionStatus.Disconnected) {
					console.log(
						`🔌 Desconectado do canal de voz. Estado anterior: ${oldState.status}, novo estado: ${newState.status}`,
					);
					if (!isResolved && oldState.status !== VoiceConnectionStatus.Ready) {
						console.error('❌ Conexão desconectada antes de estar pronta');
						this.cleanupGuild(guildId);
						safeReject(new Error('Conexão perdida - verifique as permissões do bot no canal de voz'));
					} else if (oldState.status === VoiceConnectionStatus.Ready) {
						if (this.disconnectTimers.has(guildId)) {
							clearTimeout(this.disconnectTimers.get(guildId)!);
							this.disconnectTimers.delete(guildId);
						}
						this.activeConnections.delete(guildId);
						safeResolve();
					}
				}
			});

			// Verifica se a conexão já está pronta
			if (connection.state.status === VoiceConnectionStatus.Ready) {
				createAndPlayAudio();
			} else {
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
				});
				this.cleanupGuild(guildId);
				const errorMessage = error instanceof Error ? error.message : String(error);
				if (errorMessage.includes('permission') || errorMessage.includes('Missing')) {
					safeReject(new Error('Sem permissões para entrar no canal de voz. Verifique as permissões do bot.'));
				} else {
					safeReject(error);
				}
			});

			// Timeout de 20 segundos
			timeoutId = setTimeout(() => {
				const currentStatus = connection.state.status;
				console.error(`⏱️ Timeout ao conectar ao canal de voz. Estado atual: ${currentStatus}`);
				if (currentStatus !== VoiceConnectionStatus.Ready && currentStatus !== VoiceConnectionStatus.Destroyed) {
					this.cleanupGuild(guildId);
					safeReject(new Error(`Timeout ao conectar ao canal de voz. Estado final: ${currentStatus}`));
				}
			}, 20000);
		});
	}

	/**
	 * Agenda desconexão após 5 minutos de inatividade
	 */
	private scheduleDisconnect(guildId: string): void {
		if (this.disconnectTimers.has(guildId)) {
			clearTimeout(this.disconnectTimers.get(guildId)!);
		}

		console.log('⏰ Agendando desconexão em 5 minutos...');
		const timer = setTimeout(
			() => {
				console.log(`🔌 Desconectando do canal de voz após 5 minutos de inatividade (Guild: ${guildId})`);
				this.cleanupGuild(guildId);
			},
			5 * 60 * 1000,
		);

		this.disconnectTimers.set(guildId, timer);
	}

	/**
	 * Limpa recursos de um guild
	 */
	private cleanupGuild(guildId: string): void {
		if (this.disconnectTimers.has(guildId)) {
			clearTimeout(this.disconnectTimers.get(guildId)!);
			this.disconnectTimers.delete(guildId);
		}

		const connection = this.activeConnections.get(guildId);
		if (connection) {
			connection.destroy();
			this.activeConnections.delete(guildId);
		}

		const player = this.activePlayers.get(guildId);
		if (player) {
			player.stop();
			this.activePlayers.delete(guildId);
		}

		this.isPlaying.set(guildId, false);
	}

	/**
	 * Obtém o tamanho da fila para um guild
	 */
	getQueueSize(guildId: string): number {
		return this.queues.get(guildId)?.length || 0;
	}

	/**
	 * Limpa a fila de um guild
	 */
	clearQueue(guildId: string): void {
		const queue = this.queues.get(guildId);
		if (queue) {
			queue.length = 0;
			console.log(`🗑️ Fila limpa para o guild ${guildId}`);
		}
	}

	/**
	 * Para a reprodução atual e limpa a fila
	 */
	stop(guildId: string): void {
		this.clearQueue(guildId);
		const player = this.activePlayers.get(guildId);
		if (player) {
			player.stop();
		}
		this.isPlaying.set(guildId, false);
		console.log(`⏹️ Reprodução parada para o guild ${guildId}`);
	}

	/**
	 * Verifica se está tocando algo no guild
	 */
	isCurrentlyPlaying(guildId: string): boolean {
		return this.isPlaying.get(guildId) || false;
	}
}

// Instância singleton do gerenciador de fila
export const audioQueue = new AudioQueueManager();
