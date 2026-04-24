import type { DailyHealthSummary, DailyHeightRecord, PostureSession, PostureThresholds } from '../types';
import { buildPostureSessions } from './posture';

export const DEFAULT_STANDING_GOAL_MS = 2 * 60 * 60 * 1000;

export function buildDailyHealthSummary(
    records: DailyHeightRecord[],
    options: {
        thresholds?: Partial<PostureThresholds>;
        standingGoalMs?: number;
        standingGoalMinutes?: number;
    } = {}
): DailyHealthSummary {
    const sessions = buildPostureSessions(records, options.thresholds);
    const standingGoalMs = normalizeGoal(options.standingGoalMs, options.standingGoalMinutes);
    const standingMs = sumDuration(sessions, 'standing');
    const sittingMs = sumDuration(sessions, 'sitting');
    const longestSittingMs = sessions
        .filter((session) => session.posture === 'sitting')
        .reduce((longest, session) => Math.max(longest, session.durationMs), 0);

    return {
        sampleCount: records.length,
        standingMs,
        sittingMs,
        transitionCount: countPostureTransitions(sessions),
        longestSittingMs,
        standingGoalMs,
        remainingStandingGoalMs: Math.max(0, standingGoalMs - standingMs),
        standingGoalProgress: standingGoalMs === 0
            ? 1
            : Math.min(1, standingMs / standingGoalMs)
    };
}

function sumDuration(sessions: PostureSession[], posture: PostureSession['posture']): number {
    return sessions
        .filter((session) => session.posture === posture)
        .reduce((total, session) => total + session.durationMs, 0);
}

function countPostureTransitions(sessions: PostureSession[]): number {
    return sessions.reduce((count, session, index) => {
        const previous = sessions[index - 1];
        return previous && previous.posture !== session.posture
            ? count + 1
            : count;
    }, 0);
}

function normalizeGoal(goalMs: number | undefined, goalMinutes: number | undefined): number {
    if (typeof goalMs === 'number' && Number.isFinite(goalMs) && goalMs >= 0) {
        return goalMs;
    }

    if (typeof goalMinutes === 'number' && Number.isFinite(goalMinutes) && goalMinutes >= 0) {
        return Math.round(goalMinutes) * 60_000;
    }

    return DEFAULT_STANDING_GOAL_MS;
}
