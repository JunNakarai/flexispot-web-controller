import { beforeEach, describe, expect, it } from 'vitest';
import {
    appendDailyHeightRecord,
    loadDailyHeightHistory,
    loadDataSnapshot,
    loadPresets,
    loadSettings,
    mergeDataSnapshots,
    savePresets,
    saveSettings
} from './storage';

const PRESETS_KEY = 'flexispot-control-deck-presets-v1';
const HEIGHT_HISTORY_KEY = 'flexispot-control-deck-height-history-v1';
const SETTINGS_KEY = 'flexispot-control-deck-settings-v1';

class LocalStorageMock {
    private storage = new Map<string, string>();

    clear(): void {
        this.storage.clear();
    }

    getItem(key: string): string | null {
        return this.storage.get(key) ?? null;
    }

    removeItem(key: string): void {
        this.storage.delete(key);
    }

    setItem(key: string, value: string): void {
        this.storage.set(key, value);
    }
}

const localStorageMock = new LocalStorageMock();

Object.defineProperty(globalThis, 'window', {
    value: {
        localStorage: localStorageMock
    },
    configurable: true
});

describe('storage', () => {
    beforeEach(() => {
        localStorageMock.clear();
    });

    it('returns defaults when presets are missing or invalid', () => {
        const defaults = loadPresets();

        expect(defaults).toHaveLength(4);
        expect(defaults.map((preset) => preset.id)).toEqual([
            'PRESET1',
            'PRESET2',
            'SITTING',
            'STANDING'
        ]);

        window.localStorage.setItem(PRESETS_KEY, 'not-json');
        expect(loadPresets()).toEqual(defaults);

        window.localStorage.setItem(PRESETS_KEY, JSON.stringify([{ id: 'PRESET1' }]));
        expect(loadPresets()).toEqual(defaults);
    });

    it('merges stored preset labels onto the defaults', () => {
        const presets = loadPresets().map((preset) => ({
            ...preset,
            label: `${preset.label} Custom`
        }));

        savePresets(presets);

        expect(loadPresets()).toEqual(presets);
    });

    it('returns default settings and sanitizes saved values', () => {
        expect(loadSettings()).toEqual({
            theme: 'system',
            notificationsEnabled: false,
            diagnosticsAutoCapture: true,
            commandIntervalMs: 108
        });

        window.localStorage.setItem(SETTINGS_KEY, JSON.stringify({
            theme: 'dark',
            notificationsEnabled: true,
            diagnosticsAutoCapture: false,
            commandIntervalMs: 12
        }));

        expect(loadSettings()).toEqual({
            theme: 'dark',
            notificationsEnabled: true,
            diagnosticsAutoCapture: false,
            commandIntervalMs: 48
        });
    });

    it('persists sanitized settings', () => {
        const saved = saveSettings({
            theme: 'light',
            notificationsEnabled: true,
            diagnosticsAutoCapture: false,
            commandIntervalMs: 999
        });

        expect(saved).toEqual({
            theme: 'light',
            notificationsEnabled: true,
            diagnosticsAutoCapture: false,
            commandIntervalMs: 500
        });
        expect(loadSettings()).toEqual(saved);
    });

    it('appends daily history records and trims to the per-day limit', () => {
        for (let index = 0; index < 1450; index += 1) {
            appendDailyHeightRecord('2026-04-08', {
                timestamp: index,
                valueCm: 60 + index / 100
            });
        }

        const dayHistory = loadDailyHeightHistory('2026-04-08');

        expect(dayHistory).toHaveLength(1440);
        expect(dayHistory[0]?.timestamp).toBe(10);
        expect(dayHistory.at(-1)?.timestamp).toBe(1449);
    });

    it('keeps only the latest 14 days of height history', () => {
        for (let day = 1; day <= 16; day += 1) {
            appendDailyHeightRecord(`2026-04-${String(day).padStart(2, '0')}`, {
                timestamp: day,
                valueCm: 70
            });
        }

        const rawHistory = window.localStorage.getItem(HEIGHT_HISTORY_KEY);
        expect(rawHistory).not.toBeNull();

        const storedHistory = JSON.parse(rawHistory ?? '{}') as Record<string, Array<{ timestamp: number; valueCm: number }>>;
        expect(Object.keys(storedHistory)).toEqual([
            '2026-04-03',
            '2026-04-04',
            '2026-04-05',
            '2026-04-06',
            '2026-04-07',
            '2026-04-08',
            '2026-04-09',
            '2026-04-10',
            '2026-04-11',
            '2026-04-12',
            '2026-04-13',
            '2026-04-14',
            '2026-04-15',
            '2026-04-16'
        ]);
    });

    it('merges snapshots by section timestamp', () => {
        saveSettings({
            theme: 'light',
            notificationsEnabled: false,
            diagnosticsAutoCapture: true,
            commandIntervalMs: 108
        });

        const localSnapshot = loadDataSnapshot();
        const remoteSnapshot = {
            ...localSnapshot,
            presets: localSnapshot.presets.map((preset) => ({
                ...preset,
                label: `${preset.label} Remote`
            })),
            settings: {
                ...localSnapshot.settings,
                theme: 'dark' as const
            },
            meta: {
                presetsUpdatedAt: localSnapshot.meta.presetsUpdatedAt + 100,
                settingsUpdatedAt: Math.max(localSnapshot.meta.settingsUpdatedAt - 100, 0),
                historyUpdatedAt: localSnapshot.meta.historyUpdatedAt
            },
            updatedAt: localSnapshot.updatedAt + 100
        };

        const merged = mergeDataSnapshots(localSnapshot, remoteSnapshot);

        expect(merged.presets[0]?.label).toContain('Remote');
        expect(merged.settings.theme).toBe('light');
    });
});
