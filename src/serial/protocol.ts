import type { CommandName } from '../types';

export const COMMAND_INTERVAL_MS = 108;

export const COMMAND_FRAMES: Record<CommandName, number[]> = {
    WAKE_UP: [0x9b, 0x06, 0x02, 0x00, 0x00, 0x6c, 0xa1, 0x9d],
    UP: [0x9b, 0x06, 0x02, 0x01, 0x00, 0xfc, 0xa0, 0x9d],
    DOWN: [0x9b, 0x06, 0x02, 0x02, 0x00, 0x0c, 0xa0, 0x9d],
    PRESET1: [0x9b, 0x06, 0x02, 0x04, 0x00, 0xac, 0xa3, 0x9d],
    PRESET2: [0x9b, 0x06, 0x02, 0x08, 0x00, 0xac, 0xa6, 0x9d],
    SITTING: [0x9b, 0x06, 0x02, 0x00, 0x01, 0xac, 0x60, 0x9d],
    STANDING: [0x9b, 0x06, 0x02, 0x10, 0x00, 0xac, 0xac, 0x9d]
};

const SEVEN_SEGMENT_DIGITS = new Map<number, string>([
    [0x3f, '0'],
    [0x06, '1'],
    [0x5b, '2'],
    [0x4f, '3'],
    [0x66, '4'],
    [0x6d, '5'],
    [0x7d, '6'],
    [0x07, '7'],
    [0x7f, '8'],
    [0x6f, '9']
]);

export function extractHeightSamples(buffer: number[]): { samples: number[]; remainder: number[] } {
    const samples: number[] = [];
    let offset = 0;

    while (offset < buffer.length) {
        const byte = buffer[offset];

        if (byte === 0x9b) {
            if (offset <= buffer.length - 9) {
                const extendedPacket = buffer.slice(offset, offset + 9);
                const extendedSample = decodeSegmentHeightPacket(extendedPacket);
                if (typeof extendedSample === 'number') {
                    samples.push(extendedSample);
                    offset += 9;
                    continue;
                }
            }

            if (offset > buffer.length - 8) {
                break;
            }

            const sample = decodeLegacyPacket(buffer.slice(offset, offset + 8));
            if (typeof sample === 'number') {
                samples.push(sample);
            }

            offset += 8;
            continue;
        }

        if (byte === 0x5a) {
            if (offset > buffer.length - 6) {
                break;
            }

            const sample = decodeSevenSegmentPacket(buffer.slice(offset, offset + 6));
            if (typeof sample === 'number') {
                samples.push(sample);
            }

            offset += 6;
            continue;
        }

        if (byte === 0x50) {
            if (offset > buffer.length - 6) {
                break;
            }

            offset += 6;
            continue;
        }

        offset += 1;
    }

    return {
        samples,
        remainder: buffer.slice(offset)
    };
}

function decodeLegacyPacket(packet: number[]): number | null {
    if (packet[0] !== 0x9b || packet[1] !== 0x06) {
        return null;
    }

    const heightRaw = (packet[4] << 8) | packet[5];
    if (heightRaw === 0) {
        return null;
    }

    const heightCm = heightRaw / 10;
    return heightCm >= 55 && heightCm <= 130 ? heightCm : null;
}

function decodeSegmentHeightPacket(packet: number[]): number | null {
    if (packet[0] !== 0x9b || packet[1] !== 0x07 || packet[2] !== 0x12 || packet[8] !== 0x9d) {
        return null;
    }

    const digits = packet.slice(3, 6).map((segment) => SEVEN_SEGMENT_DIGITS.get(segment & 0x7f) ?? '');
    if (digits.some((digit) => digit === '')) {
        return null;
    }

    const middleHasDecimal = (packet[4] & 0x80) !== 0;
    const value = middleHasDecimal
        ? Number(`${digits[0]}${digits[1]}.${digits[2]}`)
        : Number(digits.join(''));

    return Number.isFinite(value) && value >= 55 && value <= 130 ? value : null;
}

function decodeSevenSegmentPacket(packet: number[]): number | null {
    if (packet[0] !== 0x5a) {
        return null;
    }

    const displayFlags = packet[4];
    if ((displayFlags & 0x10) === 0) {
        return null;
    }

    const digits = packet.slice(1, 4).map((segment) => SEVEN_SEGMENT_DIGITS.get(segment & 0x7f) ?? '');
    if (digits.some((digit) => digit === '')) {
        return null;
    }

    const middleHasDecimal = (packet[2] & 0x80) !== 0;
    const value = middleHasDecimal
        ? Number(`${digits[0]}${digits[1]}.${digits[2]}`)
        : Number(digits.join(''));

    return Number.isFinite(value) && value >= 55 && value <= 130 ? value : null;
}
