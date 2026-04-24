import {
    appendDailyHeightRecord,
    loadDailyHeightHistory,
    loadDataSnapshot,
    loadPresets,
    loadSettings,
    mergeDataSnapshots,
    saveDataSnapshot,
    savePresets,
    saveSettings
} from '../state/storage';
import {
    isFirebaseConfigured,
    loadUserSnapshot,
    observeAuthState,
    saveUserSnapshot,
    signInWithGoogleAccount,
    signOutCurrentUser
} from '../firebase/auth';
import { FlexiSpotSerialClient } from '../serial/client';
import type { AppSettings, AppState, AuthUser, CommandName, DailyHeightRecord, DeskPreset, DeskStatus, HeightSample } from '../types';

const APP_VERSION = '2.0.0';
const BUILD_DATE = '2026-03-20';
const HEIGHT_MIN = 60;
const HEIGHT_MAX = 120;
const HEIGHT_HISTORY_LIMIT = 24;
const HEIGHT_SAVE_INTERVAL_MS = 60_000;
const HEIGHT_SAVE_DELTA_CM = 0.4;
const RECENT_CHART_SAMPLE_INTERVAL_MS = 1_000;
const RECENT_CHART_MAX_SAMPLES = 900;
const SETTINGS_MODAL_ID = 'settings-modal';
const PRESET_MODAL_ID = 'preset-editor-modal';

export class FlexiSpotApp {
    private root: HTMLDivElement;
    private serial = new FlexiSpotSerialClient();
    private settings: AppSettings = loadSettings();
    private state: AppState = {
        connectionStatus: 'idle',
        isConnected: false,
        isPresetEditorOpen: false,
        currentHeight: null,
        statusMessage: 'Secure dashboard ready',
        latestError: null,
        activePreset: null,
        lastCommand: null,
        lastHeightSampleAt: null,
        receivedChunkCount: 0,
        receivedByteCount: 0,
        rawPreview: [],
        rawCapture: [],
        capturePaused: !this.settings.diagnosticsAutoCapture,
        settingsOpen: false,
        authStatus: isFirebaseConfigured() ? 'signed-out' : 'disabled',
        authUser: null,
        cloudStatusMessage: isFirebaseConfigured()
            ? 'Google でログインすると設定と履歴を Firebase に保存できます。'
            : 'Firebase 未設定です。VITE_FIREBASE_* を設定すると Google ログインが有効になります。'
    };
    private presets: DeskPreset[] = loadPresets();
    private presetDrafts: Record<CommandName, string> = createPresetDrafts(this.presets);
    private history: HeightSample[] = [];
    private dailyHeightHistory: DailyHeightRecord[] = loadDailyHeightHistory(getTodayKey());
    private lastPersistedHeight: DailyHeightRecord | null = this.dailyHeightHistory.at(-1) ?? null;
    private sessionStartedAt: number | null = null;
    private recentChartHistory: HeightSample[] = [];
    private lastRecentChartSampleAt: number | null = null;
    private authUnsubscribe: (() => void) | null = null;
    private readonly handleDocumentKeyDown = (event: KeyboardEvent) => {
        const activeModal = this.getActiveModalElement();
        if (event.key === 'Tab' && activeModal) {
            trapFocusWithin(activeModal, event);
            return;
        }

        if (this.state.settingsOpen && event.code === 'Escape') {
            event.preventDefault();
            this.patchState({ settingsOpen: false });
            return;
        }

        if (this.state.isPresetEditorOpen && event.code === 'Escape') {
            event.preventDefault();
            this.closePresetEditor();
            return;
        }

        if (this.state.settingsOpen || this.state.isPresetEditorOpen || !this.state.isConnected || event.repeat || isTypingTarget(event.target)) {
            return;
        }

        if (event.code === 'ArrowUp') {
            event.preventDefault();
            this.startManual('UP');
        } else if (event.code === 'ArrowDown') {
            event.preventDefault();
            this.startManual('DOWN');
        } else if (event.code === 'Digit1') {
            event.preventDefault();
            void this.runPreset('PRESET1');
        } else if (event.code === 'Digit2') {
            event.preventDefault();
            void this.runPreset('PRESET2');
        } else if (event.code === 'KeyS') {
            event.preventDefault();
            void this.runPreset('SITTING');
        } else if (event.code === 'KeyT') {
            event.preventDefault();
            void this.runPreset('STANDING');
        }
    };
    private readonly handleDocumentKeyUp = (event: KeyboardEvent) => {
        if (isTypingTarget(event.target)) {
            return;
        }

        if (event.code === 'ArrowUp' || event.code === 'ArrowDown') {
            event.preventDefault();
            this.stopManual();
        }
    };

    constructor(root: HTMLDivElement) {
        this.root = root;
        this.serial.setCommandInterval(this.settings.commandIntervalMs);
        this.applyTheme();
    }

    mount(): void {
        this.serial.setEvents({
            onConnectionChange: (connected) => {
                this.patchState({
                    isConnected: connected,
                    connectionStatus: connected ? 'connected' : 'idle',
                    activePreset: connected ? this.state.activePreset : null,
                    statusMessage: connected ? 'Desk connected and ready' : 'Desk disconnected'
                });
                this.notifyIfEnabled(
                    connected ? 'Desk connected' : 'Desk disconnected',
                    connected ? 'FlexiSpot desk link is ready.' : 'The serial link has been closed.'
                );

                if (connected) {
                    this.sessionStartedAt = Date.now();
                    this.recentChartHistory = [];
                    this.lastRecentChartSampleAt = null;
                } else {
                    this.sessionStartedAt = null;
                    this.recentChartHistory = [];
                    this.lastRecentChartSampleAt = null;
                }
            },
            onHeight: (heightCm) => {
                const sample = {
                    timestamp: Date.now(),
                    valueCm: heightCm
                };

                this.history = [...this.history, sample].slice(-HEIGHT_HISTORY_LIMIT);
                this.persistHeightSample(sample);
                this.appendRecentChartSample(sample);
                this.patchState({
                    currentHeight: heightCm,
                    lastHeightSampleAt: sample.timestamp
                });
            },
            onStatus: (message) => {
                this.patchState({ statusMessage: message });
            },
            onError: (message) => {
                this.patchState({
                    connectionStatus: 'error',
                    latestError: message,
                    statusMessage: message
                });
                this.notifyIfEnabled('Serial error', message);
            },
            onCommand: (command) => {
                this.patchState({ lastCommand: command });
            },
            onRawData: ({ bytes, chunkCount, totalBytes }) => {
                if (this.state.capturePaused) {
                    this.patchState({
                        receivedChunkCount: chunkCount,
                        receivedByteCount: totalBytes
                    });
                    return;
                }

                const preview = formatHex(bytes);
                this.patchState({
                    receivedChunkCount: chunkCount,
                    receivedByteCount: totalBytes,
                    rawPreview: [preview, ...this.state.rawPreview].slice(0, 8),
                    rawCapture: [...this.state.rawCapture, preview].slice(-400)
                });
            }
        });

        this.render();
        this.attachEvents();
        document.addEventListener('keydown', this.handleDocumentKeyDown);
        document.addEventListener('keyup', this.handleDocumentKeyUp);
        this.authUnsubscribe = observeAuthState(
            (user) => {
                void this.handleAuthStateChange(user);
            },
            (message) => {
                this.patchState({
                    authStatus: 'error',
                    cloudStatusMessage: message,
                    latestError: message
                });
            }
        );
    }

