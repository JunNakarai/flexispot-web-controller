import { describe, expect, it } from 'vitest';
import { buildDailyHealthSummary, DEFAULT_STANDING_GOAL_MS } from './summary';

describe('daily health summary', () => {
    it('summarizes standing time, sitting time, transitions, and longest sitting session', () => {
        const summary = buildDailyHealthSummary([
            { timestamp: 0, valueCm: 72 },
            { timestamp: 5 * 60_000, valueCm: 73 },
            { timestamp: 10 * 60_000, valueCm: 110 },
            { timestamp: 15 * 60_000, valueCm: 111 },
            { timestamp: 20 * 60_000, valueCm: 74 },
            { timestamp: 25 * 60_000, valueCm: 75 }
        ], {
            standingGoalMs: 15 * 60_000
        });

        expect(summary).toMatchObject({
            sampleCount: 6,
            sittingMs: 15 * 60_000,
            standingMs: 10 * 60_000,
            transitionCount: 2,
            longestSittingMs: 10 * 60_000,
            remainingStandingGoalMs: 5 * 60_000,
            standingGoalProgress: 2 / 3
        });
    });

    it('reports remaining standing goal time when the goal is not reached', () => {
        const summary = buildDailyHealthSummary([
            { timestamp: 0, valueCm: 72 },
            { timestamp: 5 * 60_000, valueCm: 110 },
            { timestamp: 10 * 60_000, valueCm: 111 }
        ], {
            standingGoalMs: 20 * 60_000
        });

        expect(summary.standingMs).toBe(5 * 60_000);
        expect(summary.remainingStandingGoalMs).toBe(15 * 60_000);
        expect(summary.standingGoalProgress).toBe(0.25);
    });

    it('returns an empty summary for days without height records', () => {
        const summary = buildDailyHealthSummary([]);

        expect(summary).toEqual({
            sampleCount: 0,
            standingMs: 0,
            sittingMs: 0,
            transitionCount: 0,
            longestSittingMs: 0,
            standingGoalMs: DEFAULT_STANDING_GOAL_MS,
            remainingStandingGoalMs: DEFAULT_STANDING_GOAL_MS,
            standingGoalProgress: 0
        });
    });
});
