import { describe, expect, it } from 'vitest';
import { buildPeriodHealthSummary, exportHealthSummaryCsv, exportHealthSummaryJson } from './report';

describe('health report', () => {
    it('builds a weekly summary from stored daily history', () => {
        const summary = buildPeriodHealthSummary({
            '2026-04-16': [{ timestamp: Date.UTC(2026, 3, 16), valueCm: 70 }],
            '2026-04-18': [
                { timestamp: Date.UTC(2026, 3, 18, 0, 0), valueCm: 72 },
                { timestamp: Date.UTC(2026, 3, 18, 0, 5), valueCm: 110 },
                { timestamp: Date.UTC(2026, 3, 18, 0, 10), valueCm: 111 }
            ],
            '2026-04-24': [
                { timestamp: Date.UTC(2026, 3, 24, 0, 0), valueCm: 74 },
                { timestamp: Date.UTC(2026, 3, 24, 0, 5), valueCm: 75 }
            ]
        }, {
            period: 'week',
            today: new Date(2026, 3, 24),
            standingGoalMinutes: 30
        });

        expect(summary.startedOn).toBe('2026-04-18');
        expect(summary.endedOn).toBe('2026-04-24');
        expect(summary.dayCount).toBe(2);
        expect(summary.sampleCount).toBe(5);
        expect(summary.standingMs).toBe(5 * 60_000);
        expect(summary.sittingMs).toBe(10 * 60_000);
        expect(summary.transitionCount).toBe(1);
    });

    it('exports weekly summaries as CSV and JSON', () => {
        const summary = buildPeriodHealthSummary({
            '2026-04-24': [
                { timestamp: Date.UTC(2026, 3, 24, 0, 0), valueCm: 72 },
                { timestamp: Date.UTC(2026, 3, 24, 0, 5), valueCm: 110 }
            ]
        }, {
            period: 'week',
            today: new Date(2026, 3, 24),
            standingGoalMinutes: 30
        });

        expect(exportHealthSummaryCsv(summary)).toContain('day,samples,standing_minutes');
        expect(exportHealthSummaryCsv(summary)).toContain('2026-04-24,2,0,5,1,5,30,30');
        expect(JSON.parse(exportHealthSummaryJson(summary))).toMatchObject({
            period: 'week',
            dayCount: 1
        });
    });
});