    unmount(): void {
        this.authUnsubscribe?.();
        this.authUnsubscribe = null;
        document.removeEventListener('keydown', this.handleDocumentKeyDown);
        document.removeEventListener('keyup', this.handleDocumentKeyUp);
        this.root.innerHTML = '';
    }

    private patchState(next: Partial<AppState>): void {
        this.state = { ...this.state, ...next };
        this.render();
        this.attachEvents();
    }

    private render(): void {
        const supported = FlexiSpotSerialClient.isSupported();
        const secure = FlexiSpotSerialClient.isSecureContext();
        const heightPercentage = this.state.currentHeight === null
            ? 0
            : clamp(((this.state.currentHeight - HEIGHT_MIN) / (HEIGHT_MAX - HEIGHT_MIN)) * 100, 0, 100);
        const chart = this.renderDailyChart();
        const supportMessage = this.getSupportMessage(supported, secure);

        this.root.innerHTML = `
            <div class="shell">
                <section class="top-strip">
                    <div class="top-strip-copy">
                        <p class="eyebrow">FlexiSpot Desk Controller</p>
                        <h1>Control your desk from PC.</h1>
                        <p class="lede">Chrome / Edge で開いて Connect を押すと、FlexiSpot 昇降デスクをブラウザから操作できます。</p>
                    </div>
                    <div class="top-strip-metric">
                        <div class="top-strip-actions">
                            <div class="hero-badges">
                                <span class="badge ${this.statusTone(this.state.connectionStatus)}">${this.statusLabel(this.state.connectionStatus)}</span>
                                <span class="badge neutral">v${APP_VERSION}</span>
                            </div>
                            <div class="auth-actions">
                                <span class="badge ${this.cloudStatusTone()}">${this.cloudStatusLabel()}</span>
                                ${this.state.authUser
                                    ? `<button class="button ghost" data-action="sign-out">Sign out</button>`
                                    : `<button class="button ghost" data-action="sign-in" ${this.state.authStatus === 'disabled' || this.state.authStatus === 'authenticating' ? 'disabled' : ''}>Google Sign-In</button>`}
                                <button class="button ghost" data-action="open-settings">Settings</button>
                            </div>
                        </div>
                        <p class="auth-summary">${this.escapeHtml(this.formatCloudSummary())}</p>
                        <p class="metric-label">Current Height</p>
                        <div class="metric-value-row top-strip-metric-row">
                            <span class="metric-value top-strip-metric-value">${this.state.currentHeight?.toFixed(1) ?? '--'}</span>
                            <span class="metric-unit">cm</span>
                        </div>
                        <div class="metric-bar">
                            <div class="metric-bar-fill" style="width:${heightPercentage}%"></div>
                        </div>
                        <div class="metric-scale">
                            <span>${HEIGHT_MIN} cm</span>
                            <span>${HEIGHT_MAX} cm</span>
                        </div>
                        <p class="metric-caption">${this.formatHeightStatus()}</p>
                    </div>
                </section>

                <section class="dashboard-grid dashboard-grid-controls">
                    <article class="panel panel-connection">
                        <div class="panel-head">
                            <div>
                                <p class="panel-kicker">Connection</p>
                                <h2>Desk Link</h2>
                            </div>
                        </div>
                        <p class="panel-body" role="status" aria-live="polite">${this.escapeHtml(this.state.statusMessage)}</p>
                        <div class="button-row">
                            <button class="button primary" data-action="connect" aria-label="Connect to desk" ${!supported || !secure || this.state.isConnected ? 'disabled' : ''}>Connect</button>
                            <button class="button secondary" data-action="disconnect" aria-label="Disconnect from desk" ${this.state.isConnected ? '' : 'disabled'}>Disconnect</button>
                        </div>
                        ${supportMessage ? `<p class="support-note">${this.escapeHtml(supportMessage)}</p>` : ''}
                    </article>

                    <article class="panel panel-motion">
                        <div class="panel-head">
                            <div>
                                <p class="panel-kicker">Manual Control</p>
                                <h2>Move</h2>
                            </div>
                            <p class="shortcut-hint">Arrow Up / Arrow Down</p>
                        </div>
                        <div class="motion-grid">
                            <button class="control control-up" data-hold="UP" aria-label="Raise desk while pressed" ${this.state.isConnected ? '' : 'disabled'}>
                                <span>Raise</span>
                                <strong>UP</strong>
                            </button>
                            <button class="control control-down" data-hold="DOWN" aria-label="Lower desk while pressed" ${this.state.isConnected ? '' : 'disabled'}>
                                <span>Lower</span>
                                <strong>DOWN</strong>
                            </button>
                        </div>
                    </article>

                    <article class="panel panel-scenes">
                        <div class="panel-head">
                            <div>
                                <p class="panel-kicker">Quick Scenes</p>
                                <h2>Presets</h2>
                            </div>
                            <button class="button ghost" data-action="customize" aria-haspopup="dialog" aria-expanded="${this.state.isPresetEditorOpen ? 'true' : 'false'}">Labels</button>
                        </div>
                        <div class="preset-grid">
                            ${this.presets.map((preset) => this.renderPreset(preset)).join('')}
                        </div>
                    </article>
                </section>

                <section class="dashboard-grid dashboard-grid-height">
                    <article class="panel">
                        <div class="panel-head">
                            <div>
                                <p class="panel-kicker">Telemetry</p>
                                <h2>Recent Samples</h2>
                            </div>
                            <p class="shortcut-hint">${this.state.lastHeightSampleAt ? this.formatTime(this.state.lastHeightSampleAt) : 'No signal'}</p>
                        </div>
                        <div class="history-list">
                            ${this.renderHistory()}
                        </div>
                    </article>

                    <article class="panel panel-wide">
                        <div class="panel-head">
                            <div>
                                <p class="panel-kicker">Timeline</p>
                                <h2>Today</h2>
                            </div>
                            <p class="shortcut-hint">${chart.sampleCount} samples today</p>
                        </div>
                        <div class="chart-card">
                            ${chart.svg}
                            <div class="chart-footer">
                                <span>00:00</span>
                                <span>12:00</span>
                                <span>23:59</span>
                            </div>
                        </div>
                        <div class="chart-stats">
                            <div>
                                <dt>Min</dt>
                                <dd>${chart.minLabel}</dd>
                            </div>
                            <div>
                                <dt>Max</dt>
                                <dd>${chart.maxLabel}</dd>
                            </div>
                            <div>
                                <dt>Latest</dt>
                                <dd>${chart.latestLabel}</dd>
                            </div>
                        </div>
                    </article>
                </section>

                <section class="dashboard-grid">
                    <article class="panel">
                        <div class="panel-head">
                            <div>
                                <p class="panel-kicker">Session</p>
                                <h2>Operational Notes</h2>
                            </div>
                        </div>
                        <dl class="facts">
                            <div>
                                <dt>Last Command</dt>
                                <dd>${this.state.lastCommand ?? 'None'}</dd>
                            </div>
                            <div>
                                <dt>Preset In Flight</dt>
                                <dd>${this.state.activePreset ?? 'None'}</dd>
                            </div>
                            <div>
                                <dt>Build</dt>
                                <dd>${BUILD_DATE}</dd>
                            </div>
                            <div>
                                <dt>Theme</dt>
                                <dd>${this.formatThemeLabel()}</dd>
                            </div>
                            <div>
                                <dt>Command Interval</dt>
                                <dd>${this.settings.commandIntervalMs} ms</dd>
                            </div>
                        </dl>
                    </article>

                    <article class="panel panel-wide">
                        <details class="diagnostics-panel">
                            <summary class="diagnostics-summary">
                                <div>
                                    <p class="panel-kicker">Diagnostics</p>
                                    <h2>Serial RX Monitor</h2>
                                </div>
                                <span class="shortcut-hint">${String(this.state.receivedChunkCount)} chunks / ${String(this.state.receivedByteCount)} bytes</span>
                            </summary>
                            <div class="diagnostics-content">
                                <div class="actions-inline">
                                    <button class="button ghost small" data-action="wake" aria-label="Send wake command" ${this.state.isConnected ? '' : 'disabled'}>Send Wake</button>
                                    <button class="button ghost small" data-action="pause" aria-pressed="${this.state.capturePaused ? 'true' : 'false'}">${this.state.capturePaused ? 'Resume' : 'Pause'}</button>
                                    <button class="button ghost small" data-action="copy" aria-label="Copy captured serial data" ${this.state.rawCapture.length > 0 ? '' : 'disabled'}>Copy</button>
                                    <button class="button ghost small" data-action="clear" aria-label="Clear captured serial data">Clear</button>
                                </div>
                                <dl class="facts facts-compact">
                                    <div>
                                        <dt>RX Chunks</dt>
                                        <dd>${String(this.state.receivedChunkCount)}</dd>
                                    </div>
                                    <div>
                                        <dt>RX Bytes</dt>
                                        <dd>${String(this.state.receivedByteCount)}</dd>
                                    </div>
                                    <div>
                                        <dt>Decode State</dt>
                                        <dd>${this.state.currentHeight === null ? 'No parsed height yet' : 'Height parsed'}</dd>
                                    </div>
                                </dl>
                                <div class="raw-log" role="log" aria-live="polite" aria-label="Serial receive log">
                                    ${this.renderRawPreview()}
                                </div>
                            </div>
                        </details>
                    </article>
                </section>

                ${this.state.latestError ? `
                    <section class="toast" role="alert">
                        <div>
                            <p class="toast-title">Serial Error</p>
                            <p class="toast-message">${this.escapeHtml(this.state.latestError)}</p>
                        </div>
                        <button class="button ghost small" data-action="dismiss-error">Dismiss</button>
                    </section>
                ` : ''}

                ${this.renderSettingsModal()}
                ${this.state.isPresetEditorOpen ? this.renderPresetEditor() : ''}
            </div>
        `;
    }

