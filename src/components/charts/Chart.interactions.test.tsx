import { act, cleanup, render } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import { Chart } from './Chart';

// Unit-level event ordering tests; the browser regression uses the real Chart.js canvas.
const state = vi.hoisted(() => ({ chart: null as any }));
vi.mock('chart.js/auto', () => ({
  default: class {
    static defaults = {
      font: {},
      events: ['mousemove', 'mouseout', 'click', 'touchstart', 'touchmove'],
    };
    canvas: HTMLCanvasElement;
    options: any;
    plugins: any[];
    data: any;
    legend = { legendItems: [] };
    tooltip = { setActiveElements: vi.fn(), update: vi.fn() };
    setActiveElements = vi.fn();
    update = vi.fn();
    destroy = vi.fn();
    constructor(canvas: HTMLCanvasElement, config: any) {
      Object.assign(this, config);
      this.canvas = canvas;
      state.chart = this;
    }
  },
}));
vi.mock('@/components/metrics/Legend', () => ({ Legend: () => null }));

afterEach(cleanup);

function getCanvas(container: HTMLElement) {
  const canvas = container.querySelector('canvas');
  if (!canvas) throw new Error('Expected a mounted chart canvas');
  return canvas;
}

function setup(events?: string[]) {
  const onTooltip = vi.fn();
  const onClick = vi.fn();
  const view = render(
    <div data-test="scroll-owner">
      <Chart
        type="line"
        chartData={{ datasets: [] }}
        chartOptions={{ onClick, ...(events ? { events } : {}) } as any}
        onTooltip={onTooltip}
        showLegend={false}
      />
    </div>,
  );
  const canvas = getCanvas(view.container);
  return { ...view, canvas, chart: state.chart, onTooltip, onClick };
}

function native(target: EventTarget, type: string, properties = {}) {
  const event = new Event(type, { bubbles: type !== 'scroll', cancelable: true });
  Object.assign(event, properties);
  act(() => target.dispatchEvent(event));
  return event;
}

// Mirrors Chart.js's throttled beforeEvent -> tooltip external -> afterEvent ordering.
function deliver(chart: any, native: Event, replay = false) {
  act(() => {
    const args = {
      event: {
        type:
          (
            {
              touchstart: 'mousedown',
              touchmove: 'mousemove',
              pointerdown: 'mousedown',
              pointermove: 'mousemove',
            } as Record<string, string>
          )[native.type] || native.type,
        native,
      },
      inChartArea: true,
      replay,
    };
    if (chart.plugins.some((plugin: any) => plugin.beforeEvent?.(chart, args) === false)) return;
    if (args.event.type === 'click' && !replay) chart.options.onClick?.();
    chart.options.plugins.tooltip.external({ chart, tooltip: { opacity: 1, dataPoints: [] } });
    for (const plugin of chart.plugins) plugin.afterEvent?.(chart, args, {});
  });
}

function tap(canvas: HTMLCanvasElement, chart: any, x = 50) {
  const contact = { identifier: 7, target: canvas, clientX: x, clientY: 50 };
  native(canvas, 'touchstart', { touches: [contact], changedTouches: [contact] });
  native(canvas, 'touchend', { touches: [], changedTouches: [contact] });
  const click = native(canvas, 'click', { clientX: x, clientY: 50 });
  deliver(chart, click);
  return click;
}

function mouseMove(target: EventTarget, x: number, mode = 'pointer + mouse') {
  const point = { clientX: x, clientY: 50 };
  if (mode === 'pointer + mouse') {
    native(target, 'pointermove', { ...point, pointerType: 'mouse' });
  }
  return native(target, 'mousemove', point);
}

test('a short tap opens after release and stays open; tapping another or the same point selects it', () => {
  const { canvas, chart, onTooltip } = setup();
  for (const x of [50, 80, 80]) {
    tap(canvas, chart, x);
    expect(onTooltip.mock.lastCall?.[0].tooltip.opacity).toBe(1);
    native(canvas, 'mouseout'); // Touch compatibility exit must not dismiss a pinned tooltip.
    expect(onTooltip.mock.lastCall?.[0].tooltip.opacity).toBe(1);
  }
});

