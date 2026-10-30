import type { OverlayEvents } from '../../shared/ipc';
import { tagColorCss } from '../../shared/roomColors';
import { makeWheelCanvas } from '../shared/spinWheelCanvas';

interface SpinView {
  owner: string;
  choices: OverlayEvents['spin:start']['choices'];
  root: HTMLElement;
  wheel: HTMLCanvasElement;
  result: HTMLElement;
  timeoutText: string;
  animation: Animation | null;
  pendingResult: OverlayEvents['spin:result'] | null;
  ending: boolean;
  startTimer: ReturnType<typeof setTimeout>;
  timer: ReturnType<typeof setTimeout>;
}

const PREVIEW_MS = 2000;
const RESULT_MS = 2800;
const TIMEOUT_MS = 30_000;
const TIMEOUT_RESULT_MS = 3500;

const nameTag = (tag: OverlayEvents['spin:start']['tag']): HTMLElement => {
  const name = document.createElement('div');
  name.className = 'room-spin-name';
  name.textContent = tag.name;
  name.style.setProperty('--tag', tagColorCss(tag.color, tag.rgb));
  return name;
};

export class SpinStage {
  private readonly active = new Map<string, SpinView>();

  constructor(private readonly layer: HTMLElement) {}

  start(spin: OverlayEvents['spin:start']): void {
    const key = this.key(spin.owner, spin.id);
    for (const [activeKey, view] of this.active) if (view.owner === spin.owner) this.drop(activeKey);

    const root = document.createElement('section');
    root.className = 'room-spin';
    const pointer = document.createElement('span');
    pointer.className = 'room-spin-pointer';
    const wheel = makeWheelCanvas(spin.choices, 'room-spin-wheel');
    const result = document.createElement('div');
    result.className = 'room-spin-result';
    root.append(nameTag(spin.tag), pointer, wheel, result);
    this.layer.append(root);

    const view: SpinView = {
      owner: spin.owner,
      choices: spin.choices,
      root,
      wheel,
      result,
      timeoutText: spin.timeoutText,
      animation: null,
      pendingResult: null,
      ending: false,
      startTimer: setTimeout(() => this.begin(key, view), PREVIEW_MS),
      timer: setTimeout(() => this.timeout(key, view), TIMEOUT_MS),
    };
    this.active.set(key, view);
  }

  result(spin: OverlayEvents['spin:result']): void {
    const key = this.key(spin.owner, spin.id);
    const view = this.active.get(key);
    if (!view) {
      this.showFallback(spin);
      return;
    }
    if (view.ending) return;
    const choice = view.choices[spin.index];
    if (!choice) {
      this.drop(key);
      this.showFallback(spin);
      return;
    }

    clearTimeout(view.timer);
    view.pendingResult = spin;
    if (view.animation) this.finish(key, view, spin);
  }

  private begin(key: string, view: SpinView): void {
    if (this.active.get(key) !== view || view.ending) return;
    view.animation = view.wheel.animate(
      [{ transform: 'rotate(0deg)' }, { transform: 'rotate(360deg)' }],
      { duration: 900, easing: 'linear', iterations: Infinity },
    );
    if (view.pendingResult) this.finish(key, view, view.pendingResult);
  }

  private finish(key: string, view: SpinView, spin: OverlayEvents['spin:result']): void {
    const choice = view.choices[spin.index];
    const animation = view.animation;
    if (!choice || !animation || view.ending) return;
    view.ending = true;
    clearTimeout(view.startTimer);
    clearTimeout(view.timer);
    const currentAngle = (Number(animation.currentTime ?? 0) / 900) * 360;
    animation.cancel();
    view.wheel.style.transform = `rotate(${currentAngle}deg)`;
    const total = view.choices.reduce((sum, item) => sum + item.weight, 0);
    const before = view.choices.slice(0, spin.index).reduce((sum, item) => sum + item.weight, 0);
    const middle = ((before + choice.weight / 2) / total) * 360;
    const targetAngle = 360 - middle;
    const finalAngle = Math.ceil((currentAngle + 4 * 360 - targetAngle) / 360) * 360 + targetAngle;
    view.animation = view.wheel.animate(
      [{ transform: `rotate(${currentAngle}deg)` }, { transform: `rotate(${finalAngle}deg)` }],
      { duration: 1600, easing: 'cubic-bezier(.12,.72,.08,1)', fill: 'forwards' },
    );
    void view.animation.finished.then(() => {
      if (this.active.get(key) !== view) return;
      view.result.textContent = choice.label;
      view.root.classList.add('room-spin-finished');
      view.timer = setTimeout(() => this.drop(key), RESULT_MS);
    }).catch(() => undefined);
  }

  private timeout(key: string, view: SpinView): void {
    if (this.active.get(key) !== view || view.ending) return;
    view.ending = true;
    clearTimeout(view.startTimer);
    view.animation?.cancel();
    view.result.textContent = view.timeoutText;
    view.root.classList.add('room-spin-finished');
    view.timer = setTimeout(() => this.drop(key), TIMEOUT_RESULT_MS);
  }

  private showFallback(spin: OverlayEvents['spin:result']): void {
    const root = document.createElement('section');
    root.className = 'room-spin room-spin-fallback';
    const result = document.createElement('div');
    result.className = 'room-spin-result';
    result.textContent = spin.text;
    root.append(nameTag(spin.tag), result);
    this.layer.append(root);
    setTimeout(() => root.remove(), 3500);
  }

  private drop(key: string): void {
    const view = this.active.get(key);
    if (!view) return;
    clearTimeout(view.startTimer);
    clearTimeout(view.timer);
    view.animation?.cancel();
    view.root.remove();
    this.active.delete(key);
  }

  private key(owner: string, id: string): string {
    return `${owner}:${id}`;
  }
}