    private attachEvents(): void {
        this.root.querySelector('[data-action="connect"]')?.addEventListener('click', () => {
            this.handleConnect();
        });

        this.root.querySelector('[data-action="disconnect"]')?.addEventListener('click', () => {
            this.handleDisconnect();
        });

        this.root.querySelector('[data-action="dismiss-error"]')?.addEventListener('click', () => {
            this.patchState({
                latestError: null,
                connectionStatus: this.state.isConnected ? 'connected' : 'idle'
            });
        });

        this.root.querySelector('[data-action="customize"]')?.addEventListener('click', () => {
            this.openPresetEditor();
        });

        this.root.querySelector('[data-action="open-settings"]')?.addEventListener('click', () => {
            this.patchState({ settingsOpen: true });
        });

        this.root.querySelector('[data-action="sign-in"]')?.addEventListener('click', () => {
            void this.handleSignIn();
        });

        this.root.querySelector('[data-action="sign-out"]')?.addEventListener('click', () => {
            void this.handleSignOut();
        });

        this.root.querySelector('[data-action="close-settings"]')?.addEventListener('click', () => {
            this.patchState({ settingsOpen: false });
        });

        this.root.querySelector('[data-action="cancel-settings"]')?.addEventListener('click', () => {
            this.patchState({ settingsOpen: false });
        });

        this.root.querySelector('[data-settings-backdrop]')?.addEventListener('click', (event) => {
            if (event.target === event.currentTarget) {
                this.patchState({ settingsOpen: false });
            }
        });

        this.root.querySelector<HTMLFormElement>('[data-settings-form]')?.addEventListener('submit', async (event) => {
            event.preventDefault();
            await this.handleSaveSettings(event.currentTarget as HTMLFormElement);
        });

        this.root.querySelector('[data-action="wake"]')?.addEventListener('click', () => {
            this.serial.requestWake();
        });

        this.root.querySelector('[data-action="pause"]')?.addEventListener('click', () => {
            this.patchState({
                capturePaused: !this.state.capturePaused
            });
        });

        this.root.querySelector('[data-action="copy"]')?.addEventListener('click', async () => {
            await this.copyCapture();
        });

        this.root.querySelector('[data-action="clear"]')?.addEventListener('click', () => {
            this.serial.resetDiagnostics();
            this.patchState({
                rawPreview: [],
                rawCapture: [],
                receivedChunkCount: 0,
                receivedByteCount: 0
            });
        });

        this.root.querySelector('[data-action="close-preset-editor"]')?.addEventListener('click', () => {
            this.closePresetEditor();
        });

        this.root.querySelector('[data-action="save-preset-labels"]')?.addEventListener('click', () => {
            this.savePresetDrafts();
        });

        this.root.querySelectorAll<HTMLInputElement>('[data-preset-input]').forEach((input) => {
            input.addEventListener('input', () => {
                const presetId = input.dataset.presetInput as CommandName;
                this.handlePresetDraftInput(presetId, input.value);
            });
        });

        this.root.querySelectorAll<HTMLElement>('[data-preset]').forEach((button) => {
            button.addEventListener('click', () => {
                const command = button.dataset.preset as CommandName;
                void this.runPreset(command);
            });
        });

        this.root.querySelectorAll<HTMLElement>('[data-hold]').forEach((button) => {
            const start = () => this.startManual(button.dataset.hold as 'UP' | 'DOWN');
            const stop = () => this.stopManual();

            button.addEventListener('pointerdown', start);
            button.addEventListener('pointerup', stop);
            button.addEventListener('pointerleave', stop);
            button.addEventListener('pointercancel', stop);
        });

        if (this.state.isPresetEditorOpen) {
            this.root.querySelector<HTMLInputElement>('[data-preset-input]')?.focus();
        }

        if (this.state.settingsOpen) {
            this.root.querySelector<HTMLElement>(`#${SETTINGS_MODAL_ID} button, #${SETTINGS_MODAL_ID} input, #${SETTINGS_MODAL_ID} select`)?.focus();
        }
    }

