// Chart.js rAF-throttles native events and replays them on update. Admit only the
// current mouse event or a completed tap, so dismissal also revokes queued work.
export function bindChartInteractions(
  canvas: HTMLCanvasElement,
  dismiss: () => void,
  getEvents: () => readonly string[],
) {
  let activeEvent: Event | null = null;
  let touchInput = false;
  let inputPoint = { x: Number.NaN, y: Number.NaN };
  let pendingMouseMove = false;
  let tapReady = 0;
  let contact: {
    family: 'pointer' | 'touch';
    id: number;
    x: number;
    y: number;
    started: number;
    cancelled: boolean;
  } | null = null;
  const listeners: Array<() => void> = [];
  const listen = (target: EventTarget, type: string, handler: (event: any) => void) => {
    target.addEventListener(type, handler, { capture: true, passive: true });
    listeners.push(() => target.removeEventListener(type, handler, true));
  };
  const hide = () => {
    const visible = activeEvent !== null;
    activeEvent = null;
    pendingMouseMove = false;
    tapReady = 0;
    if (contact) contact.cancelled = true;
    if (visible) dismiss();
  };
  const record = (event: Event) => {
    if (getEvents().includes(event.type)) activeEvent = event;
  };
  const mousePoint = (point: { clientX: number; clientY: number }, owner: Window = window) => {
    // Always compare in top-viewport client coordinates, even when screen data
    // availability changes or parent scrolling moves a scaled same-origin iframe.
    let x = point.clientX;
    let y = point.clientY;
    try {
      while (owner.frameElement) {
        const frame = owner.frameElement as HTMLElement;
        const bounds = frame.getBoundingClientRect();
        x = bounds.left + (x + frame.clientLeft) * (bounds.width / frame.offsetWidth || 1);
        y = bounds.top + (y + frame.clientTop) * (bounds.height / frame.offsetHeight || 1);
        owner = owner.parent;
      }
    } catch {
      /* Cross-origin host: local coordinates are the accessible fallback. */
    }
    return { x, y };
  };
  const mouseMove = (event: any, owner: Window) => {
    if (event.type === 'pointermove' && event.pointerType !== 'mouse') return;
    if (event.sourceCapabilities?.firesTouchEvents) return;
    const point = mousePoint(event, owner);
    const moved = !(Math.hypot(point.x - inputPoint.x, point.y - inputPoint.y) < 1);
    // A physical pointermove may be followed by one same-position mousemove.
    // Dismissal revokes this allowance; stationary events cannot create it.
    const paired = event.type === 'mousemove' && pendingMouseMove;
    pendingMouseMove = false;
    if (!moved && !paired) return;
    if (moved) inputPoint = point;
    touchInput = false;
    if (event.composedPath().includes(canvas)) {
      pendingMouseMove = event.type === 'pointermove';
      record(event);
    }
  };
  const start = (family: 'pointer' | 'touch', id: number, point: PointerEvent | Touch) => {
    touchInput = true;
    inputPoint = mousePoint(point);
    hide();
    contact = {
      family,
      id,
      x: point.clientX,
      y: point.clientY,
      started: Date.now(),
      cancelled: false,
    };
  };
  const move = (point: PointerEvent | Touch) => {
    inputPoint = mousePoint(point);
    if (contact && Math.hypot(point.clientX - contact.x, point.clientY - contact.y) > 10) hide();
  };
  const finish = (event: Event, family: 'pointer' | 'touch', id: number) => {
    if (!contact || contact.family !== family || contact.id !== id) return;
    tapReady =
      !contact.cancelled &&
      Date.now() - contact.started < 600 &&
      event.composedPath().includes(canvas)
        ? Date.now() + 1000
        : 0;
    contact = null;
  };

  listen(canvas, 'pointerdown', event => {
    if (event.pointerType === 'mouse') {
      touchInput = false;
      pendingMouseMove = false;
      inputPoint = mousePoint(event);
      record(event);
    } else if (!contact) {
      start('pointer', event.pointerId, event);
    } else {
      hide(); // A second contact is a pinch, not a tap.
    }
  });
  listen(canvas, 'pointermove', event => {
    if (
      event.pointerType !== 'mouse' &&
      contact?.family === 'pointer' &&
      event.pointerId === contact.id
    ) {
      move(event);
    }
  });
  listen(canvas, 'touchstart', event => {
    if (event.touches?.length > 1) {
      hide();
      return;
    }
    if (contact?.family === 'pointer') return; // Same contact's compatibility TouchEvent.
    const touch = event.changedTouches?.[0];
    if (touch) start('touch', touch.identifier, touch);
  });
  listen(canvas, 'touchmove', event => {
    const touch = Array.from(event.touches || []).find(
      (touch: any) => touch.identifier === contact?.id,
    ) as Touch | undefined;
    if (contact?.family === 'touch' && touch) move(touch);
  });
  listen(window, 'pointerup', event => finish(event, 'pointer', event.pointerId));
  listen(window, 'touchend', event => {
    for (const touch of Array.from(event.changedTouches || []) as Touch[]) {
      finish(event, 'touch', touch.identifier);
    }
  });
  for (const type of ['pointercancel', 'touchcancel']) {
    listen(window, type, () => {
      hide();
      contact = null;
    });
  }
  listen(canvas, 'mousedown', event => {
    if (!touchInput && !event.sourceCapabilities?.firesTouchEvents) record(event);
  });
  listen(canvas, 'click', event => {
    if (touchInput) {
      if (!tapReady || Date.now() > tapReady) return;
      tapReady = 0;
    }
    record(event); // Click selects the nearest point, including repeated same-point taps.
  });
  for (const type of ['mouseout', 'pointerout']) {
    listen(canvas, type, () => {
      if (!touchInput) hide();
    });
  }
  // The public homepage embeds this chart in a same-origin iframe. Its parent's
  // scrolling/outside presses must dismiss too, without changing the demo wrapper.
  let owner: Window = window;
  while (true) {
    // Track real movement outside the chart too: an exit and return to the same
    // point is movement, but pointerout alone (also emitted by scroll) is not.
    const mouseOwner = owner;
    for (const type of ['pointermove', 'mousemove']) {
      listen(owner, type, event => mouseMove(event, mouseOwner));
    }
    for (const type of ['pointerdown', 'touchstart', 'mousedown']) {
      listen(owner, type, event => {
        if (!event.composedPath().includes(canvas)) hide();
      });
    }
    listen(owner, 'scroll', hide); // Capture includes non-bubbling nested-owner scroll.
    // Parent blur fires when this iframe receives focus, between touchend and click.
    if (owner === window) listen(owner, 'blur', hide);
    try {
      if (owner.parent === owner || owner.parent.document === undefined) break;
      owner = owner.parent;
    } catch {
      break; // Cross-origin embeds cannot access their host's events.
    }
  }

  const allowsTooltip = () => activeEvent !== null;
  return {
    allowsTooltip,
    beforeEvent(event: { type: string; native?: Event }, _replay = false) {
      return allowsTooltip() && event.native === activeEvent;
    },
    destroy() {
      activeEvent = null;
      contact = null;
      for (const remove of listeners) remove();
    },
  };
}