test('touchstart/move are not hover: no hold is needed and nothing opens before tap completion', () => {
  const { canvas, chart, onTooltip } = setup();
  deliver(chart, native(canvas, 'touchstart'));
  deliver(chart, native(canvas, 'touchmove'));
  expect(onTooltip.mock.calls.every(([context]) => context.tooltip.opacity === 0)).toBe(true);
});

for (const owner of ['window', 'document', 'nested']) {
  test(`${owner} scroll dismisses pinned tooltip and rejects queued click/replay/external callbacks`, () => {
    const { canvas, chart, onTooltip, getByTestId } = setup();
    const click = tap(canvas, chart);
    const target =
      owner === 'window' ? window : owner === 'document' ? document : getByTestId('scroll-owner');
    native(target, 'scroll');
    expect(onTooltip.mock.lastCall?.[0].tooltip.opacity).toBe(0);
    expect(chart.setActiveElements).toHaveBeenLastCalledWith([]);
    expect(chart.tooltip.setActiveElements).toHaveBeenLastCalledWith([], { x: 0, y: 0 });
    deliver(chart, click);
    deliver(chart, click, true);
    deliver(chart, native(canvas, 'mousemove', { clientX: 50, clientY: 50 }));
    deliver(chart, native(canvas, 'click'));
    act(() => chart.options.plugins.tooltip.external({ chart, tooltip: { opacity: 1 } }));
    expect(onTooltip.mock.lastCall?.[0].tooltip.opacity).toBe(0);
    tap(canvas, chart);
    expect(onTooltip.mock.lastCall?.[0].tooltip.opacity).toBe(1);
  });
}

test.each([
  'pointerdown',
  'touchstart',
  'mousedown',
])('outside %s dismisses, while chart taps select', type => {
  const { canvas, chart, onTooltip } = setup();
  tap(canvas, chart);
  native(document.body, type);
  expect(onTooltip.mock.lastCall?.[0].tooltip.opacity).toBe(0);
  tap(canvas, chart);
  expect(onTooltip.mock.lastCall?.[0].tooltip.opacity).toBe(1);
});

test.each([
  'touchcancel',
  'pointercancel',
  'scroll',
])('%s during contact prevents synthesized click reopening', type => {
  const { canvas, chart, onTooltip, onClick } = setup();
  tap(canvas, chart);
  const contact = { identifier: 7, clientX: 50, clientY: 50 };
  native(canvas, 'touchstart', { touches: [contact], changedTouches: [contact] });
  native(window, type);
  native(canvas, 'touchend', { touches: [], changedTouches: [contact] });
  deliver(chart, native(canvas, 'click'));
  expect(onTooltip.mock.lastCall?.[0].tooltip.opacity).toBe(0);
  expect(onClick).toHaveBeenCalledTimes(1);
});

test('a new pointer tap works after native pointer cancellation during pan', () => {
  const { canvas, chart, onTooltip } = setup();
  native(canvas, 'pointerdown', { pointerType: 'touch', pointerId: 1, clientX: 50, clientY: 50 });
  native(canvas, 'pointercancel', { pointerType: 'touch', pointerId: 1 });
  native(canvas, 'pointerdown', { pointerType: 'touch', pointerId: 2, clientX: 50, clientY: 50 });
  native(canvas, 'pointerup', { pointerType: 'touch', pointerId: 2 });
  deliver(chart, native(canvas, 'click'));
  expect(onTooltip.mock.lastCall?.[0].tooltip.opacity).toBe(1);
});

test('a drag without a scroll event never turns into a tap; native pan/pinch remain allowed', () => {
  const { canvas, chart, onTooltip } = setup();
  tap(canvas, chart);
  const contact = { identifier: 7, clientX: 50, clientY: 50 };
  const start = native(canvas, 'touchstart', { touches: [contact], changedTouches: [contact] });
  const moved = { ...contact, clientY: 75 };
  const move = native(canvas, 'touchmove', { touches: [moved], changedTouches: [moved] });
  native(canvas, 'touchend', { touches: [], changedTouches: [moved] });
  deliver(chart, native(canvas, 'click'));
  expect(onTooltip.mock.lastCall?.[0].tooltip.opacity).toBe(0);
  expect(start.defaultPrevented || move.defaultPrevented).toBe(false);
  expect(canvas.style.touchAction).not.toBe('none');
});

