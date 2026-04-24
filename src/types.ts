export type CommandName =
    | 'WAKE_UP'
    | 'UP'
    | 'DOWN'
    | 'PRESET1'
    | 'PRESET2'
    | 'SITTING'
    | 'STANDING';

export type DeskStatus =
    | 'idle'
    | 'connecting'
    | 'connected'
    | 'moving-up'
    | 'moving-down'
    | 'preset-running'
    | 'error';

export interface DeskPreset {
    id: CommandName;
    label: string;
    description: string;
    accent: 'sky' | 'amber' | 'mint' | 'rose';
    shortcut: string;
}

export interface AppSettings {
    theme: 'system' | 'light' | 'dark';
    notificationsEnabled: boolean;
    diagnosticsAutoCapture: boolean;
    commandIntervalMs: number;
    healthGoals: HealthGoalSettings;
}

export interface HealthGoalSettings {
    dailyStandingGoalMinutes: number;
    maxSittingMinutes: number;
    reminderIntervalMinutes: number;
}

export type CloudAuthStatus =
    | 'disabled'
    | 'signed-out'
    | 'authenticating'
    | 'syncing'
    | 'signed-in'
    | 'error';

export interface AuthUser {
    uid: string;
    displayName: string | null;
    email: string | null;
}

export interface PersistedDataMeta {
    presetsUpdatedAt: number;
    settingsUpdatedAt: number;
    historyUpdatedAt: number;
}

export interface PersistedUserDataSnapshot {
    version: 1;
    updatedAt: number;
    presets: DeskPreset[];
    settings: AppSettings;
    heightHistory: Record<string, DailyHeightRecord[]>;
    meta: PersistedDataMeta;
}

export interface AppState {
    connectionStatus: DeskStatus;
    isConnected: boolean;
    isPresetEditorOpen: boolean;
    currentHeight: number | null;
    statusMessage: string;
    latestError: string | null;
    activePreset: CommandName | null;
    lastCommand: CommandName | null;
    lastHeightSampleAt: number | null;
    receivedChunkCount: number;
    receivedByteCount: number;
    rawPreview: string[];
    rawCapture: string[];
    capturePaused: boolean;
    settingsOpen: boolean;
    healthPrompt: string | null;
    authStatus: CloudAuthStatus;
    authUser: AuthUser | null;
    cloudStatusMessage: string;
}

export interface HeightSample {
    timestamp: number;
    valueCm: number;
}

export interface DailyHeightRecord {
    timestamp: number;
    valueCm: number;
}

export type PostureKind = 'sitting' | 'standing' | 'unknown';

export interface PostureThresholds {
    sittingMaxCm: number;
    standingMinCm: number;
    maxSampleGapMs: number;
    minSessionDurationMs: number;
}

export interface PostureSession {
    posture: Exclude<PostureKind, 'unknown'>;
    startedAt: number;
    endedAt: number;
    durationMs: number;
    sampleCount: number;
    minHeightCm: number;
    maxHeightCm: number;
}

export interface DailyHealthSummary {
    sampleCount: number;
    standingMs: number;
    sittingMs: number;
    transitionCount: number;
    longestSittingMs: number;
    standingGoalMs: number;
    remainingStandingGoalMs: number;
    standingGoalProgress: number;
}