    private async handleConnect(): Promise<void> {
        this.patchState({
            connectionStatus: 'connecting',
            latestError: null,
            statusMessage: 'Waiting for serial port selection'
        });

        try {
            await this.serial.connect();
        } catch (error) {
            this.patchState({
                connectionStatus: 'error',
                latestError: toMessage(error),
                statusMessage: toMessage(error)
            });
        }
    }

    private async handleDisconnect(): Promise<void> {
        try {
            await this.serial.disconnect();
            this.patchState({
                currentHeight: null,
                activePreset: null,
                receivedChunkCount: 0,
                receivedByteCount: 0,
                rawPreview: [],
                rawCapture: [],
                capturePaused: !this.settings.diagnosticsAutoCapture
            });
        } catch (error) {
            this.patchState({
                latestError: toMessage(error),
                connectionStatus: 'error'
            });
        }
    }

    private startManual(direction: 'UP' | 'DOWN'): void {
        if (!this.state.isConnected) {
            return;
        }

        this.serial.startRepeating(direction);
        this.patchState({
            connectionStatus: direction === 'UP' ? 'moving-up' : 'moving-down',
            statusMessage: direction === 'UP' ? 'Desk moving up' : 'Desk moving down',
            activePreset: null
        });
    }

    private stopManual(): void {
        this.serial.stopRepeating();
        if (!this.state.isConnected) {
            return;
        }

        this.patchState({
            connectionStatus: 'connected',
            statusMessage: 'Motion stopped'
        });
    }

    private async runPreset(command: CommandName): Promise<void> {
        if (!this.state.isConnected) {
            this.patchState({
                latestError: 'デスクに接続されていません。',
                connectionStatus: 'error'
            });
            return;
        }

        try {
            await this.serial.sendCommand(command);
            this.patchState({
                activePreset: command,
                connectionStatus: 'preset-running',
                statusMessage: `${command} triggered`
            });

            window.setTimeout(() => {
                if (this.state.activePreset === command) {
                    this.patchState({
                        activePreset: null,
                        connectionStatus: this.state.isConnected ? 'connected' : 'idle',
                        statusMessage: `${command} completed`
                    });
                    this.notifyIfEnabled('Preset completed', `${command} finished on the connected desk.`);
                }
            }, 8000);
        } catch (error) {
            this.patchState({
                latestError: toMessage(error),
                connectionStatus: 'error'
            });
        }
    }

    private openPresetEditor(): void {
        this.presetDrafts = createPresetDrafts(this.presets);
        this.patchState({
            isPresetEditorOpen: true
        });
    }

    private closePresetEditor(): void {
        this.patchState({
            isPresetEditorOpen: false
        });
    }

    private handlePresetDraftInput(command: CommandName, value: string): void {
        this.presetDrafts = {
            ...this.presetDrafts,
            [command]: value
        };
    }

    private savePresetDrafts(): void {
        const next = this.presets.map((preset) => ({
            ...preset,
            label: this.presetDrafts[preset.id].trim() || preset.label
        }));

        this.presets = savePresets(next);
        void this.syncCloudSnapshot('Preset labels updated');
        this.patchState({
            isPresetEditorOpen: false,
            statusMessage: 'Preset labels updated'
        });
    }

