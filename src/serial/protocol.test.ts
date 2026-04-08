import { describe, expect, it } from 'vitest';
import { extractHeightSamples } from './protocol';

describe('extractHeightSamples', () => {
    it('decodes legacy packets', () => {
        const { samples, remainder } = extractHeightSamples([
            0x9b, 0x06, 0x02, 0x00, 0x03, 0x0c, 0x00, 0x9d
        ]);

        expect(samples).toEqual([78.0]);
        expect(remainder).toEqual([]);
    });

    it('decodes extended seven-segment packets with decimals', () => {
        const { samples, remainder } = extractHeightSamples([
            0x9b, 0x07, 0x12, 0x07, 0xef, 0x6f, 0x00, 0x00, 0x9d
        ]);

        expect(samples).toEqual([79.9]);
        expect(remainder).toEqual([]);
    });

    it('decodes compact seven-segment packets when the display flag is set', () => {
        const { samples, remainder } = extractHeightSamples([
            0x5a, 0x07, 0xef, 0x6f, 0x10, 0x00
        ]);

        expect(samples).toEqual([79.9]);
        expect(remainder).toEqual([]);
    });

    it('skips unknown bytes and keeps incomplete packets as remainder', () => {
        const { samples, remainder } = extractHeightSamples([
            0x00, 0xff, 0x9b, 0x06, 0x02, 0x00, 0x03
        ]);

        expect(samples).toEqual([]);
        expect(remainder).toEqual([0x9b, 0x06, 0x02, 0x00, 0x03]);
    });

    it('ignores invalid display packets and continues parsing later packets', () => {
        const { samples, remainder } = extractHeightSamples([
            0x5a, 0x07, 0xff, 0x6f, 0x00, 0x00,
            0x9b, 0x06, 0x02, 0x00, 0x02, 0xbc, 0x00, 0x9d
        ]);

        expect(samples).toEqual([70.0]);
        expect(remainder).toEqual([]);
    });
});