test('a long press and a multi-touch pinch cannot synthesize a tap', () => {
  const { canvas, chart, onTooltip } = setup();
  const now = vi.spyOn(Date, 'now').mockReturnValue(1000);
  const contact = { identifier: 7, clientX: 50, clientY: 50 };
  native(canvas, 'touchstart', { touches: [contact], changedTouches: [contact] });
  now.mockReturnValue(2000);
  native(canvas, 'touchend', { touches: [], changedTouches: [contact] });
  deliver(chart, native(canvas, 'click'));
  expect(onTooltip.mock.calls.every(([context]) => context.tooltip.opacity === 0)).toBe(true);
  now.mockRestore();
  native(canvas, 'touchstart', {
    touches: [contact, { ...contact, identifier: 8 }],
    changedTouches: [contact],
  });
  native(canvas, 'touchend', { touches: [], changedTouches: [contact] });
  deliver(chart, native(canvas, 'click'));
  expect(onTooltip.mock.calls.every(([context]) => context.tooltip.opacity === 0)).toBe(true);
});

test('stationary compatibility mouse movement after scroll cannot reopen, real hybrid movement can', () => {
  const { canvas, chart, onTooltip } = setup();
  tap(canvas, chart, 50);
  native(window, 'scroll');
  native(canvas, 'pointermove', { pointerType: 'mouse', clientX: 50, clientY: 50 });
  deliver(chart, native(canvas, 'mousemove', { clientX: 50, clientY: 50 }));
  expect(onTooltip.mock.lastCall?.[0].tooltip.opacity).toBe(0);
  native(canvas, 'pointermove', { pointerType: 'mouse', clientX: 55, clientY: 50 });
  deliver(chart, native(canvas, 'mousemove', { clientX: 55, clientY: 50 }));
  expect(onTooltip.mock.lastCall?.[0].tooltip.opacity).toBe(1);
});

test.each([
  'touch',
  'mouse',
])('%s screen coordinates becoming zero after scroll cannot reopen; real mouse movement can', pointerType => {
  const { canvas, chart, onTooltip } = setup();
  native(canvas, 'pointerdown', {
    pointerType,
    pointerId: 1,
    clientX: 50,
    clientY: 50,
    screenX: 188,
    screenY: 293,
  });
  native(canvas, 'pointerup', { pointerType, pointerId: 1 });
  deliver(chart, native(canvas, 'click'));
  expect(onTooltip.mock.lastCall?.[0].tooltip.opacity).toBe(1);
  native(window, 'scroll');
  expect(onTooltip.mock.lastCall?.[0].tooltip.opacity).toBe(0);
  native(canvas, 'pointermove', {
    pointerType: 'mouse',
    clientX: 50,
    clientY: 50,
    screenX: 0,
    screenY: 0,
  });
  deliver(chart, native(canvas, 'mousemove', { clientX: 50, clientY: 50, screenX: 0, screenY: 0 }));
  expect(onTooltip.mock.lastCall?.[0].tooltip.opacity).toBe(0);
  native(canvas, 'pointermove', {
    pointerType: 'mouse',
    clientX: 55,
    clientY: 50,
    screenX: 0,
    screenY: 0,
  });
  deliver(chart, native(canvas, 'mousemove', { clientX: 55, clientY: 50, screenX: 0, screenY: 0 }));
  expect(onTooltip.mock.lastCall?.[0].tooltip.opacity).toBe(1);
});