    private renderPresetEditor(): string {
        return `
            <div class="modal-scrim" data-action="close-preset-editor"></div>
            <section class="modal-card" id="${PRESET_MODAL_ID}" role="dialog" aria-modal="true" aria-labelledby="preset-editor-title" aria-describedby="preset-editor-help">
                <div class="panel-head modal-head">
                    <div>
                        <p class="panel-kicker">Quick Scenes</p>
                        <h2 id="preset-editor-title">Preset Labels</h2>
                    </div>
                    <button class="button ghost small" data-action="close-preset-editor" aria-label="Close preset editor">Close</button>
                </div>
                <div class="preset-editor-grid">
                    ${this.presets.map((preset) => `
                        <label class="preset-editor-field">
                            <span>${preset.id}</span>
                            <input
                                type="text"
                                maxlength="24"
                                value="${this.escapeAttribute(this.presetDrafts[preset.id] ?? preset.label)}"
                                data-preset-input="${preset.id}"
                                aria-label="${preset.id} label"
                            />
                        </label>
                    `).join('')}
                </div>
                <p class="muted" id="preset-editor-help">Esc でも閉じられます。空欄は現在のラベルを維持します。</p>
                <div class="button-row modal-actions">
                    <button class="button secondary" data-action="close-preset-editor">Cancel</button>
                    <button class="button primary" data-action="save-preset-labels">Save</button>
                </div>
            </section>
        `;
    }

    private renderPreset(preset: DeskPreset): string {
        const active = this.state.activePreset === preset.id ? 'active' : '';
        return `
            <button class="preset-card ${preset.accent} ${active}" data-preset="${preset.id}" ${this.state.isConnected ? '' : 'disabled'}>
                <span class="preset-label">${this.escapeHtml(preset.label)}</span>
                <strong>${preset.id}</strong>
                <span class="preset-description">${this.escapeHtml(preset.description)}</span>
                <span class="preset-shortcut">Shortcut ${this.escapeHtml(preset.shortcut)}</span>
            </button>
        `;
    }

    private renderHistory(): string {
        if (this.history.length === 0) {
            return '<p class="empty-state">高さストリーム受信後に履歴が表示されます。</p>';
        }

        return this.history
            .slice()
            .reverse()
            .map((sample) => `
                <div class="history-item">
                    <strong>${sample.valueCm.toFixed(1)} cm</strong>
                    <span>${this.formatTime(sample.timestamp)}</span>
                </div>
            `)
            .join('');
    }

    private renderSettingsModal(): string {
        if (!this.state.settingsOpen) {
            return '';
        }

        const notificationsAvailable = typeof Notification !== 'undefined';
        const notificationLabel = !notificationsAvailable
            ? 'Unsupported in this browser'
            : Notification.permission === 'granted'
                ? 'Permission granted'
                : Notification.permission === 'denied'
                    ? 'Permission denied'
                    : 'Permission not requested';

        return `
            <section class="modal-backdrop" data-settings-backdrop>
                <div class="modal-card" id="${SETTINGS_MODAL_ID}" role="dialog" aria-modal="true" aria-labelledby="settings-title">
                    <div class="panel-head modal-head">
                        <div>
                            <p class="panel-kicker">Preferences</p>
                            <h2 id="settings-title">Settings</h2>
                        </div>
                        <button class="button ghost small" type="button" data-action="close-settings">Close</button>
                    </div>
                    <form class="settings-form" data-settings-form>
                        <label class="settings-block">
                            <span class="settings-label">Theme</span>
                            <span class="settings-help">ライト / ダーク / システム追従を切り替えます。</span>
                            <select name="theme" class="settings-field">
                                ${this.renderThemeOptions()}
                            </select>
                        </label>
                        <label class="settings-block">
                            <span class="settings-label">Command interval</span>
                            <span class="settings-help">UP / DOWN ホールド時の送信間隔です。短くするほど反応は速くなります。</span>
                            <input name="commandIntervalMs" class="settings-field" type="number" min="48" max="500" step="4" value="${String(this.settings.commandIntervalMs)}" />
                        </label>
                        <label class="settings-toggle">
                            <input type="checkbox" name="diagnosticsAutoCapture" ${this.settings.diagnosticsAutoCapture ? 'checked' : ''} />
                            <span>
                                <strong>Capture diagnostics by default</strong>
                                <small>接続時に Serial RX Monitor のキャプチャを自動開始します。</small>
                            </span>
                        </label>
                        <label class="settings-toggle">
                            <input type="checkbox" name="notificationsEnabled" ${this.settings.notificationsEnabled ? 'checked' : ''} ${notificationsAvailable ? '' : 'disabled'} />
                            <span>
                                <strong>Enable desktop notifications</strong>
                                <small>${notificationLabel}</small>
                            </span>
                        </label>
                        <div class="settings-actions">
                            <button class="button ghost" type="button" data-action="cancel-settings">Cancel</button>
                            <button class="button primary" type="submit">Save settings</button>
                        </div>
                    </form>
                </div>
            </section>
        `;
    }

    private renderDailyChart(): {
        svg: string;
        sampleCount: number;
        minLabel: string;
        maxLabel: string;
        latestLabel: string;
    } {
        if (this.dailyHeightHistory.length === 0) {
            return {
                svg: '<p class="empty-state">今日の高さ履歴はまだありません。接続したまま少し使うと自動で保存されます。</p>',
                sampleCount: 0,
                minLabel: '--',
                maxLabel: '--',
                latestLabel: '--'
            };
        }

        const width = 760;
        const height = 220;
        const padding = 18;
        const points = this.dailyHeightHistory.map((record) => {
            const date = new Date(record.timestamp);
            const minutes = date.getHours() * 60 + date.getMinutes() + date.getSeconds() / 60;
            const x = padding + (minutes / (24 * 60)) * (width - padding * 2);
            const y = padding + (1 - ((record.valueCm - HEIGHT_MIN) / (HEIGHT_MAX - HEIGHT_MIN))) * (height - padding * 2);
            return `${x.toFixed(1)},${clamp(y, padding, height - padding).toFixed(1)}`;
        });
        const values = this.dailyHeightHistory.map((record) => record.valueCm);
        const latest = this.dailyHeightHistory.at(-1)?.valueCm ?? null;
        const ticks = [120, 90, 60];

        return {
            svg: `
                <svg class="height-chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="Today's desk height chart">
                    ${this.renderChartTicks({
                        width,
                        height,
                        padding,
                        ticks,
                        mode: 'fixed'
                    })}
                    <polyline points="${points.join(' ')}" class="chart-line"></polyline>
                </svg>
            `,
            sampleCount: this.dailyHeightHistory.length,
            minLabel: `${Math.min(...values).toFixed(1)} cm`,
            maxLabel: `${Math.max(...values).toFixed(1)} cm`,
            latestLabel: latest === null ? '--' : `${latest.toFixed(1)} cm`
        };
    }

