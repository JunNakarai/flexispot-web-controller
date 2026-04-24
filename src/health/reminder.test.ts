import { describe, expect, it } from 'vitest';
import { evaluateSittingReminder } from './reminder';

describe('sitting reminder', () => {
    it('starts tracking sitting without prompting before the limit', () => {
        const result = evaluateSittingReminder({
            posture: 'sitting',
            sittingStartedAt: null,
            lastPromptedAt: null,
            now: 10_000,
            maxSittingMs: 60_000,
            reminderIntervalMs: 30_000
        });

        expect(result).toEqual({
            action: 'none',
            sittingStartedAt: 10_000,
            lastPromptedAt: null,
            sittingDurationMs: 0
        });
    });

    it('prompts when continuous sitting exceeds the configured limit', () => {
        const result = evaluateSittingReminder({
            posture: 'sitting',
            sittingStartedAt: 0,
            lastPromptedAt: null,
            now: 60_000,
            maxSittingMs: 60_000,
            reminderIntervalMs: 30_000
        });

        expect(result.action).toBe('prompt');
        expect(result.lastPromptedAt).toBe(60_000);
        expect(result.sittingDurationMs).toBe(60_000);
    });

    it('does not prompt again until the reminder interval has passed', () => {
        const result = evaluateSittingReminder({
            posture: 'sitting',
            sittingStartedAt: 0,
            lastPromptedAt: 60_000,
            now: 70_000,
            maxSittingMs: 60_000,
            reminderIntervalMs: 30_000
        });

        expect(result.action).toBe('none');
        expect(result.lastPromptedAt).toBe(60_000);
    });

    it('clears reminder state when standing is detected', () => {
        expect(evaluateSittingReminder({
            posture: 'standing',
            sittingStartedAt: 0,
            lastPromptedAt: 60_000,
            now: 90_000,
            maxSittingMs: 60_000,
            reminderIntervalMs: 30_000
        })).toEqual({
            action: 'clear',
            sittingStartedAt: null,
            lastPromptedAt: null,
            sittingDurationMs: 0
        });
    });
});
