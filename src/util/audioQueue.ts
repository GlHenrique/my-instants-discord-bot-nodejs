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

// Interface for queue items
export interface QueueItem {
	name: string;
	mp3Url: string;
	channel: VoiceBasedChannel;
}

// Class to manage playback queue per guild
class AudioQueueManager {
	private queues = new Map<string, QueueItem[]>();
	private activeConnections = new Map<string, VoiceConnection>();
	private activePlayers = new Map<string, AudioPlayer>();
	private disconnectTimers = new Map<string, NodeJS.Timeout>();
	private isPlaying = new Map<string, boolean>();

	/**
	 * Adds an item to the playback queue
	 */
	async addToQueue(guildId: string, item: QueueItem): Promise<void> {
		if (!this.queues.has(guildId)) {
			this.queues.set(guildId, []);
		}

		const queue = this.queues.get(guildId)!;
		queue.push(item);

		console.log(`📥 Item added to queue: "${item.name}" (Position: ${queue.length})`);

		// If not playing, start playback
		if (!this.isPlaying.get(guildId)) {
			await this.processQueue(guildId);
		}
	}

	/**
	 * Processes the playback queue
	 */
	private async processQueue(guildId: string): Promise<void> {
		const queue = this.queues.get(guildId);
		if (!queue || queue.length === 0) {
			this.isPlaying.set(guildId, false);
			return;
		}

		// If already playing, don't process again
		if (this.isPlaying.get(guildId)) {
			return;
		}

		this.isPlaying.set(guildId, true);
		const item = queue.shift()!;

		console.log(`▶️ Playing from queue: "${item.name}" (${queue.length} item(s) remaining)`);

		try {
			await this.playAudio(item.channel, item.mp3Url, item.name);
		} catch (error) {
			console.error(`❌ Error playing "${item.name}":`, error);
		}

		// Process next item in queue
		this.isPlaying.set(guildId, false);
		await this.processQueue(guildId);
	}