test.each([
  'pointer + mouse',
  'mouse only',
])('scaled iframe %s uses top-viewport movement through parent scroll and outside reentry', mode => {
  const parent = Object.assign(new EventTarget(), {
    document,
    parent: null as any,
    frameElement: null,
  });
  parent.parent = parent;
  const frame = document.createElement('iframe');
  Object.defineProperties(frame, {
    offsetWidth: { value: 800 },
    offsetHeight: { value: 600 },
    clientLeft: { value: 2 },
    clientTop: { value: 4 },
  });
  let top = 98.5;
  vi.spyOn(frame, 'getBoundingClientRect').mockImplementation(
    () => ({ left: 14, top, width: 400, height: 300 }) as DOMRect,
  );
  const frameSpy = vi.spyOn(window, 'frameElement', 'get').mockReturnValue(frame);
  const parentSpy = vi.spyOn(window, 'parent', 'get').mockReturnValue(parent as any);
  try {
    const { canvas, chart, onTooltip } = setup();
    native(canvas, 'pointerdown', {
      pointerType: 'touch',
      pointerId: 1,
      clientX: 346,
      clientY: 385,
      screenX: 188,
      screenY: 293,
    });
    native(canvas, 'pointerup', { pointerType: 'touch', pointerId: 1 });
    deliver(chart, native(canvas, 'click'));
    expect(onTooltip.mock.lastCall?.[0].tooltip.opacity).toBe(1);
    top -= 100; // At 0.5 scale, local y increases by 200 at the same top-viewport point.
    native(parent, 'scroll');
    expect(onTooltip.mock.lastCall?.[0].tooltip.opacity).toBe(0);
    const move = (clientX: number) => {
      const point = { clientX, clientY: 585, screenX: 0, screenY: 0 };
      if (mode === 'pointer + mouse') {
        native(canvas, 'pointermove', { ...point, pointerType: 'mouse' });
      }
      deliver(chart, native(canvas, 'mousemove', point));
    };
    const dismissedCalls = onTooltip.mock.calls.length;
    move(346);
    expect(onTooltip).toHaveBeenCalledTimes(dismissedCalls);
    expect(onTooltip.mock.lastCall?.[0].tooltip.opacity).toBe(0);
    move(356);
    expect(onTooltip.mock.lastCall?.[0].tooltip.opacity).toBe(1);
    native(canvas, 'pointerout', { pointerType: 'mouse', clientX: 356, clientY: 585 });
    native(canvas, 'mouseout', { clientX: 356, clientY: 585 });
    expect(onTooltip.mock.lastCall?.[0].tooltip.opacity).toBe(0);
    // The parent event is already in top-viewport coordinates, not frame-local ones.
    native(parent, 'mousemove', { clientX: 220, clientY: 293 });
    const outsideCalls = onTooltip.mock.calls.length;
    move(356);
    expect(onTooltip).toHaveBeenCalledTimes(outsideCalls + 1);
    expect(onTooltip.mock.lastCall?.[0].tooltip.opacity).toBe(1);
  } finally {
    frameSpy.mockRestore();
    parentSpy.mockRestore();
  }
});

test('desktop stationary mouse events after scroll cannot restore dismissed hover', () => {
  const { canvas, chart, onTooltip } = setup();
  deliver(chart, mouseMove(canvas, 50));
  expect(onTooltip.mock.lastCall?.[0].tooltip.opacity).toBe(1);
  native(window, 'scroll');
  deliver(chart, mouseMove(canvas, 50));
  expect(onTooltip.mock.lastCall?.[0].tooltip.opacity).toBe(0);
});

test.each([
  'pointer + mouse',
  'mouse only',
])('desktop same-position reentry works after native outside movement (%s)', mode => {
  const { canvas, chart, onTooltip } = setup();
  const first = mouseMove(canvas, 50, mode);
  deliver(chart, first);
  expect(onTooltip.mock.lastCall?.[0].tooltip.opacity).toBe(1);
  native(canvas, 'pointerout', { pointerType: 'mouse', clientX: 50, clientY: 50 });
  native(canvas, 'mouseout', { clientX: 50, clientY: 50 });
  expect(onTooltip.mock.lastCall?.[0].tooltip.opacity).toBe(0);
  // A genuine trip outside, not just a layout/scroll-generated pointerout.
  mouseMove(document.body, 100, mode);
  const dismissedCalls = onTooltip.mock.calls.length;
  deliver(chart, first, true);
  expect(onTooltip).toHaveBeenCalledTimes(dismissedCalls);
  deliver(chart, mouseMove(canvas, 50, mode));
  expect(onTooltip).toHaveBeenCalledTimes(dismissedCalls + 1);
  expect(onTooltip.mock.lastCall?.[0].tooltip.opacity).toBe(1);
});