    private renderSessionChart(): {
        svg: string;
        sampleCount: number;
        minLabel: string;
        maxLabel: string;
        durationLabel: string;
        startLabel: string;
        middleLabel: string;
        endLabel: string;
    } {
        if (this.recentChartHistory.length === 0 || this.sessionStartedAt === null) {
            return {
                svg: '<p class="empty-state">接続後の高さを 30 秒ごとにプロットします。少し使うと、使い始め基準の流れが見えるようになります。</p>',
                sampleCount: 0,
                minLabel: '--',
                maxLabel: '--',
                durationLabel: '--',
                startLabel: '--:--',
                middleLabel: '--:--',
                endLabel: '--:--'
            };
        }

        const rangeStart = this.sessionStartedAt;
        const rangeEnd = this.recentChartHistory.at(-1)?.timestamp ?? rangeStart;
        const midpoint = rangeStart + (rangeEnd - rangeStart) / 2;
        const chart = this.buildChartSvg(this.recentChartHistory, rangeStart, rangeEnd);

        return {
            svg: chart.svg,
            sampleCount: this.recentChartHistory.length,
            minLabel: chart.minLabel,
            maxLabel: chart.maxLabel,
            durationLabel: formatDuration(rangeEnd - rangeStart),
            startLabel: this.formatTime(rangeStart),
            middleLabel: this.formatTime(midpoint),
            endLabel: this.formatTime(rangeEnd)
        };
    }

    private renderRawPreview(): string {
        if (this.state.rawPreview.length === 0) {
            return '<p class="empty-state">まだ受信バイトがありません。ここが空なら、現状は高さデコード以前に RX が来ていません。</p>';
        }

        return this.state.rawPreview
            .map((line) => `<code class="raw-line">${this.escapeHtml(line)}</code>`)
            .join('');
    }

    private formatHeightStatus(): string {
        if (this.state.currentHeight === null) {
            return '高さブロードキャスト待機中';
        }

        const posture = this.state.currentHeight >= 100 ? 'Standing zone' : 'Sitting zone';
        return `${posture} · last update ${this.state.lastHeightSampleAt ? this.formatTime(this.state.lastHeightSampleAt) : '--:--:--'}`;
    }

    private statusLabel(status: DeskStatus): string {
        switch (status) {
            case 'connecting':
                return 'Connecting';
            case 'connected':
                return 'Online';
            case 'moving-up':
                return 'Rising';
            case 'moving-down':
                return 'Lowering';
            case 'preset-running':
                return 'Preset';
            case 'error':
                return 'Attention';
            default:
                return 'Idle';
        }
    }

    private statusTone(status: DeskStatus): string {
        switch (status) {
            case 'connected':
                return 'tone-green';
            case 'moving-up':
            case 'moving-down':
            case 'preset-running':
                return 'tone-amber';
            case 'error':
                return 'tone-red';
            case 'connecting':
                return 'tone-blue';
            default:
                return 'tone-slate';
        }
    }

    private formatTime(timestamp: number): string {
        return new Intl.DateTimeFormat('ja-JP', {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        }).format(timestamp);
    }

