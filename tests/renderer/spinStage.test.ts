import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { OverlayEvents } from '../../src/shared/ipc';
import { SpinStage } from '../../src/renderer/overlay/spinStage';

class FakeAnimation {
  currentTime = 450;
  cancelled = false;
  readonly finished = Promise.resolve(this as unknown as Animation);

  cancel(): void {
    this.cancelled = true;
  }
}

class FakeElement {
  className = '';
  textContent = '';
  width = 0;
  height = 0;
  parent: FakeElement | null = null;
  children: FakeElement[] = [];
  animations: { options?: KeyframeAnimationOptions }[] = [];
  classes = new Set<string>();
  readonly style: { [key: string]: unknown; transform?: string; setProperty: (key: string, value: string) => void } = {
    setProperty: (key, value) => { this.style[key] = value; },
  };
  readonly classList = { add: (value: string) => this.classes.add(value) };

  append(...elements: FakeElement[]): void {
    for (const element of elements) {
      element.parent = this;
      this.children.push(element);
    }
  }

  setAttribute(): void {}

  getContext(): CanvasRenderingContext2D {
    return new Proxy({}, {
      get: () => () => undefined,
      set: () => true,
    }) as CanvasRenderingContext2D;
  }

  animate(_keyframes: Keyframe[] | PropertyIndexedKeyframes, options?: KeyframeAnimationOptions): Animation {
    this.animations.push({ options });
    return new FakeAnimation() as unknown as Animation;
  }

  remove(): void {
    if (!this.parent) return;
    this.parent.children = this.parent.children.filter((child) => child !== this);
    this.parent = null;
  }
}

const startEvent: OverlayEvents['spin:start'] = {
  owner: '1234567890abcdef',
  id: 'fedcba9876543210',
  choices: [{ label: 'Push', weight: 1 }, { label: 'Farm', weight: 1 }],
  tag: { name: 'Host', color: 1 },
  timeoutText: 'Host timed out',
};

let layer: FakeElement;
let stage: SpinStage;

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('document', { createElement: () => new FakeElement() });
  layer = new FakeElement();
  stage = new SpinStage(layer as unknown as HTMLElement);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('SpinStage', () => {
  it('shows the received choices for two seconds before starting its local animation', () => {
    stage.start(startEvent);
    const wheel = layer.children[0].children[2];

    expect(wheel.animations).toHaveLength(0);
    vi.advanceTimersByTime(1999);
    expect(wheel.animations).toHaveLength(0);
    vi.advanceTimersByTime(1);

    expect(wheel.animations).toHaveLength(1);
    expect(wheel.animations[0].options).toMatchObject({ duration: 900, iterations: Infinity });
  });

  it('starts after the preview and settles locally when the host result arrives', async () => {
    stage.start(startEvent);
    const [root] = layer.children;
    const wheel = root.children[2];
    const result = root.children[3];

    stage.result({ ...startEvent, index: 1, text: 'Spin result: Farm' });
    expect(wheel.animations).toHaveLength(0);
    vi.advanceTimersByTime(2000);
    expect(wheel.animations).toHaveLength(2);
    expect(wheel.animations[1].options).toMatchObject({ duration: 1600, fill: 'forwards' });
    await Promise.resolve();

    expect(result.textContent).toBe('Farm');
    expect(root.classes.has('room-spin-finished')).toBe(true);
  });

  it('shows the host timeout when no result arrives within thirty seconds', () => {
    stage.start(startEvent);
    const [root] = layer.children;
    const result = root.children[3];

    vi.advanceTimersByTime(29_999);
    expect(result.textContent).toBe('');
    vi.advanceTimersByTime(1);

    expect(result.textContent).toBe('Host timed out');
    expect(root.classes.has('room-spin-finished')).toBe(true);
    vi.advanceTimersByTime(3500);
    expect(layer.children).toHaveLength(0);
  });
});