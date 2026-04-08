import type { AppSettings, DailyHeightRecord, DeskPreset } from '../types';

const PRESETS_KEY = 'flexispot-control-deck-presets-v1';
const HEIGHT_HISTORY_KEY = 'flexispot-control-deck-height-history-v1';
const SETTINGS_KEY = 'flexispot-control-deck-settings-v1';
const MAX_DAYS = 14;
const MAX_SAMPLES_PER_DAY = 1440;
const MIN_COMMAND_INTERVAL_MS = 48;
const MAX_COMMAND_INTERVAL_MS = 500;

const DEFAULT_PRESETS: DeskPreset[] = [
    {
        id: 'PRESET1',
        label: 'Focus',
        description: '保存済みプリセット 1',
        accent: 'sky',
        shortcut: '1'
    },
    {
        id: 'PRESET2',
        label: 'Reset',
        description: '保存済みプリセット 2',
        accent: 'amber',
        shortcut: '2'
    },
    {
        id: 'SITTING',
        label: 'Sit',
        description: '座り作業に戻す',
        accent: 'mint',
        shortcut: 'S'
    },
    {
        id: 'STANDING',
        label: 'Stand',
        description: '立ち作業に切り替える',
        accent: 'rose',
        shortcut: 'T'
    }
];

const DEFAULT_SETTINGS: AppSettings = {
    theme: 'system',
    notificationsEnabled: false,
    diagnosticsAutoCapture: true,
    commandIntervalMs: 108
};

export function loadPresets(): DeskPreset[] {
    try {
        const raw = window.localStorage.getItem(PRESETS_KEY);
        if (!raw) {
            return DEFAULT_PRESETS;
        }

        const parsed = JSON.parse(raw) as DeskPreset[];
        if (!Array.isArray(parsed) || parsed.length !== DEFAULT_PRESETS.length) {
            return DEFAULT_PRESETS;
        }

        return parsed.map((preset, index) => ({
            ...DEFAULT_PRESETS[index],
            ...preset
        }));
    } catch {
        return DEFAULT_PRESETS;
    }
}

export function savePresets(presets: DeskPreset[]): void {
    window.localStorage.setItem(PRESETS_KEY, JSON.stringify(presets));
}

export function loadSettings(): AppSettings {
    try {
        const raw = window.localStorage.getItem(SETTINGS_KEY);
        if (!raw) {
            return DEFAULT_SETTINGS;
        }

        const parsed = JSON.parse(raw) as Partial<AppSettings>;
        return sanitizeSettings(parsed);
    } catch {
        return DEFAULT_SETTINGS;
    }
}

export function saveSettings(settings: AppSettings): AppSettings {
    const sanitized = sanitizeSettings(settings);
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(sanitized));
    return sanitized;
}

export function loadDailyHeightHistory(dayKey: string): DailyHeightRecord[] {
    try {
        const history = loadAllHeightHistory();
        return history[dayKey] ?? [];
    } catch {
        return [];
    }
}

export function appendDailyHeightRecord(dayKey: string, record: DailyHeightRecord): DailyHeightRecord[] {
    const history = loadAllHeightHistory();
    const nextDayRecords = [...(history[dayKey] ?? []), record].slice(-MAX_SAMPLES_PER_DAY);
    const trimmedHistory = trimHistory({
        ...history,
        [dayKey]: nextDayRecords
    });

    window.localStorage.setItem(HEIGHT_HISTORY_KEY, JSON.stringify(trimmedHistory));
    return nextDayRecords;
}

function loadAllHeightHistory(): Record<string, DailyHeightRecord[]> {
    const raw = window.localStorage.getItem(HEIGHT_HISTORY_KEY);
    if (!raw) {
        return {};
    }

    const parsed = JSON.parse(raw) as Record<string, DailyHeightRecord[]>;
    if (!parsed || typeof parsed !== 'object') {
        return {};
    }

    return parsed;
}

function trimHistory(history: Record<string, DailyHeightRecord[]>): Record<string, DailyHeightRecord[]> {
    const keys = Object.keys(history).sort();
    const keptKeys = keys.slice(-MAX_DAYS);

    return keptKeys.reduce<Record<string, DailyHeightRecord[]>>((accumulator, key) => {
        accumulator[key] = history[key].slice(-MAX_SAMPLES_PER_DAY);
        return accumulator;
    }, {});
}

function sanitizeSettings(input: Partial<AppSettings> | null | undefined): AppSettings {
    const theme = input?.theme === 'light' || input?.theme === 'dark' || input?.theme === 'system'
        ? input.theme
        : DEFAULT_SETTINGS.theme;
    const commandInterval = typeof input?.commandIntervalMs === 'number'
        ? clamp(Math.round(input.commandIntervalMs), MIN_COMMAND_INTERVAL_MS, MAX_COMMAND_INTERVAL_MS)
        : DEFAULT_SETTINGS.commandIntervalMs;

    return {
        theme,
        notificationsEnabled: typeof input?.notificationsEnabled === 'boolean'
            ? input.notificationsEnabled
            : DEFAULT_SETTINGS.notificationsEnabled,
        diagnosticsAutoCapture: typeof input?.diagnosticsAutoCapture === 'boolean'
            ? input.diagnosticsAutoCapture
            : DEFAULT_SETTINGS.diagnosticsAutoCapture,
        commandIntervalMs: commandInterval
    };
}

function clamp(value: number, min: number, max: number): number {
    return Math.min(Math.max(value, min), max);
}