    private escapeHtml(text: string): string {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    private escapeAttribute(text: string): string {
        return text
            .replaceAll('&', '&amp;')
            .replaceAll('"', '&quot;')
            .replaceAll("'", '&#39;')
            .replaceAll('<', '&lt;')
            .replaceAll('>', '&gt;');
    }

    private async copyCapture(): Promise<void> {
        if (this.state.rawCapture.length === 0) {
            return;
        }

        const payload = this.state.rawCapture.join('\n');
        try {
            await navigator.clipboard.writeText(payload);
            this.patchState({
                statusMessage: `Copied ${this.state.rawCapture.length} RX lines to clipboard`
            });
        } catch {
            this.patchState({
                latestError: 'クリップボードへのコピーに失敗しました。'
            });
        }
    }

    private persistHeightSample(sample: HeightSample): void {
        const dayKey = getDayKey(sample.timestamp);
        const last = this.lastPersistedHeight;

        if (last && getDayKey(last.timestamp) !== dayKey) {
            this.dailyHeightHistory = loadDailyHeightHistory(dayKey);
            this.lastPersistedHeight = this.dailyHeightHistory.at(-1) ?? null;
        }

        const shouldPersist = !this.lastPersistedHeight
            || sample.timestamp - this.lastPersistedHeight.timestamp >= HEIGHT_SAVE_INTERVAL_MS
            || Math.abs(sample.valueCm - this.lastPersistedHeight.valueCm) >= HEIGHT_SAVE_DELTA_CM;

        if (!shouldPersist) {
            return;
        }

        const record = {
            timestamp: sample.timestamp,
            valueCm: sample.valueCm
        };

        this.dailyHeightHistory = appendDailyHeightRecord(dayKey, record);
        this.lastPersistedHeight = record;
        void this.syncCloudSnapshot();
    }

    private appendRecentChartSample(sample: HeightSample): void {
        const lastSampleAt = this.lastRecentChartSampleAt;
        if (lastSampleAt !== null && sample.timestamp - lastSampleAt < RECENT_CHART_SAMPLE_INTERVAL_MS) {
            return;
        }

        this.recentChartHistory = [...this.recentChartHistory, sample].slice(-RECENT_CHART_MAX_SAMPLES);
        this.lastRecentChartSampleAt = sample.timestamp;
    }

    private buildChartSvg(
        records: Array<{ timestamp: number; valueCm: number }>,
        rangeStart: number,
        rangeEnd: number
    ): {
        svg: string;
        minLabel: string;
        maxLabel: string;
    } {
        const width = 760;
        const height = 220;
        const padding = 18;
        const span = Math.max(rangeEnd - rangeStart, 1);
        const values = records.map((record) => record.valueCm);
        const minValue = Math.min(...values);
        const maxValue = Math.max(...values);
        const middleValue = (minValue + maxValue) / 2;
        const points = records.map((record) => {
            const x = padding + ((record.timestamp - rangeStart) / span) * (width - padding * 2);
            const y = padding + (1 - ((record.valueCm - HEIGHT_MIN) / (HEIGHT_MAX - HEIGHT_MIN))) * (height - padding * 2);
            return `${x.toFixed(1)},${clamp(y, padding, height - padding).toFixed(1)}`;
        });

        return {
            svg: `
                <svg class="height-chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="Desk height chart">
                    ${this.renderChartTicks({
                        width,
                        height,
                        padding,
                        ticks: [maxValue, middleValue, minValue],
                        mode: 'dynamic'
                    })}
                    <polyline points="${points.join(' ')}" class="chart-line"></polyline>
                </svg>
            `,
            minLabel: `${Math.min(...values).toFixed(1)} cm`,
            maxLabel: `${Math.max(...values).toFixed(1)} cm`
        };
    }

    private renderChartTicks(params: {
        width: number;
        height: number;
        padding: number;
        ticks: number[];
        mode: 'fixed' | 'dynamic';
    }): string {
        const { width, height, padding, ticks, mode } = params;
        const axisLine = `
            <line x1="${padding}" y1="${padding}" x2="${padding}" y2="${height - padding}" class="chart-axis"></line>
            <line x1="${padding}" y1="${height - padding}" x2="${width - padding}" y2="${height - padding}" class="chart-axis"></line>
        `;

        const lines = ticks.map((tick, index) => {
            const ratio = mode === 'fixed'
                ? (tick - HEIGHT_MIN) / (HEIGHT_MAX - HEIGHT_MIN)
                : ticks.length === 1
                    ? 0.5
                    : 1 - index / (ticks.length - 1);
            const y = padding + (1 - ratio) * (height - padding * 2);

            return `
                <line x1="${padding}" y1="${y}" x2="${width - padding}" y2="${y}" class="${index === ticks.length - 1 ? 'chart-axis' : 'chart-grid'}"></line>
                <text x="${padding - 8}" y="${y + 4}" text-anchor="end" class="chart-tick-label">${tick.toFixed(1)} cm</text>
            `;
        }).join('');

        return axisLine + lines;
    }

    private renderThemeOptions(): string {
        return ['system', 'light', 'dark']
            .map((theme) => `<option value="${theme}" ${this.settings.theme === theme ? 'selected' : ''}>${this.formatThemeOption(theme as AppSettings['theme'])}</option>`)
            .join('');
    }

    private formatThemeOption(theme: AppSettings['theme']): string {
        switch (theme) {
            case 'light':
                return 'Light';
            case 'dark':
                return 'Dark';
            default:
                return 'System';
        }
    }

    private formatThemeLabel(): string {
        return this.formatThemeOption(this.settings.theme);
    }

    private async handleSaveSettings(form: HTMLFormElement): Promise<void> {
        const formData = new FormData(form);
        const nextSettings = saveSettings({
            theme: readThemeValue(formData.get('theme')),
            notificationsEnabled: formData.get('notificationsEnabled') === 'on',
            diagnosticsAutoCapture: formData.get('diagnosticsAutoCapture') === 'on',
            commandIntervalMs: Number(formData.get('commandIntervalMs'))
        });

        if (nextSettings.notificationsEnabled) {
            const permissionGranted = await this.ensureNotificationPermission();
            if (!permissionGranted) {
                nextSettings.notificationsEnabled = false;
                saveSettings(nextSettings);
            }
        }

        this.settings = nextSettings;
        this.serial.setCommandInterval(this.settings.commandIntervalMs);
        this.applyTheme();
        this.patchState({
            settingsOpen: false,
            capturePaused: this.settings.diagnosticsAutoCapture ? this.state.capturePaused : true,
            statusMessage: 'Settings updated'
        });
        await this.syncCloudSnapshot('Settings updated');
    }

    private applyTheme(): void {
        const root = document.documentElement;
        if (this.settings.theme === 'system') {
            delete root.dataset.theme;
            return;
        }

        root.dataset.theme = this.settings.theme;
    }

    private async ensureNotificationPermission(): Promise<boolean> {
        if (typeof Notification === 'undefined') {
            this.patchState({
                latestError: 'このブラウザでは通知を利用できません。'
            });
            return false;
        }

        if (Notification.permission === 'granted') {
            return true;
        }

        if (Notification.permission === 'denied') {
            this.patchState({
                latestError: 'ブラウザ通知が拒否されています。権限設定を確認してください。'
            });
            return false;
        }

        return Notification.requestPermission().then((permission) => permission === 'granted');
    }

    private notifyIfEnabled(title: string, body: string): void {
        if (!this.settings.notificationsEnabled || typeof Notification === 'undefined') {
            return;
        }

        if (Notification.permission !== 'granted' || document.visibilityState === 'visible') {
            return;
        }

        void new Notification(title, { body });
    }

    private getActiveModalElement(): HTMLElement | null {
        if (this.state.isPresetEditorOpen) {
            return document.getElementById(PRESET_MODAL_ID);
        }

        if (this.state.settingsOpen) {
            return document.getElementById(SETTINGS_MODAL_ID);
        }

        return null;
    }

    private getSupportMessage(supported: boolean, secure: boolean): string | null {
        if (!supported) {
            return 'Chrome / Edge 系ブラウザで開いてください。';
        }

        if (!secure) {
            return 'HTTPS または localhost で開いてください。';
        }

        if (!this.state.isConnected) {
            return '接続すると操作と高さ表示が有効になります。';
        }

        return null;
    }

    private async handleSignIn(): Promise<void> {
        if (!isFirebaseConfigured()) {
            this.patchState({
                authStatus: 'disabled',
                latestError: 'Firebase 未設定です。VITE_FIREBASE_* を設定してください。'
            });
            return;
        }

        this.patchState({
            authStatus: 'authenticating',
            cloudStatusMessage: 'Google アカウントを確認しています。'
        });

        try {
            await signInWithGoogleAccount();
        } catch (error) {
            this.patchState({
                authStatus: this.state.authUser ? 'signed-in' : 'signed-out',
                latestError: toMessage(error),
                cloudStatusMessage: toMessage(error)
            });
        }
    }

    private async handleSignOut(): Promise<void> {
        try {
            await signOutCurrentUser();
            this.patchState({
                authStatus: 'signed-out',
                authUser: null,
                cloudStatusMessage: 'ローカル保存に切り替えました。'
            });
        } catch (error) {
            this.patchState({
                authStatus: 'error',
                latestError: toMessage(error),
                cloudStatusMessage: toMessage(error)
            });
        }
    }

    private async handleAuthStateChange(user: AuthUser | null): Promise<void> {
        if (!isFirebaseConfigured()) {
            this.patchState({
                authStatus: 'disabled',
                authUser: null
            });
            return;
        }

        if (!user) {
            this.patchState({
                authStatus: 'signed-out',
                authUser: null,
                cloudStatusMessage: 'Google でログインすると設定と履歴を Firebase に保存できます。'
            });
            return;
        }

        this.patchState({
            authStatus: 'syncing',
            authUser: user,
            cloudStatusMessage: 'Firebase から保存データを同期しています。'
        });

        try {
            const localSnapshot = loadDataSnapshot();
            const remoteSnapshot = await loadUserSnapshot(user.uid);
            const mergedSnapshot = remoteSnapshot
                ? mergeDataSnapshots(localSnapshot, remoteSnapshot)
                : localSnapshot;

            saveDataSnapshot(mergedSnapshot);
            await saveUserSnapshot(user.uid, mergedSnapshot);
            this.refreshPersistedState();
            this.patchState({
                authStatus: 'signed-in',
                authUser: user,
                cloudStatusMessage: `${this.getUserLabel(user)} のデータを同期済みです。`
            });
        } catch (error) {
            this.patchState({
                authStatus: 'error',
                authUser: user,
                latestError: toMessage(error),
                cloudStatusMessage: toMessage(error)
            });
        }
    }

    private async syncCloudSnapshot(statusMessage?: string): Promise<void> {
        if (!this.state.authUser) {
            return;
        }

        try {
            const snapshot = loadDataSnapshot();
            await saveUserSnapshot(this.state.authUser.uid, snapshot);
            this.patchState({
                authStatus: 'signed-in',
                cloudStatusMessage: statusMessage
                    ? `${statusMessage} · Firebase に保存しました。`
                    : `${this.getUserLabel(this.state.authUser)} のデータを Firebase に保存しました。`
            });
        } catch (error) {
            this.patchState({
                authStatus: 'error',
                latestError: toMessage(error),
                cloudStatusMessage: toMessage(error)
            });
        }
    }

    private refreshPersistedState(): void {
        this.settings = loadSettings();
        this.presets = loadPresets();
        this.presetDrafts = createPresetDrafts(this.presets);
        this.dailyHeightHistory = loadDailyHeightHistory(getTodayKey());
        this.lastPersistedHeight = this.dailyHeightHistory.at(-1) ?? null;
        this.serial.setCommandInterval(this.settings.commandIntervalMs);
        this.applyTheme();
        this.patchState({
            capturePaused: this.settings.diagnosticsAutoCapture ? this.state.capturePaused : true
        });
    }

    private cloudStatusLabel(): string {
        switch (this.state.authStatus) {
            case 'disabled':
                return 'Firebase Off';
            case 'authenticating':
                return 'Signing In';
            case 'syncing':
                return 'Syncing';
            case 'signed-in':
                return 'Cloud On';
            case 'error':
                return 'Cloud Error';
            default:
                return 'Cloud Ready';
        }
    }

    private cloudStatusTone(): string {
        switch (this.state.authStatus) {
            case 'signed-in':
                return 'tone-green';
            case 'syncing':
            case 'authenticating':
                return 'tone-blue';
            case 'error':
                return 'tone-red';
            default:
                return 'tone-slate';
        }
    }

    private formatCloudSummary(): string {
        const userLabel = this.state.authUser ? this.getUserLabel(this.state.authUser) : 'Guest';
        return `${userLabel} · ${this.state.cloudStatusMessage}`;
    }

    private getUserLabel(user: AuthUser): string {
        return user.displayName || user.email || 'Signed-in user';
    }
}

function clamp(value: number, min: number, max: number): number {
    return Math.min(Math.max(value, min), max);
}

function toMessage(error: unknown): string {
    if (error instanceof Error) {
        return error.message;
    }

    return 'Unknown application error';
}

function createPresetDrafts(presets: DeskPreset[]): Record<CommandName, string> {
    return presets.reduce<Record<CommandName, string>>((accumulator, preset) => {
        accumulator[preset.id] = preset.label;
        return accumulator;
    }, {
        WAKE_UP: '',
        UP: '',
        DOWN: '',
        PRESET1: '',
        PRESET2: '',
        SITTING: '',
        STANDING: ''
    });
}

function formatHex(bytes: number[]): string {
    return bytes.map((byte) => byte.toString(16).padStart(2, '0')).join(' ');
}

function getTodayKey(): string {
    return getDayKey(Date.now());
}

function getDayKey(timestamp: number): string {
    return new Intl.DateTimeFormat('sv-SE', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    }).format(timestamp);
}

function formatDuration(durationMs: number): string {
    const totalMinutes = Math.max(0, Math.floor(durationMs / 60_000));
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;

    if (hours === 0) {
        return `${minutes} min`;
    }

    return `${hours}h ${minutes}m`;
}

function readThemeValue(value: FormDataEntryValue | null): AppSettings['theme'] {
    return value === 'light' || value === 'dark' || value === 'system'
        ? value
        : 'system';
}

function isTypingTarget(target: EventTarget | null): boolean {
    if (!(target instanceof HTMLElement)) {
        return false;
    }

    return target instanceof HTMLInputElement
        || target instanceof HTMLTextAreaElement
        || target instanceof HTMLSelectElement
        || target.isContentEditable;
}

function trapFocusWithin(container: HTMLElement, event: KeyboardEvent): void {
    const focusable = getFocusableElements(container);
    if (focusable.length === 0) {
        return;
    }

    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const active = document.activeElement;

    if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus();
        return;
    }

    if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
    }
}

function getFocusableElements(container: HTMLElement): HTMLElement[] {
    return Array.from(container.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
    )).filter((element) => !element.hasAttribute('hidden'));
}
