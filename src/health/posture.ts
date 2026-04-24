import type { DailyHeightRecord, PostureKind, PostureSession, PostureThresholds } from '../types';

export const DEFAULT_POSTURE_THRESHOLDS: PostureThresholds = {
    sittingMaxCm: 95,
    standingMinCm: 100,
    maxSampleGapMs: 5 * 60 * 1000,
    minSessionDurationMs: 0
};

type KnownPosture = Exclude<PostureKind, 'unknown'>;

interface SessionDraft {
    posture: KnownPosture;
    startedAt: number;
    endedAt: number;
    sampleCount: number;
    minHeightCm: number;
    maxHeightCm: number;
}

export function classifyDeskPosture(
    valueCm: number,
    thresholds: Partial<PostureThresholds> = {}
): PostureKind {
    const normalized = normalizeThresholds(thresholds);

    if (!Number.isFinite(valueCm)) {
        return 'unknown';
    }

    if (valueCm <= normalized.sittingMaxCm) {
        return 'sitting';
    }

    if (valueCm >= normalized.standingMinCm) {
        return 'standing';
    }

    return 'unknown';
}

export function buildPostureSessions(
    records: DailyHeightRecord[],
    thresholds: Partial<PostureThresholds> = {}
): PostureSession[] {
    const normalized = normalizeThresholds(thresholds);
    const sessions: PostureSession[] = [];
    const sortedRecords = records
        .filter((record) => Number.isFinite(record.timestamp) && Number.isFinite(record.valueCm))
        .slice()
        .sort((left, right) => left.timestamp - right.timestamp);

    let current: SessionDraft | null = null;
    let previousKnownTimestamp: number | null = null;

    sortedRecords.forEach((record) => {
        const posture = classifyDeskPosture(record.valueCm, normalized);
        if (posture === 'unknown') {
            return;
        }

        if (
            current
            && previousKnownTimestamp !== null
            && record.timestamp - previousKnownTimestamp > normalized.maxSampleGapMs
        ) {
            appendSession(sessions, current, previousKnownTimestamp, normalized);
            current = null;
        }

        if (!current) {
            current = createDraft(posture, record);
            previousKnownTimestamp = record.timestamp;
            return;
        }

        if (current.posture !== posture) {
            appendSession(sessions, current, record.timestamp, normalized);
            current = createDraft(posture, record);
            previousKnownTimestamp = record.timestamp;
            return;
        }

        current.endedAt = record.timestamp;
        current.sampleCount += 1;
        current.minHeightCm = Math.min(current.minHeightCm, record.valueCm);
        current.maxHeightCm = Math.max(current.maxHeightCm, record.valueCm);
        previousKnownTimestamp = record.timestamp;
    });

    if (current && previousKnownTimestamp !== null) {
        appendSession(sessions, current, previousKnownTimestamp, normalized);
    }

    return sessions;
}

function createDraft(posture: KnownPosture, record: DailyHeightRecord): SessionDraft {
    return {
        posture,
        startedAt: record.timestamp,
        endedAt: record.timestamp,
        sampleCount: 1,
        minHeightCm: record.valueCm,
        maxHeightCm: record.valueCm
    };
}

function appendSession(
    sessions: PostureSession[],
    draft: SessionDraft,
    endedAt: number,
    thresholds: PostureThresholds
): void {
    const durationMs = Math.max(0, endedAt - draft.startedAt);
    if (durationMs < thresholds.minSessionDurationMs) {
        return;
    }

    sessions.push({
        posture: draft.posture,
        startedAt: draft.startedAt,
        endedAt,
        durationMs,
        sampleCount: draft.sampleCount,
        minHeightCm: draft.minHeightCm,
        maxHeightCm: draft.maxHeightCm
    });
}

function normalizeThresholds(thresholds: Partial<PostureThresholds>): PostureThresholds {
    const sittingMaxCm = Number.isFinite(thresholds.sittingMaxCm)
        ? Number(thresholds.sittingMaxCm)
        : DEFAULT_POSTURE_THRESHOLDS.sittingMaxCm;
    const standingMinCm = Number.isFinite(thresholds.standingMinCm)
        ? Number(thresholds.standingMinCm)
        : DEFAULT_POSTURE_THRESHOLDS.standingMinCm;

    return {
        sittingMaxCm: Math.min(sittingMaxCm, standingMinCm),
        standingMinCm: Math.max(standingMinCm, sittingMaxCm),
        maxSampleGapMs: Number.isFinite(thresholds.maxSampleGapMs) && Number(thresholds.maxSampleGapMs) > 0
            ? Number(thresholds.maxSampleGapMs)
            : DEFAULT_POSTURE_THRESHOLDS.maxSampleGapMs,
        minSessionDurationMs: Number.isFinite(thresholds.minSessionDurationMs) && Number(thresholds.minSessionDurationMs) > 0
            ? Number(thresholds.minSessionDurationMs)
            : DEFAULT_POSTURE_THRESHOLDS.minSessionDurationMs
    };
}
