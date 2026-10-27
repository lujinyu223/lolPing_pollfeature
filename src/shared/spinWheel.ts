import { sanitizeText } from './roomProtocol';

export const MAX_SPIN_CHOICES = 32;
export const MAX_SPIN_LABEL = 50;
export const MAX_SPIN_WEIGHT = 1000;

export interface SpinChoice {
  label: string;
  weight: number;
}

/** Rebuilds saved wheel entries from untrusted settings or IPC data. */
export function normalizeSpinWheel(raw: unknown): SpinChoice[] {
  if (!Array.isArray(raw)) return [];
  const choices: SpinChoice[] = [];
  for (const value of raw) {
    if (choices.length >= MAX_SPIN_CHOICES) break;
    if (typeof value !== 'object' || value === null || Array.isArray(value)) continue;
    const item = value as Record<string, unknown>;
    if (typeof item.label !== 'string') continue;
    const label = [...sanitizeText(item.label)].slice(0, MAX_SPIN_LABEL).join('');
    if (!label) continue;
    const weight = typeof item.weight === 'number' && Number.isFinite(item.weight)
      ? Math.min(MAX_SPIN_WEIGHT, Math.max(1, Math.round(item.weight))) : 1;
    choices.push({ label, weight });
  }
  return choices;
}

/** Picks an entry by its relative weight; `randomBelow` must return an integer in [0, max). */
export function chooseSpinIndex(choices: readonly SpinChoice[], randomBelow: (max: number) => number): number | null {
  const total = choices.reduce((sum, choice) => sum + choice.weight, 0);
  if (total <= 0) return null;
  const draw = randomBelow(total);
  if (!Number.isInteger(draw) || draw < 0 || draw >= total) return null;
  let edge = 0;
  for (const [index, choice] of choices.entries()) {
    edge += choice.weight;
    if (draw < edge) return index;
  }
  return null;
}