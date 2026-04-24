import type {
    AppSettings,
    DailyHeightRecord,
    DeskPreset,
    PersistedDataMeta,
    PersistedUserDataSnapshot
} from '../types';

const PRESETS_KEY = 'flexispot-control-deck-presets-v1';
const HEIGHT_HISTORY_KEY = 'flexispot-control-deck-height-history-v1';
const SETTINGS_KEY = 'flexispot-control-deck-settings-v1';
const DATA_META_KEY = 'flexispot-control-deck-data-meta-v1';
const MAX_DAYS = 14;
const MAX_SAMPLES_PER_DAY = 1440;
const MIN_COMMAND_INTERVAL_MS = 48;
const MAX_COMMAND_INTERVAL_MS = 500;
const MIN_DAILY_STANDING_GOAL_MINUTES = 15;
const MAX_DAILY_STANDING_GOAL_MINUTES = 480;
const MIN_MAX_SITTING_MINUTES = 15;
const MAX_MAX_SITTING_MINUTES = 240;
const MIN_REMINDER_INTERVAL_MINUTES = 5;
const MAX_REMINDER_INTERVAL_MINUTES = 180;

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
    commandIntervalMs: 108,
    healthGoals: {
        dailyStandingGoalMinutes: 120,
        maxSittingMinutes: 60,
        reminderIntervalMinutes: 30
    }
};

const DEFAULT_META: PersistedDataMeta = {
    presetsUpdatedAt: 0,
    settingsUpdatedAt: 0,
    historyUpdatedAt: 0
};

export function loadPresets(): DeskPreset[] {
    try {
        const raw = window.localStorage.getItem(PRESETS_KEY);
        if (!raw) {
            return clonePresets(DEFAULT_PRESETS);
        }

        return sanitizePresets(JSON.parse(raw) as DeskPreset[]);
    } catch {
        return clonePresets(DEFAULT_PRESETS);
    }
}

export function savePresets(presets: DeskPreset[]): DeskPreset[] {
    const sanitized = sanitizePresets(presets);
    window.localStorage.setItem(PRESETS_KEY, JSON.stringify(sanitized));
    writeMeta({
        ...loadDataMeta(),
        presetsUpdatedAt: Date.now()
    });
    return sanitized;
}

export function loadSettings(): AppSettings {
    try {
        const raw = window.localStorage.getItem(SETTINGS_KEY);
        if (!raw) {
            return DEFAULT_SETTINGS;
        }

        return sanitizeSettings(JSON.parse(raw) as Partial<AppSettings>);
    } catch {
        return DEFAULT_SETTINGS;
    }
}

export function saveSettings(settings: AppSettings): AppSettings {
    const sanitized = sanitizeSettings(settings);
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(sanitized));
    writeMeta({
        ...loadDataMeta(),
        settingsUpdatedAt: Date.now()
    });
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
    const nextDayRecords = [...(history[dayKey] ?? []), sanitizeDailyRecord(record)].slice(-MAX_SAMPLES_PER_DAY);
    const trimmedHistory = trimHistory({
        ...history,
        [dayKey]: nextDayRecords
    });

    window.localStorage.setItem(HEIGHT_HISTORY_KEY, JSON.stringify(trimmedHistory));
    writeMeta({
        ...loadDataMeta(),
        historyUpdatedAt: Date.now()
    });
    return trimmedHistory[dayKey] ?? [];
}

export function loadDataSnapshot(): PersistedUserDataSnapshot {
    const presets = loadPresets();
    const settings = loadSettings();
    const heightHistory = loadAllHeightHistory();
    const meta = normalizeMeta(loadDataMeta());

    return {
        version: 1,
        updatedAt: Math.max(meta.presetsUpdatedAt, meta.settingsUpdatedAt, meta.historyUpdatedAt, 0),
        presets,
        settings,
        heightHistory,
        meta
    };
}

