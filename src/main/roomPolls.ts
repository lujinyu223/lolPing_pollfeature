import { normalizePoll, PollTally, type PollDefinition, type PollView } from '../shared/pollTally';
import type { PollBallotMsg, PollMsg } from '../shared/roomProtocol';
import type { RoomManager } from './roomManager';

export interface RoomPollsDeps {
  room: Pick<RoomManager, 'self' | 'state' | 'sendPoll' | 'sendPollBallot' | 'on' | 'off'>;
  now(): number;
  randomId(): string;
  onView(view: PollView | null): void;
  onResult(view: PollView): void;
}

export class RoomPolls {
  private readonly tally: PollTally;
  private timer: ReturnType<typeof setInterval> | null = null;
  private closeTimer: ReturnType<typeof setTimeout> | null = null;
  private reported = false;

  constructor(private readonly deps: RoomPollsDeps) {
    this.tally = new PollTally(deps.now);
    deps.room.on('poll', this.onPoll);
    deps.room.on('pollBallot', this.onBallot);
    deps.room.on('state', this.onState);
  }

  start(raw: unknown): 'started' | 'busy' | 'invalid' {
    const definition = normalizePoll(raw);
    if (!definition || this.deps.room.state().phase !== 'active') return 'invalid';
    if (this.tally.view() && !this.tally.view()?.over) return 'busy';
    const id = this.deps.randomId();
    this.begin(id, this.deps.room.self, definition);
    this.deps.room.sendPoll(id, definition);
    return 'started';
  }

  answer(id: string, choices: number[]): void {
    if (!this.tally.answer(this.deps.room.self, id, choices)) return;
    this.deps.room.sendPollBallot(id, choices);
    this.push();
  }

  stop(): void {
    this.deps.room.off('poll', this.onPoll);
    this.deps.room.off('pollBallot', this.onBallot);
    this.deps.room.off('state', this.onState);
    this.clear();
  }

  private begin(id: string, starter: string, definition: PollDefinition): void {
    const voters = this.deps.room.state().members
      .filter((member) => member.self || !(member.noChat || member.votesOff || member.needsUpdate))
      .map((member) => member.peer);
    this.clear();
    this.tally.start(id, starter, definition, voters);
    let ticks = 0;
    this.timer = setInterval(() => {
      const view = this.tally.view();
      const mine = view?.ballots[this.deps.room.self];
      if (view && !view.over && mine && ++ticks % 3 === 0) this.deps.room.sendPollBallot(view.id, mine);
      this.push();
    }, 1000);
    this.push();
  }

  private push(): void {
    const view = this.tally.view();
    if (!view) return;
    this.deps.onView(view);
    if (!view.over || this.reported) return;
    this.reported = true;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.closeTimer = setTimeout(() => this.clear(), 5000);
    this.deps.onResult(view);
  }

  private clear(): void {
    if (this.timer) clearInterval(this.timer);
    if (this.closeTimer) clearTimeout(this.closeTimer);
    this.timer = this.closeTimer = null;
    this.tally.clear();
    this.reported = false;
    this.deps.onView(null);
  }

  private readonly onPoll = (message: PollMsg): void => {
    const state = this.deps.room.state();
    const sender = state.members.find((member) => member.peer === message.peer);
    const current = this.tally.view();
    if (state.phase !== 'active' || !sender || sender.self || sender.muted || current && !current.over) return;
    const definition = normalizePoll(message);
    if (definition) this.begin(message.id, message.peer, definition);
  };

  private readonly onBallot = (message: PollBallotMsg): void => {
    if (this.tally.answer(message.peer, message.id, message.choices)) this.push();
  };

  private readonly onState = (): void => {
    if (this.deps.room.state().phase === 'idle') this.clear();
  };
}