test.each([
  'scroll',
  'scroll with pointerout',
])('standalone stationary mousemove cannot reopen after %s; physical mousemove can', dismissal => {
  const { canvas, chart, onTooltip } = setup();
  deliver(chart, mouseMove(canvas, 50));
  expect(onTooltip.mock.lastCall?.[0].tooltip.opacity).toBe(1);
  native(window, 'scroll');
  if (dismissal === 'scroll with pointerout') {
    native(canvas, 'pointerout', { pointerType: 'mouse', clientX: 50, clientY: 50 });
    native(canvas, 'mouseout', { clientX: 50, clientY: 50 });
  }
  expect(onTooltip.mock.lastCall?.[0].tooltip.opacity).toBe(0);
  const dismissedCalls = onTooltip.mock.calls.length;
  deliver(chart, mouseMove(canvas, 50, 'mouse only'));
  expect(onTooltip).toHaveBeenCalledTimes(dismissedCalls);
  expect(onTooltip.mock.lastCall?.[0].tooltip.opacity).toBe(0);
  deliver(chart, mouseMove(canvas, 55, 'mouse only'));
  expect(onTooltip).toHaveBeenCalledTimes(dismissedCalls + 1);
  expect(onTooltip.mock.lastCall?.[0].tooltip.opacity).toBe(1);
  // A pointer/mouse pair is not a persistent stationary-move permission.
  deliver(chart, mouseMove(canvas, 55, 'mouse only'));
  expect(onTooltip).toHaveBeenCalledTimes(dismissedCalls + 1);
  native(window, 'scroll');
  const redismissedCalls = onTooltip.mock.calls.length;
  deliver(chart, mouseMove(canvas, 55, 'mouse only'));
  expect(onTooltip).toHaveBeenCalledTimes(redismissedCalls);
  // Dismissal between the physical pointermove and its compatibility move
  // must also revoke the pending allowance.
  native(canvas, 'pointermove', { pointerType: 'mouse', clientX: 60, clientY: 50 });
  native(window, 'scroll');
  deliver(chart, mouseMove(canvas, 60, 'mouse only'));
  expect(onTooltip).toHaveBeenCalledTimes(redismissedCalls);
});

test('mouse hover still moves when the browser reports screen coordinates as zero', () => {
  const { canvas, chart, onTooltip } = setup();
  native(canvas, 'pointermove', {
    pointerType: 'mouse',
    clientX: 50,
    clientY: 50,
    screenX: 0,
    screenY: 0,
  });
  deliver(chart, native(canvas, 'mousemove', { clientX: 50, clientY: 50, screenX: 0, screenY: 0 }));
  native(window, 'scroll');
  native(canvas, 'pointermove', {
    pointerType: 'mouse',
    clientX: 55,
    clientY: 50,
    screenX: 0,
    screenY: 0,
  });
  deliver(chart, native(canvas, 'mousemove', { clientX: 55, clientY: 50, screenX: 0, screenY: 0 }));
  expect(onTooltip.mock.lastCall?.[0].tooltip.opacity).toBe(1);
});

test('desktop hover survives mouse release, scroll dismisses, hybrid real mouse can resume', () => {
  const { canvas, chart, onTooltip } = setup();
  deliver(chart, mouseMove(canvas, 50, 'mouse only'));
  native(canvas, 'pointerup', { pointerType: 'mouse', clientX: 50, clientY: 50 });
  expect(onTooltip.mock.lastCall?.[0].tooltip.opacity).toBe(1);
  native(window, 'scroll');
  expect(onTooltip.mock.lastCall?.[0].tooltip.opacity).toBe(0);
  deliver(chart, mouseMove(canvas, 55, 'mouse only'));
  expect(onTooltip.mock.lastCall?.[0].tooltip.opacity).toBe(1);
  tap(canvas, chart);
  deliver(chart, mouseMove(canvas, 60));
  native(canvas, 'mouseout');
  expect(onTooltip.mock.lastCall?.[0].tooltip.opacity).toBe(0);
});

test.each([
  'mouseout',
  'blur',
])('%s clears desktop tooltip and stale callbacks cannot revive', type => {
  const { canvas, chart, onTooltip } = setup();
  const move = mouseMove(canvas, 50, 'mouse only');
  deliver(chart, move);
  native(type === 'blur' ? window : canvas, type);
  deliver(chart, move, true);
  expect(onTooltip.mock.lastCall?.[0].tooltip.opacity).toBe(0);
});

test('pen uses the same intentional tap lifecycle, unrelated pointer releases do not complete it', () => {
  const { canvas, chart, onTooltip } = setup();
  native(canvas, 'pointerdown', { pointerType: 'pen', pointerId: 7, clientX: 50, clientY: 50 });
  native(window, 'pointerup', { pointerType: 'pen', pointerId: 8 });
  deliver(chart, native(canvas, 'click'));
  expect(onTooltip.mock.calls.every(([context]) => context.tooltip.opacity === 0)).toBe(true);
  native(canvas, 'pointerup', { pointerType: 'pen', pointerId: 7 });
  deliver(chart, native(canvas, 'click'));
  expect(onTooltip.mock.lastCall?.[0].tooltip.opacity).toBe(1);
});

