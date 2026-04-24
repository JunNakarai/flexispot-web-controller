import type { DailyHeightRecord, DailyHealthSummary } from '../types';
import { buildDailyHealthSummary } from './summary';

export interface PeriodHealthSummary {
    period: 'week' | 'month';
    startedOn: string;
    endedOn: string;
    dayCount: number;
    sampleCount: number;
    standingMs: number;
    sittingMs: number;
    transitionCount: number;
    longestSittingMs: number;
    dailySummaries: Array<DailyHealthSummary & { dayKey: string }>;
}

export function buildPeriodHealthSummary(
    history: Record<string, DailyHeightRecord[]>,
    options: {
        period: 'week' | 'month';
        today?: Date;
        standingGoalMinutes?: number;
    }
): PeriodHealthSummary {
    const today = options.today ?? new Date();
    const range = getPeriodRange(options.period, today);
    const dailySummaries = Object.entries(history)
        .filter(([dayKey]) => dayKey >= range.startedOn && dayKey <= range.endedOn)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([dayKey, records]) => ({
            dayKey,
            ...buildDailyHealthSummary(records, {
                standingGoalMinutes: options.standingGoalMinutes
            })
        }));

    return {
        period: options.period,
        startedOn: range.startedOn,
        endedOn: range.endedOn,
        dayCount: dailySummaries.length,
        sampleCount: dailySummaries.reduce((total, summary) => total + summary.sampleCount, 0),
        standingMs: dailySummaries.reduce((total, summary) => total + summary.standingMs, 0),
        sittingMs: dailySummaries.reduce((total, summary) => total + summary.sittingMs, 0),
        transitionCount: dailySummaries.reduce((total, summary) => total + summary.transitionCount, 0),
        longestSittingMs: dailySummaries.reduce((longest, summary) => Math.max(longest, summary.longestSittingMs), 0),
        dailySummaries
    };
}

export function exportHealthSummaryJson(summary: PeriodHealthSummary): string {
    return JSON.stringify(summary, null, 2);
}

export function exportHealthSummaryCsv(summary: PeriodHealthSummary): string {
    const rows = [
        [
            'day',
            'samples',
            'standing_minutes',
            'sitting_minutes',
            'switches',
            'longest_sitting_minutes',
            'standing_goal_minutes',
            'remaining_standing_goal_minutes'
        ],
        ...summary.dailySummaries.map((daily) => [
            daily.dayKey,
            String(daily.sampleCount),
            minutes(daily.standingMs),
            minutes(daily.sittingMs),
            String(daily.transitionCount),
            minutes(daily.longestSittingMs),
            minutes(daily.standingGoalMs),
            minutes(daily.remainingStandingGoalMs)
        ])
    ];

    return rows.map((row) => row.map(escapeCsvCell).join(',')).join('\n');
}

function getPeriodRange(period: 'week' | 'month', today: Date): { startedOn: string; endedOn: string } {
    const end = startOfLocalDay(today);
    const start = new Date(end);
    if (period === 'week') {
        start.setDate(end.getDate() - 6);
    } else {
        start.setMonth(end.getMonth() - 1);
        start.setDate(start.getDate() + 1);
    }

    return {
        startedOn: formatDayKey(start),
        endedOn: formatDayKey(end)
    };
}

function startOfLocalDay(date: Date): Date {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function formatDayKey(date: Date): string {
    return new Intl.DateTimeFormat('sv-SE', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    }).format(date);
}

function minutes(durationMs: number): string {
    return String(Math.round(durationMs / 60_000));
}

function escapeCsvCell(value: string): string {
    return /[",\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
}
