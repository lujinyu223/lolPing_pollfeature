import { describe, expect, it } from 'vitest';
import { chooseSpinIndex, normalizeSpinWheel } from '../../src/shared/spinWheel';

describe('spinWheel', () => {
  it('normalizes labels and weights from saved data', () => {
    expect(normalizeSpinWheel([
      { label: '  Map A  ', weight: 3 },
      { label: '\u200b', weight: 2 },
      { label: 'Map B', weight: 0 },
      null,
    ])).toEqual([{ label: 'Map A', weight: 3 }, { label: 'Map B', weight: 1 }]);
  });

  it('caps the number and length of choices and the maximum weight', () => {
    const choices = normalizeSpinWheel([{ label: 'A'.repeat(60), weight: 5000 }, ...Array.from({ length: 40 }, (_, i) => ({ label: `Choice ${i}`, weight: 1 }))]);
    expect(choices).toHaveLength(32);
    expect(choices[0]).toEqual({ label: 'A'.repeat(50), weight: 1000 });
  });

  it('selects by weight across every interval', () => {
    const choices = [{ label: 'A', weight: 1 }, { label: 'B', weight: 3 }];
    expect(chooseSpinIndex(choices, () => 0)).toBe(0);
    expect(chooseSpinIndex(choices, () => 1)).toBe(1);
    expect(chooseSpinIndex(choices, () => 3)).toBe(1);
  });

  it('rejects empty choices and invalid random draws', () => {
    expect(chooseSpinIndex([], () => 0)).toBeNull();
    expect(chooseSpinIndex([{ label: 'A', weight: 1 }], () => 1)).toBeNull();
  });
});