export function saveDataSnapshot(snapshot: PersistedUserDataSnapshot): PersistedUserDataSnapshot {
    const normalized = normalizeSnapshot(snapshot);

    window.localStorage.setItem(PRESETS_KEY, JSON.stringify(normalized.presets));
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(normalized.settings));
    window.localStorage.setItem(HEIGHT_HISTORY_KEY, JSON.stringify(normalized.heightHistory));
    writeMeta(normalized.meta);

    return normalized;
}

export function mergeDataSnapshots(
    localSnapshot: PersistedUserDataSnapshot,
    remoteSnapshot: PersistedUserDataSnapshot
): PersistedUserDataSnapshot {
    const local = normalizeSnapshot(localSnapshot);
    const remote = normalizeSnapshot(remoteSnapshot);

    const mergedMeta: PersistedDataMeta = {
        presetsUpdatedAt: Math.max(local.meta.presetsUpdatedAt, remote.meta.presetsUpdatedAt),
        settingsUpdatedAt: Math.max(local.meta.settingsUpdatedAt, remote.meta.settingsUpdatedAt),
        historyUpdatedAt: Math.max(local.meta.historyUpdatedAt, remote.meta.historyUpdatedAt)
    };

    return normalizeSnapshot({
        version: 1,
        updatedAt: Math.max(local.updatedAt, remote.updatedAt),
        presets: pickNewer(local.presets, local.meta.presetsUpdatedAt, remote.presets, remote.meta.presetsUpdatedAt),
        settings: pickNewer(local.settings, local.meta.settingsUpdatedAt, remote.settings, remote.meta.settingsUpdatedAt),
        heightHistory: pickNewer(local.heightHistory, local.meta.historyUpdatedAt, remote.heightHistory, remote.meta.historyUpdatedAt),
        meta: mergedMeta
    });
}

export function normalizeSnapshot(snapshot: PersistedUserDataSnapshot): PersistedUserDataSnapshot {
    const meta = normalizeMeta(snapshot.meta);
    const presets = sanitizePresets(snapshot.presets);
    const settings = sanitizeSettings(snapshot.settings);
    const heightHistory = sanitizeHeightHistory(snapshot.heightHistory);

    return {
        version: 1,
        updatedAt: Math.max(
            snapshot.updatedAt || 0,
            meta.presetsUpdatedAt,
            meta.settingsUpdatedAt,
            meta.historyUpdatedAt
        ),
        presets,
        settings,
        heightHistory,
        meta
    };
}

function loadAllHeightHistory(): Record<string, DailyHeightRecord[]> {
    try {
        const raw = window.localStorage.getItem(HEIGHT_HISTORY_KEY);
        if (!raw) {
            return {};
        }

        return sanitizeHeightHistory(JSON.parse(raw) as Record<string, DailyHeightRecord[]>);
    } catch {
        return {};
    }
}

function loadDataMeta(): PersistedDataMeta {
    try {
        const raw = window.localStorage.getItem(DATA_META_KEY);
        if (!raw) {
            return DEFAULT_META;
        }

        return normalizeMeta(JSON.parse(raw) as Partial<PersistedDataMeta>);
    } catch {
        return DEFAULT_META;
    }
}

function writeMeta(meta: PersistedDataMeta): void {
    window.localStorage.setItem(DATA_META_KEY, JSON.stringify(normalizeMeta(meta)));
}

