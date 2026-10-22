import { EventEmitter } from 'node:events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RoomPolls, type RoomPollsDeps } from '../../src/main/roomPolls';
import type { PollDefinition, PollView } from '../../src/shared/pollTally';

const definition: PollDefinition = { mode: 'single', question: 'Map?', options: ['A', 'B'] };

function setup() {
  const bus = new EventEmitter();
  let phase = 'active';
  const sent: { id: string; choices?: number[]; definition?: PollDefinition }[] = [];
  const views: (PollView | null)[] = [];
  const results: PollView[] = [];
  const room = Object.assign(bus, {
    self: 'me',
    state: () => ({ phase, members: [{ peer: 'me', self: true }, { peer: 'guest' }] }),
    sendPoll: (id: string, poll: PollDefinition) => sent.push({ id, definition: poll }),
    sendPollBallot: (id: string, choices: number[]) => sent.push({ id, choices }),
  });
  const polls = new RoomPolls({
    room: room as unknown as RoomPollsDeps['room'], now: Date.now, randomId: () => 'abcdef01',
    onView: (view) => views.push(view), onResult: (view) => results.push(view),
  });
  return { polls, room, sent, views, results, leave: () => { phase = 'idle'; bus.emit('state'); } };
}

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(0); });
afterEach(() => vi.useRealTimers());

describe('RoomPolls', () => {
  it('starts a poll, counts each voter once, and reports the result once', () => {
    const { polls, room, sent, views, results } = setup();
    expect(polls.start(definition)).toBe('started');
    expect(polls.start(definition)).toBe('busy');
    expect(sent[0]).toEqual({ id: 'abcdef01', definition });
    polls.answer('wrong', [1]);
    polls.answer('abcdef01', [1]);
    polls.answer('abcdef01', [0]);
    room.emit('pollBallot', { peer: 'stranger', id: 'abcdef01', choices: [0] });
    expect(views.at(-1)?.counts).toEqual([0, 1]);
    room.emit('pollBallot', { peer: 'guest', id: 'abcdef01', choices: [0] });
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({ over: true, counts: [1, 1] });
    vi.advanceTimersByTime(5000);
    expect(views.at(-1)).toBeNull();
    expect(results).toHaveLength(1);
    polls.stop();
  });

  it('receives room polls, repeats ballots, times out, and cleans up on leave', () => {
    const { polls, room, sent, views, results, leave } = setup();
    room.emit('poll', { ...definition, peer: 'guest', id: '12345678' });
    polls.answer('12345678', [0]);
    vi.advanceTimersByTime(3000);
    expect(sent).toEqual([{ id: '12345678', choices: [0] }, { id: '12345678', choices: [0] }]);
    vi.advanceTimersByTime(57000);
    expect(results[0]).toMatchObject({ over: true, counts: [1, 0] });
    leave();
    expect(views.at(-1)).toBeNull();
    expect(polls.start(definition)).toBe('invalid');
    polls.stop();
    expect(room.listenerCount('poll')).toBe(0);
  });

  it('does not open polls from unknown or muted members', () => {
    const { polls, room, views } = setup();
    room.emit('poll', { ...definition, peer: 'stranger', id: '12345678' });
    expect(views).toEqual([]);
    expect(polls.start({ ...definition, options: ['A'] })).toBe('invalid');
    polls.stop();
  });
});