test('selection and iOS callout are disabled only on the chart surface, not surrounding metrics', () => {
  const { canvas, container } = setup();
  const surface = canvas.parentElement as HTMLDivElement;
  expect(surface.style.userSelect).toBe('none');
  expect(surface.style.webkitUserSelect).toBe('none');
  expect((surface.style as any).WebkitTouchCallout).toBe('none');
  expect(container.style.userSelect).toBe('');
});

test('embedded demo accepts tap despite parent focus blur; parent scroll and outside tap dismiss', () => {
  const parent = Object.assign(new EventTarget(), { document, parent: null as any });
  parent.parent = parent;
  const spy = vi.spyOn(window, 'parent', 'get').mockReturnValue(parent as any);
  try {
    const { canvas, chart, onTooltip } = setup();
    const contact = { identifier: 7, clientX: 50, clientY: 50 };
    native(canvas, 'touchstart', { touches: [contact], changedTouches: [contact] });
    native(canvas, 'touchend', { touches: [], changedTouches: [contact] });
    native(parent, 'blur'); // Focusing the iframe blurs its parent before compatibility click.
    deliver(chart, native(canvas, 'click'));
    expect(onTooltip.mock.lastCall?.[0].tooltip.opacity).toBe(1);
    native(parent, 'scroll');
    expect(onTooltip.mock.lastCall?.[0].tooltip.opacity).toBe(0);
    tap(canvas, chart);
    native(parent, 'pointerdown');
    expect(onTooltip.mock.lastCall?.[0].tooltip.opacity).toBe(0);
  } finally {
    spy.mockRestore();
  }
});

test('unmount removes exact passive native listeners, including parent movement tracking', () => {
  const parent = Object.assign(new EventTarget(), { document, parent: null as any });
  parent.parent = parent;
  const parentSpy = vi.spyOn(window, 'parent', 'get').mockReturnValue(parent as any);
  const addParent = vi.spyOn(parent, 'addEventListener');
  const removeParent = vi.spyOn(parent, 'removeEventListener');
  const add = vi.spyOn(window, 'addEventListener');
  const remove = vi.spyOn(window, 'removeEventListener');
  const addCanvas = vi.spyOn(HTMLCanvasElement.prototype, 'addEventListener');
  const removeCanvas = vi.spyOn(HTMLCanvasElement.prototype, 'removeEventListener');
  try {
    const { canvas, chart, onTooltip, unmount } = setup();
    tap(canvas, chart);
    const passiveCapture = ([, , options]: any[]) =>
      typeof options === 'object' && options?.capture && options?.passive;
    const owned = add.mock.calls.filter(passiveCapture);
    const ownedCanvas = addCanvas.mock.calls.filter(passiveCapture);
    const ownedParent = addParent.mock.calls.filter(passiveCapture);
    expect(ownedCanvas.length).toBeGreaterThan(0);
    for (const calls of [owned, ownedParent]) {
      expect(calls.map(([type]) => type)).toEqual(
        expect.arrayContaining(['pointermove', 'mousemove']),
      );
    }
    unmount();
    onTooltip.mockClear();
    native(window, 'scroll');
    mouseMove(window, 100);
    native(parent, 'scroll');
    mouseMove(parent, 150, 'mouse only');
    expect(onTooltip).not.toHaveBeenCalled();
    expect(chart.destroy).toHaveBeenCalledOnce();
    for (const [type, handler] of owned) expect(remove).toHaveBeenCalledWith(type, handler, true);
    for (const [type, handler] of ownedCanvas)
      expect(removeCanvas).toHaveBeenCalledWith(type, handler, true);
    for (const [type, handler] of ownedParent)
      expect(removeParent).toHaveBeenCalledWith(type, handler, true);
  } finally {
    parentSpy.mockRestore();
    addParent.mockRestore();
    removeParent.mockRestore();
    add.mockRestore();
    remove.mockRestore();
    addCanvas.mockRestore();
    removeCanvas.mockRestore();
  }
});
