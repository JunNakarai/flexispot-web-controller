import { beforeEach, describe, expect, it } from 'vitest';
import { appendDailyHeightRecord, loadDailyHeightHistory, loadPresets, savePresets } from './storage';

const PRESETS_KEY = 'flexispot-control-deck-presets-v1';
const HEIGHT_HISTORY_KEY = 'flexispot-control-deck-height-history-v1';

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
});
