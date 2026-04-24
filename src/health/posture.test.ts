import { describe, expect, it } from 'vitest';
import { buildPostureSessions, classifyDeskPosture } from './posture';

describe('posture inference', () => {
    it('classifies heights with an unknown transition band', () => {
        expect(classifyDeskPosture(72)).toBe('sitting');
        expect(classifyDeskPosture(98)).toBe('unknown');
        expect(classifyDeskPosture(110)).toBe('standing');
        expect(classifyDeskPosture(Number.NaN)).toBe('unknown');
    });

    it('builds sitting and standing sessions from height records', () => {
        const sessions = buildPostureSessions([
            { timestamp: 0, valueCm: 72 },
            { timestamp: 60_000, valueCm: 73 },
            { timestamp: 90_000, valueCm: 98 },
            { timestamp: 120_000, valueCm: 110 },
            { timestamp: 180_000, valueCm: 111 },
            { timestamp: 240_000, valueCm: 74 }
        ]);

        expect(sessions).toEqual([
            {
                posture: 'sitting',
                startedAt: 0,
                endedAt: 120_000,
                durationMs: 120_000,
                sampleCount: 2,
                minHeightCm: 72,
                maxHeightCm: 73
            },
            {
                posture: 'standing',
                startedAt: 120_000,
                endedAt: 240_000,
                durationMs: 120_000,
                sampleCount: 2,
                minHeightCm: 110,
                maxHeightCm: 111
            },
            {
                posture: 'sitting',
                startedAt: 240_000,
                endedAt: 240_000,
                durationMs: 0,
                sampleCount: 1,
                minHeightCm: 74,
                maxHeightCm: 74
            }
        ]);
    });

    it('splits sessions across large sample gaps', () => {
        const sessions = buildPostureSessions([
            { timestamp: 0, valueCm: 70 },
            { timestamp: 60_000, valueCm: 71 },
            { timestamp: 15 * 60_000, valueCm: 72 },
            { timestamp: 16 * 60_000, valueCm: 73 }
        ], {
            maxSampleGapMs: 5 * 60_000
        });

        expect(sessions.map((session) => [session.startedAt, session.endedAt])).toEqual([
            [0, 60_000],
            [15 * 60_000, 16 * 60_000]
        ]);
    });

    it('filters short noise sessions when a minimum duration is set', () => {
        const sessions = buildPostureSessions([
            { timestamp: 0, valueCm: 72 },
            { timestamp: 10_000, valueCm: 110 },
            { timestamp: 20_000, valueCm: 72 },
            { timestamp: 140_000, valueCm: 73 }
        ], {
            minSessionDurationMs: 60_000
        });

        expect(sessions).toHaveLength(1);
        expect(sessions[0]?.posture).toBe('sitting');
        expect(sessions[0]?.durationMs).toBe(120_000);
    });

    it('sorts records before building sessions', () => {
        const sessions = buildPostureSessions([
            { timestamp: 120_000, valueCm: 110 },
            { timestamp: 0, valueCm: 70 },
            { timestamp: 60_000, valueCm: 71 }
        ]);

        expect(sessions.map((session) => session.posture)).toEqual(['sitting', 'standing']);
        expect(sessions[0]?.startedAt).toBe(0);
    });
});