function trimHistory(history: Record<string, DailyHeightRecord[]>): Record<string, DailyHeightRecord[]> {
    const keys = Object.keys(history).sort();
    const keptKeys = keys.slice(-MAX_DAYS);

    return keptKeys.reduce<Record<string, DailyHeightRecord[]>>((accumulator, key) => {
        accumulator[key] = (history[key] ?? [])
            .map((record) => sanitizeDailyRecord(record))
            .slice(-MAX_SAMPLES_PER_DAY);
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
        commandIntervalMs: commandInterval,
        healthGoals: sanitizeHealthGoals(input?.healthGoals)
    };
}

function sanitizeHealthGoals(input: Partial<AppSettings['healthGoals']> | null | undefined): AppSettings['healthGoals'] {
    return {
        dailyStandingGoalMinutes: sanitizeNumber(
            input?.dailyStandingGoalMinutes,
            DEFAULT_SETTINGS.healthGoals.dailyStandingGoalMinutes,
            MIN_DAILY_STANDING_GOAL_MINUTES,
            MAX_DAILY_STANDING_GOAL_MINUTES
        ),
        maxSittingMinutes: sanitizeNumber(
            input?.maxSittingMinutes,
            DEFAULT_SETTINGS.healthGoals.maxSittingMinutes,
            MIN_MAX_SITTING_MINUTES,
            MAX_MAX_SITTING_MINUTES
        ),
        reminderIntervalMinutes: sanitizeNumber(
            input?.reminderIntervalMinutes,
            DEFAULT_SETTINGS.healthGoals.reminderIntervalMinutes,
            MIN_REMINDER_INTERVAL_MINUTES,
            MAX_REMINDER_INTERVAL_MINUTES
        )
    };
}

function sanitizeNumber(value: number | undefined, fallback: number, min: number, max: number): number {
    return typeof value === 'number' && Number.isFinite(value)
        ? clamp(Math.round(value), min, max)
        : fallback;
}

function sanitizePresets(input: DeskPreset[] | null | undefined): DeskPreset[] {
    if (!Array.isArray(input) || input.length !== DEFAULT_PRESETS.length) {
        return clonePresets(DEFAULT_PRESETS);
    }

    return DEFAULT_PRESETS.map((defaultPreset, index) => {
        const preset = input[index];
        return {
            ...defaultPreset,
            ...(preset ?? {}),
            label: typeof preset?.label === 'string' && preset.label.trim()
                ? preset.label.trim().slice(0, 24)
                : defaultPreset.label
        };
    });
}

function sanitizeHeightHistory(input: Record<string, DailyHeightRecord[]> | null | undefined): Record<string, DailyHeightRecord[]> {
    if (!input || typeof input !== 'object') {
        return {};
    }

    const sanitized = Object.entries(input).reduce<Record<string, DailyHeightRecord[]>>((accumulator, [dayKey, records]) => {
        if (!Array.isArray(records)) {
            return accumulator;
        }

        accumulator[dayKey] = records
            .map((record) => sanitizeDailyRecord(record))
            .slice(-MAX_SAMPLES_PER_DAY);
        return accumulator;
    }, {});

    return trimHistory(sanitized);
}

function sanitizeDailyRecord(record: DailyHeightRecord): DailyHeightRecord {
    return {
        timestamp: typeof record?.timestamp === 'number' ? record.timestamp : Date.now(),
        valueCm: typeof record?.valueCm === 'number' ? record.valueCm : 0
    };
}

function normalizeMeta(input: Partial<PersistedDataMeta> | null | undefined): PersistedDataMeta {
    return {
        presetsUpdatedAt: sanitizeTimestamp(input?.presetsUpdatedAt),
        settingsUpdatedAt: sanitizeTimestamp(input?.settingsUpdatedAt),
        historyUpdatedAt: sanitizeTimestamp(input?.historyUpdatedAt)
    };
}

function sanitizeTimestamp(value: number | undefined): number {
    return typeof value === 'number' && Number.isFinite(value) && value >= 0
        ? Math.floor(value)
        : 0;
}

function clonePresets(presets: DeskPreset[]): DeskPreset[] {
    return presets.map((preset) => ({ ...preset }));
}

function pickNewer<T>(localValue: T, localUpdatedAt: number, remoteValue: T, remoteUpdatedAt: number): T {
    return remoteUpdatedAt > localUpdatedAt ? remoteValue : localValue;
}

function clamp(value: number, min: number, max: number): number {
    return Math.min(Math.max(value, min), max);
}
