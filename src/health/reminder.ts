import type { PostureKind } from '../types';

export type SittingReminderAction = 'none' | 'prompt' | 'clear';

export interface SittingReminderInput {
    posture: PostureKind;
    sittingStartedAt: number | null;
    lastPromptedAt: number | null;
    now: number;
    maxSittingMs: number;
    reminderIntervalMs: number;
}

export interface SittingReminderResult {
    action: SittingReminderAction;
    sittingStartedAt: number | null;
    lastPromptedAt: number | null;
    sittingDurationMs: number;
}

export function evaluateSittingReminder(input: SittingReminderInput): SittingReminderResult {
    if (input.posture === 'standing') {
        return {
            action: 'clear',
            sittingStartedAt: null,
            lastPromptedAt: null,
            sittingDurationMs: 0
        };
    }

    if (input.posture === 'unknown') {
        return {
            action: 'none',
            sittingStartedAt: input.sittingStartedAt,
            lastPromptedAt: input.lastPromptedAt,
            sittingDurationMs: input.sittingStartedAt === null ? 0 : Math.max(0, input.now - input.sittingStartedAt)
        };
    }

    const sittingStartedAt = input.sittingStartedAt ?? input.now;
    const sittingDurationMs = Math.max(0, input.now - sittingStartedAt);
    const canPrompt = sittingDurationMs >= input.maxSittingMs
        && (
            input.lastPromptedAt === null
            || input.now - input.lastPromptedAt >= input.reminderIntervalMs
        );

    return {
        action: canPrompt ? 'prompt' : 'none',
        sittingStartedAt,
        lastPromptedAt: canPrompt ? input.now : input.lastPromptedAt,
        sittingDurationMs
    };
}
