import { COMMAND_FRAMES, COMMAND_INTERVAL_MS, extractHeightSamples } from './protocol';
import type { CommandName } from '../types';

interface SerialEvents {
    onConnectionChange?: (connected: boolean) => void;
    onHeight?: (heightCm: number) => void;
    onStatus?: (message: string) => void;
    onError?: (message: string) => void;
    onCommand?: (command: CommandName) => void;
    onRawData?: (payload: { bytes: number[]; chunkCount: number; totalBytes: number }) => void;
}

const SERIAL_OPTIONS: SerialOptions = {
    baudRate: 9600,
    dataBits: 8,
    stopBits: 1,
    parity: 'none'
};

export class FlexiSpotSerialClient {
    private port: SerialPort | null = null;
    private reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
    private writer: WritableStreamDefaultWriter<Uint8Array> | null = null;
    private pollTimer: number | null = null;
    private wakeTimer: number | null = null;
    private isConnected = false;
    private events: SerialEvents = {};
    private readBuffer: number[] = [];
    private chunkCount = 0;
    private totalBytes = 0;
    private commandIntervalMs = COMMAND_INTERVAL_MS;

    static isSupported(): boolean {
        return 'serial' in navigator;
    }

    static isSecureContext(): boolean {
        return window.isSecureContext;
    }

    setEvents(events: SerialEvents): void {
        this.events = events;
    }

    get connected(): boolean {
        return this.isConnected;
    }

    setCommandInterval(intervalMs: number): void {
        this.commandIntervalMs = intervalMs;
    }

    async connect(): Promise<void> {
        if (!FlexiSpotSerialClient.isSupported()) {
            throw new Error('Web Serial API は未対応です。Chrome または Edge を利用してください。');
        }

        if (!FlexiSpotSerialClient.isSecureContext()) {
            throw new Error('Web Serial API は HTTPS または localhost 上でのみ利用できます。');
        }

        this.port = await navigator.serial.requestPort();
        await this.port.open(SERIAL_OPTIONS);

        this.reader = this.port.readable?.getReader() ?? null;
        this.writer = this.port.writable?.getWriter() ?? null;
        this.isConnected = true;
        this.chunkCount = 0;
        this.totalBytes = 0;

        this.events.onConnectionChange?.(true);
        this.events.onStatus?.('Desk link established');

        void this.startReading();
        this.startWakeHeartbeat();
    }

    async disconnect(): Promise<void> {
        this.stopRepeating();
        this.stopWakeHeartbeat();
        this.isConnected = false;

        try {
            await this.reader?.cancel();
        } catch {
            // Ignore cancellation race during teardown.
        }

        this.reader?.releaseLock();
        this.writer?.releaseLock();

        this.reader = null;
        this.writer = null;
        this.readBuffer = [];
        this.chunkCount = 0;
        this.totalBytes = 0;

        if (this.port) {
            await this.port.close();
            this.port = null;
        }

        this.events.onConnectionChange?.(false);
        this.events.onStatus?.('Desk disconnected');
    }

    async sendCommand(command: CommandName): Promise<void> {
        if (!this.writer || !this.isConnected) {
            throw new Error('デスクに接続されていません。');
        }

        const frame = COMMAND_FRAMES[command];
        await this.writer.write(new Uint8Array(frame));
        this.events.onCommand?.(command);
    }

    requestWake(): void {
        if (!this.isConnected) {
            return;
        }

        void this.sendCommand('WAKE_UP').catch((error: unknown) => {
            this.events.onError?.(toMessage(error));
        });
    }

    startRepeating(command: Extract<CommandName, 'UP' | 'DOWN'>): void {
        this.stopRepeating();
        void this.sendCommand(command).catch((error: unknown) => {
            this.events.onError?.(toMessage(error));
        });

        this.pollTimer = window.setInterval(() => {
            void this.sendCommand(command).catch((error: unknown) => {
                this.events.onError?.(toMessage(error));
                this.stopRepeating();
            });
        }, this.commandIntervalMs);
    }

    stopRepeating(): void {
        if (this.pollTimer !== null) {
            window.clearInterval(this.pollTimer);
            this.pollTimer = null;
        }
    }

    private startWakeHeartbeat(): void {
        this.stopWakeHeartbeat();

        const sendWake = () => {
            if (!this.isConnected) {
                return;
            }

            void this.sendCommand('WAKE_UP').catch((error: unknown) => {
                this.events.onError?.(toMessage(error));
            });
        };

        window.setTimeout(sendWake, 250);
        this.wakeTimer = window.setInterval(sendWake, 2500);
    }

    private stopWakeHeartbeat(): void {
        if (this.wakeTimer !== null) {
            window.clearInterval(this.wakeTimer);
            this.wakeTimer = null;
        }
    }

    private async startReading(): Promise<void> {
        if (!this.reader) {
            return;
        }

        try {
            while (this.isConnected && this.reader) {
                const { value, done } = await this.reader.read();
                if (done) {
                    break;
                }

                if (!value || value.length === 0) {
                    continue;
                }

                this.chunkCount += 1;
                this.totalBytes += value.length;
                this.events.onRawData?.({
                    bytes: Array.from(value),
                    chunkCount: this.chunkCount,
                    totalBytes: this.totalBytes
                });

                this.readBuffer.push(...value);
                const { samples: heights, remainder } = extractHeightSamples(this.readBuffer);
                this.readBuffer = remainder;
                const latest = heights.at(-1);
                if (typeof latest === 'number') {
                    this.events.onHeight?.(latest);
                    this.events.onStatus?.(`Height streaming: ${latest.toFixed(1)} cm`);
                }
            }
        } catch (error) {
            if (this.isConnected) {
                this.events.onError?.(toMessage(error));
            }
        }
    }
}

function toMessage(error: unknown): string {
    if (error instanceof Error) {
        return error.message;
    }

    return 'Unknown serial error';
}
