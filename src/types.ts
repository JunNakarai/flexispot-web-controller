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

export interface AppState {
    connectionStatus: DeskStatus;
    isConnected: boolean;
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
}

export interface HeightSample {
    timestamp: number;
    valueCm: number;
}

export interface DailyHeightRecord {
    timestamp: number;
    valueCm: number;
}
