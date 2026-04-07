import type { DailyHeightRecord, DeskPreset, HeightSample } from '../types';

const PRESETS_KEY = 'flexispot-control-deck-presets-v1';
const HEIGHT_HISTORY_KEY = 'flexispot-control-deck-height-history-v1';
const RECENT_HEIGHT_LOG_KEY = 'flexispot-control-deck-recent-height-log-v1';
const MAX_DAYS = 14;
const MAX_SAMPLES_PER_DAY = 1440;
const MAX_RECENT_HEIGHT_LOG_SAMPLES = 240;

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

export function loadRecentHeightLog(): HeightSample[] {
    try {
        const raw = window.localStorage.getItem(RECENT_HEIGHT_LOG_KEY);
        if (!raw) {
            return [];
        }

        const parsed = JSON.parse(raw) as HeightSample[];
        if (!Array.isArray(parsed)) {
            return [];
        }

        return parsed
            .filter((sample) => (
                sample
                && typeof sample.timestamp === 'number'
                && Number.isFinite(sample.timestamp)
                && typeof sample.valueCm === 'number'
                && Number.isFinite(sample.valueCm)
            ))
            .slice(-MAX_RECENT_HEIGHT_LOG_SAMPLES);
    } catch {
        return [];
    }
}

export function appendRecentHeightLog(sample: HeightSample): HeightSample[] {
    const next = [...loadRecentHeightLog(), sample].slice(-MAX_RECENT_HEIGHT_LOG_SAMPLES);
    window.localStorage.setItem(RECENT_HEIGHT_LOG_KEY, JSON.stringify(next));
    return next;
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