	/**
	 * Plays audio in the voice channel
	 */
	private async playAudio(channel: VoiceBasedChannel, mp3Url: string, itemName: string): Promise<void> {
		const guildId = channel.guild.id;

		// Check if adapterCreator is available
		if (!channel.guild.voiceAdapterCreator) {
			throw new Error('Voice adapter creator is not available. The bot may not be fully connected to Discord.');
		}

		// Cancel disconnect timer if it exists
		if (this.disconnectTimers.has(guildId)) {
			console.log('⏸️ Canceling disconnect timer - new playback started');
			clearTimeout(this.disconnectTimers.get(guildId)!);
			this.disconnectTimers.delete(guildId);
		}

		// Get or create voice connection
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
			console.log(`✅ New connection created. Initial state: ${connection.state.status}`);
		} else {
			// If connection exists but is in a different channel, reconnect
			if (connection.joinConfig.channelId !== channel.id) {
				console.log('🔄 Reconnecting to new channel...');
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

		// Get audio stream
		let audioStream: Readable | string = mp3Url;
		try {
			const response = await axios.get(mp3Url, {
				responseType: 'stream',
				timeout: 10000,
			});
			audioStream = response.data;
			console.log('✅ Audio stream obtained successfully');
		} catch (error) {
			console.warn('⚠️ Could not get stream, using URL directly:', error);
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

					// Stop previous player if it exists
					const existingSubscription =
						connection.state.status === VoiceConnectionStatus.Ready ? connection.state.subscription : null;
					if (existingSubscription) {
						console.log('🛑 Stopping previous player...');
						existingSubscription.player.stop();
						existingSubscription.unsubscribe();
					}

					const player = createAudioPlayer();
					this.activePlayers.set(guildId, player);
					console.log('🎵 Audio player created');

					const resource = createAudioResource(audioStream, {
						inlineVolume: true,
					});

					console.log(`🎶 Audio resource created (type: ${typeof audioStream === 'string' ? 'URL' : 'Stream'})`);
					console.log(`🎶 Playing: ${itemName}`);

					resource.volume?.setVolume(1.0);

					if (connection.state.status !== VoiceConnectionStatus.Ready) {
						console.error('❌ Connection is not ready! State:', connection.state.status);
						safeReject(new Error('Voice connection is not ready'));
						return;
					}

					player.play(resource);
					connection.subscribe(player);
					console.log('▶️ Audio started');

					player.on(AudioPlayerStatus.Playing, () => {
						console.log(`🎵 Playing: "${itemName}"`);
					});

					player.on(AudioPlayerStatus.Idle, () => {
						console.log(`⏹️ Audio finished: "${itemName}"`);
						// Schedule disconnect in 5 minutes if there are no more items in queue
						const queue = this.queues.get(guildId);
						if (!queue || queue.length === 0) {
							this.scheduleDisconnect(guildId);
						}
						safeResolve();
					});

					player.on('error', (error) => {
						console.error(`Error in audio player for "${itemName}":`, {
							name: error instanceof Error ? error.name : 'Unknown',
							message: error instanceof Error ? error.message : String(error),
						});
						this.cleanupGuild(guildId);
						safeReject(error);
					});

					player.on('stateChange', (oldState, newState) => {
						console.log(`🎵 Player state change: ${oldState.status} → ${newState.status} (${itemName})`);
					});

					resource.playStream?.on('error', (error) => {
						console.error(`❌ Error in audio stream for "${itemName}":`, error);
					});
				} catch (error) {
					console.error(`❌ Error setting up audio for "${itemName}":`, error);
					this.cleanupGuild(guildId);
					safeReject(error as Error);
				}
			};

			// Listener for connection state changes
			connection.on('stateChange', (oldState, newState) => {
				console.log(`🔄 Connection state change: ${oldState.status} → ${newState.status}`);

				if (newState.status === VoiceConnectionStatus.Disconnected) {
					console.log(
						`🔌 Disconnected from voice channel. Previous state: ${oldState.status}, new state: ${newState.status}`,
					);
					if (!isResolved && oldState.status !== VoiceConnectionStatus.Ready) {
						console.error('❌ Connection disconnected before being ready');
						this.cleanupGuild(guildId);
						safeReject(new Error('Connection lost - check bot permissions on voice channel'));
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

			// Check if connection is already ready
			if (connection.state.status === VoiceConnectionStatus.Ready) {
				createAndPlayAudio();
			} else {
				connection.on(VoiceConnectionStatus.Ready, () => {
					createAndPlayAudio();
				});
			}

			connection.on(VoiceConnectionStatus.Connecting, () => {
				console.log('🔄 Connecting to voice channel...');
			});

			connection.on('error', (error) => {
				console.error('Error in voice connection:', {
					name: error instanceof Error ? error.name : 'Unknown',
					message: error instanceof Error ? error.message : String(error),
				});
				this.cleanupGuild(guildId);
				const errorMessage = error instanceof Error ? error.message : String(error);
				if (errorMessage.includes('permission') || errorMessage.includes('Missing')) {
					safeReject(new Error('No permissions to join voice channel. Check bot permissions.'));
				} else {
					safeReject(error);
				}
			});

			// 20 second timeout
			timeoutId = setTimeout(() => {
				const currentStatus = connection.state.status;
				console.error(`⏱️ Timeout connecting to voice channel. Current state: ${currentStatus}`);
				if (currentStatus !== VoiceConnectionStatus.Ready && currentStatus !== VoiceConnectionStatus.Destroyed) {
					this.cleanupGuild(guildId);
					safeReject(new Error(`Timeout connecting to voice channel. Final state: ${currentStatus}`));
				}
			}, 20000);
		});
	}

	/**
	 * Schedules disconnect after 5 minutes of inactivity
	 */
	private scheduleDisconnect(guildId: string): void {
		if (this.disconnectTimers.has(guildId)) {
			clearTimeout(this.disconnectTimers.get(guildId)!);
		}

		console.log('⏰ Scheduling disconnect in 5 minutes...');
		const timer = setTimeout(
			() => {
				console.log(`🔌 Disconnecting from voice channel after 5 minutes of inactivity (Guild: ${guildId})`);
				this.cleanupGuild(guildId);
			},
			5 * 60 * 1000,
		);

		this.disconnectTimers.set(guildId, timer);
	}

	/**
	 * Cleans up resources for a guild
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
	 * Gets the queue size for a guild
	 */
	getQueueSize(guildId: string): number {
		return this.queues.get(guildId)?.length || 0;
	}

	/**
	 * Clears the queue for a guild
	 */
	clearQueue(guildId: string): void {
		const queue = this.queues.get(guildId);
		if (queue) {
			queue.length = 0;
			console.log(`🗑️ Queue cleared for guild ${guildId}`);
		}
	}

	/**
	 * Stops current playback and clears the queue
	 */
	stop(guildId: string): void {
		this.clearQueue(guildId);
		const player = this.activePlayers.get(guildId);
		if (player) {
			player.stop();
		}
		this.isPlaying.set(guildId, false);
		console.log(`⏹️ Playback stopped for guild ${guildId}`);
	}

	/**
	 * Checks if something is playing in the guild
	 */
	isCurrentlyPlaying(guildId: string): boolean {
		return this.isPlaying.get(guildId) || false;
	}
}

// Singleton instance of queue manager
export const audioQueue = new AudioQueueManager();
