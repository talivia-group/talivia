import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CookieJar, JSDOM } from 'jsdom';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';

const trackerSource = readFileSync(join(process.cwd(), 'src/tracker/index.js'), 'utf8');

type ObserverCallback = (
  entries: IntersectionObserverEntry[],
  observer: IntersectionObserver,
) => void;
type MutationCallback = (records: MutationRecord[], observer: MutationObserver) => void;

class TestIntersectionObserver {
  static instances: TestIntersectionObserver[] = [];

  readonly observed = new Set<Element>();

  constructor(
    private readonly callback: ObserverCallback,
    readonly options: IntersectionObserverInit,
  ) {
    TestIntersectionObserver.instances.push(this);
  }

  observe = (target: Element) => {
    this.observed.add(target);
  };

  unobserve = (target: Element) => {
    this.observed.delete(target);
  };

  disconnect = () => {
    this.observed.clear();
  };

  emit(target: Element, intersectionRatio: number) {
    this.callback(
      [
        {
          target,
          isIntersecting: intersectionRatio > 0,
          intersectionRatio,
        } as IntersectionObserverEntry,
      ],
      this as unknown as IntersectionObserver,
    );
  }
}

class TestMutationObserver {
  static instances: TestMutationObserver[] = [];

  constructor(private readonly callback: MutationCallback) {
    TestMutationObserver.instances.push(this);
  }

  observe() {}
  disconnect() {}

  emit(addedNodes: Node[]) {
    this.callback(
      [{ addedNodes } as unknown as MutationRecord],
      this as unknown as MutationObserver,
    );
  }
}

let script: HTMLScriptElement | undefined;
let currentScriptDescriptor: PropertyDescriptor | undefined;
let readyStateDescriptor: PropertyDescriptor | undefined;

beforeEach(() => {
  TestIntersectionObserver.instances = [];
  TestMutationObserver.instances = [];
  currentScriptDescriptor = Object.getOwnPropertyDescriptor(document, 'currentScript');
  readyStateDescriptor = Object.getOwnPropertyDescriptor(document, 'readyState');

  vi.stubGlobal('IntersectionObserver', TestIntersectionObserver);
  vi.stubGlobal('MutationObserver', TestMutationObserver);
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      json: vi.fn().mockResolvedValue({}),
    }),
  );

  Object.defineProperty(document, 'readyState', {
    configurable: true,
    value: 'complete',
  });

  document.body.innerHTML = '';
  window.localStorage.clear();
  window.sessionStorage.clear();
  document.cookie.split(';').forEach(cookie => {
    // biome-ignore lint/suspicious/noDocumentCookie: Direct cookie mutation is the behavior under test.
    document.cookie = `${cookie.split('=')[0].trim()}=;max-age=0;path=/`;
  });
  window.history.replaceState(null, '', '/');
});

afterEach(() => {
  script?.remove();
  script = undefined;
  delete (window as Window & { talivia?: unknown }).talivia;
  vi.useRealTimers();
  vi.unstubAllGlobals();

  if (currentScriptDescriptor) {
    Object.defineProperty(document, 'currentScript', currentScriptDescriptor);
  } else {
    delete (document as Document & { currentScript?: HTMLScriptElement }).currentScript;
  }

  if (readyStateDescriptor) {
    Object.defineProperty(document, 'readyState', readyStateDescriptor);
  } else {
    delete (document as Document & { readyState?: string }).readyState;
  }
});

const installTracker = (attributes: Record<string, string> = {}) => {
  script = document.createElement('script');
  script.setAttribute('data-website-id', 'website-id');
  script.setAttribute('data-host-url', 'https://collector.example');
  Object.entries(attributes).forEach(([name, value]) => {
    script?.setAttribute(`data-${name}`, value);
  });
  document.head.append(script);

  Object.defineProperty(document, 'currentScript', {
    configurable: true,
    value: script,
  });

  new Function('window', 'document', trackerSource)(window, document);
};

const flushPromises = () => new Promise(resolve => setTimeout(resolve, 0));

test('tracks a visible element once after it remains above its threshold', () => {
  vi.useFakeTimers();

  const element = document.createElement('section');
  element.setAttribute('data-talivia-visible', 'pricing-seen');
  element.setAttribute('data-talivia-visible-threshold', '0.7');
  element.setAttribute('data-talivia-visible-delay', '500');
  document.body.append(element);

  installTracker();

  const fetchMock = vi.mocked(fetch);
  fetchMock.mockClear();

  const observer = TestIntersectionObserver.instances[0];
  expect(observer.options.threshold).toBe(0.7);

  observer.emit(element, 0.8);
  vi.advanceTimersByTime(250);
  observer.emit(element, 0.6);
  vi.advanceTimersByTime(500);
  expect(fetchMock).not.toHaveBeenCalled();

  observer.emit(element, 0.8);
  vi.advanceTimersByTime(500);

  expect(fetchMock).toHaveBeenCalledTimes(1);
  const request = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
  expect(request).toMatchObject({
    type: 'event',
    payload: {
      name: 'pricing-seen',
      data: {
        visibility_percentage: 80,
        threshold: 0.7,
        delay: 500,
      },
    },
  });

  observer.emit(element, 0.8);
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

test('observes visible elements added after the tracker loads', () => {
  installTracker();

  const fetchMock = vi.mocked(fetch);
  fetchMock.mockClear();

  const element = document.createElement('div');
  element.setAttribute('data-talivia-visible', 'modal-seen');
  document.body.append(element);

  TestMutationObserver.instances[0].emit([element]);
  TestIntersectionObserver.instances[0].emit(element, 0.5);

  expect(fetchMock).toHaveBeenCalledTimes(1);
  const request = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
  expect(request.payload.name).toBe('modal-seen');
});

test('stores visitor and session identity in first-party cookies', () => {
  installTracker({ 'auto-track': 'false' });

  const identity = window.talivia.getSessionId?.();

  expect(document.cookie).toContain('talivia_visitor_id=v_');
  expect(document.cookie).toContain(`talivia_session_id=${identity}`);
});

test('keeps collector cache off the public API and shares it with internal scripts', async () => {
  vi.mocked(fetch).mockResolvedValueOnce({
    json: vi.fn().mockResolvedValue({ cache: 'collector-cache' }),
  } as unknown as Response);

  installTracker();
  await flushPromises();

  expect((window.talivia as unknown as { getContext?: unknown }).getContext).toBeUndefined();

  let cache;
  const handleContext = (event: Event) => {
    cache = (event as CustomEvent).detail?.cache || cache;
  };
  document.addEventListener('talivia:collector-context', handleContext);
  document.dispatchEvent(new CustomEvent('talivia:request-collector-context'));
  document.removeEventListener('talivia:collector-context', handleContext);

  expect(cache).toBe('collector-cache');
});

test('shares visitor and session cookies across configured subdomains', () => {
  const cookieJar = new CookieJar();
  const getIdentity = (host: string, crossDomains = '') => {
    const dom = new JSDOM('<script></script>', {
      cookieJar,
      runScripts: 'outside-only',
      url: `https://${host}/`,
    });
    const tracker = dom.window.document.querySelector('script');
    tracker?.setAttribute('data-website-id', 'shared-website');
    tracker?.setAttribute('data-domain', 'example.com');
    if (crossDomains) tracker?.setAttribute('data-cross-domain-domains', crossDomains);
    tracker?.setAttribute('data-auto-track', 'false');
    Object.defineProperty(dom.window.document, 'currentScript', {
      configurable: true,
      value: tracker,
    });
    dom.window.eval(trackerSource);

    return (
      dom.window as unknown as Window & { talivia: { getSessionId: () => string } }
    ).talivia.getSessionId();
  };

  const marketingIdentity = getIdentity('example.com');
  const appIdentity = getIdentity('app.example.com');

  expect(appIdentity).toBe(marketingIdentity);

  const checkoutIdentity = getIdentity('pay.checkout.example.net', 'checkout.example.net');
  const checkoutCookies = cookieJar.getCookiesSync('https://checkout.example.net/');

  expect(checkoutIdentity).not.toBe(marketingIdentity);
  expect(checkoutCookies.some(cookie => cookie.domain === 'checkout.example.net')).toBe(true);
});

test('starts a new rolling session after its cookie expires', () => {
  installTracker({ domain: 'localhost' });

  const fetchMock = vi.mocked(fetch);
  const firstRequest = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
  const firstSessionId = firstRequest.payload.sessionId;

  // biome-ignore lint/suspicious/noDocumentCookie: Expiry must mimic the browser deleting the cookie.
  document.cookie = 'talivia_session_id=;max-age=0;path=/';
  (window as Window & { talivia: { track: () => void } }).talivia.track();

  const secondRequest = JSON.parse(String(fetchMock.mock.calls[1][1]?.body));
  expect(secondRequest.payload.sessionId).not.toBe(firstSessionId);
  expect(secondRequest.payload.sessionId).toMatch(/^s_/);
});

test('keeps one in-memory session when the browser rejects cookie writes', () => {
  const dom = new JSDOM('<script></script>', {
    runScripts: 'outside-only',
    url: 'https://private.example/',
  });
  const tracker = dom.window.document.querySelector('script');
  tracker?.setAttribute('data-website-id', 'private-website');
  tracker?.setAttribute('data-auto-track', 'false');
  Object.defineProperty(dom.window.document, 'currentScript', {
    configurable: true,
    value: tracker,
  });
  Object.defineProperty(dom.window.document, 'cookie', {
    configurable: true,
    get: () => '',
    set: () => {},
  });

  dom.window.eval(trackerSource);
  const api = (dom.window as unknown as Window & { talivia: { getSessionId: () => string } })
    .talivia;
  const firstSessionId = api.getSessionId();

  expect(api.getSessionId()).toBe(firstSessionId);
  expect(firstSessionId).toMatch(/^s_/);
});

test('keeps tracking when cookie access throws', () => {
  const dom = new JSDOM('<script></script>', {
    runScripts: 'outside-only',
    url: 'https://sandboxed.example/',
  });
  const tracker = dom.window.document.querySelector('script');
  tracker?.setAttribute('data-website-id', 'sandboxed-website');
  tracker?.setAttribute('data-auto-track', 'false');
  Object.defineProperty(dom.window.document, 'currentScript', {
    configurable: true,
    value: tracker,
  });
  Object.defineProperty(dom.window.document, 'cookie', {
    configurable: true,
    get: () => {
      throw new DOMException('Cookie access is blocked.', 'SecurityError');
    },
    set: () => {
      throw new DOMException('Cookie access is blocked.', 'SecurityError');
    },
  });

  dom.window.eval(trackerSource);
  const api = (dom.window as unknown as Window & { talivia: { getSessionId: () => string } })
    .talivia;
  const firstSessionId = api.getSessionId();

  expect(api.getSessionId()).toBe(firstSessionId);
});

test('decorates configured cross-domain links with a signed linker', async () => {
  vi.mocked(fetch).mockResolvedValue({
    json: vi.fn().mockResolvedValue({
      cache: 'cache-token',
      linker: 'signed-linker',
      linkerExpiresAt: Date.now() + 5 * 60 * 1000,
      sessionId: 's_shared',
      visitorId: 'v_shared',
    }),
  } as unknown as Response);

  installTracker({
    domain: 'localhost',
    'cross-domain-domains': 'checkout.example',
  });
  await flushPromises();

  const link = document.createElement('a');
  link.href = 'https://checkout.example/pay?plan=pro';
  document.body.append(link);
  link.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));

  expect(new URL(link.href).searchParams.get('_tlv')).toBe('signed-linker');
});

test('refreshes an expired cross-domain linker before decorating a later click', async () => {
  vi.mocked(fetch)
    .mockResolvedValueOnce({
      json: vi.fn().mockResolvedValue({
        cache: 'cache-token',
        linker: 'expired-linker',
        linkerExpiresAt: Date.now() - 1,
        sessionId: 's_shared',
        visitorId: 'v_shared',
      }),
    } as unknown as Response)
    .mockResolvedValueOnce({
      json: vi.fn().mockResolvedValue({
        cache: 'cache-token',
        linker: 'fresh-linker',
        linkerExpiresAt: Date.now() + 5 * 60 * 1000,
        sessionId: 's_shared',
        visitorId: 'v_shared',
      }),
    } as unknown as Response);

  installTracker({
    domain: 'localhost',
    'cross-domain-domains': 'checkout.example',
  });
  await flushPromises();

  const link = document.createElement('a');
  link.href = 'https://checkout.example/pay';
  document.body.append(link);
  link.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
  await flushPromises();

  const refreshRequest = JSON.parse(String(vi.mocked(fetch).mock.calls[1][1]?.body));
  expect(refreshRequest.type).toBe('linker');

  link.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
  expect(new URL(link.href).searchParams.get('_tlv')).toBe('fresh-linker');
});

test('automatically adds the current session to Dodo static payment links', () => {
  installTracker({ domain: 'localhost', 'auto-track': 'false' });

  const sessionId = window.talivia.getSessionId?.();
  const link = document.createElement('a');
  link.href = 'https://checkout.dodopayments.com/buy/product_123?quantity=2';
  document.body.append(link);
  link.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));

  const decoratedUrl = new URL(link.href);
  expect(decoratedUrl.searchParams.get('quantity')).toBe('2');
  expect(decoratedUrl.searchParams.get('metadata_talivia_session_id')).toBe(sessionId);
});

test('automatically adds the current session to Dodo test payment links', () => {
  installTracker({ domain: 'localhost', 'auto-track': 'false' });

  const sessionId = window.talivia.getSessionId?.();
  const link = document.createElement('a');
  link.href = 'https://test.checkout.dodopayments.com/buy/product_123?quantity=1';
  document.body.append(link);
  link.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));

  const decoratedUrl = new URL(link.href);
  expect(decoratedUrl.searchParams.get('metadata_talivia_session_id')).toBe(sessionId);
});

test('does not decorate non-payment Dodo links', () => {
  installTracker({ domain: 'localhost', 'auto-track': 'false' });

  const link = document.createElement('a');
  link.href = 'https://checkout.dodopayments.com/account';
  document.body.append(link);
  link.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));

  expect(new URL(link.href).searchParams.has('metadata_talivia_session_id')).toBe(false);
});

test('automatically adds the current session to LemonSqueezy checkout links', () => {
  installTracker({ domain: 'localhost', 'auto-track': 'false' });

  const sessionId = window.talivia.getSessionId?.();
  const link = document.createElement('a');
  link.href =
    'https://talivia.lemonsqueezy.com/checkout/buy/variant_123?checkout%5Bdiscount_code%5D=TEST';
  document.body.append(link);
  link.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));

  const decoratedUrl = new URL(link.href);
  expect(decoratedUrl.searchParams.get('checkout[discount_code]')).toBe('TEST');
  expect(decoratedUrl.searchParams.get('checkout[custom][talivia_session_id]')).toBe(sessionId);
});

test('does not decorate non-checkout LemonSqueezy links', () => {
  installTracker({ domain: 'localhost', 'auto-track': 'false' });

  const link = document.createElement('a');
  link.href = 'https://talivia.lemonsqueezy.com/my-orders';
  document.body.append(link);
  link.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));

  expect(new URL(link.href).searchParams.has('checkout[custom][talivia_session_id]')).toBe(false);
});

test('automatically adds the current session to Stripe Payment Links', () => {
  installTracker({ domain: 'localhost', 'auto-track': 'false' });

  const sessionId = window.talivia.getSessionId?.();
  const link = document.createElement('a');
  link.href = 'https://buy.stripe.com/test_123?prefilled_email=buyer%40example.com';
  document.body.append(link);
  link.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));

  const decoratedUrl = new URL(link.href);
  expect(decoratedUrl.searchParams.get('prefilled_email')).toBe('buyer@example.com');
  expect(decoratedUrl.searchParams.get('client_reference_id')).toBe(sessionId);
});

test('does not overwrite a merchant Stripe client reference', () => {
  installTracker({ domain: 'localhost', 'auto-track': 'false' });

  const link = document.createElement('a');
  link.href = 'https://buy.stripe.com/test_123?client_reference_id=cart_123';
  document.body.append(link);
  link.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));

  expect(new URL(link.href).searchParams.get('client_reference_id')).toBe('cart_123');
});

test('does not rewrite Yolfi Paylinks with tracking metadata', () => {
  installTracker({ domain: 'localhost', 'auto-track': 'false' });

  const link = document.createElement('a');
  link.href =
    'https://pay.yolfi.com/550e8400-e29b-41d4-a716-446655440001?email=buyer%40example.com';
  document.body.append(link);
  link.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));

  const url = new URL(link.href);
  expect(url.searchParams.get('email')).toBe('buyer@example.com');
  expect(url.searchParams.has('metadata[talivia_session_id]')).toBe(false);
});

test('forwards an incoming linker once and removes it from the visible URL', () => {
  window.history.replaceState(null, '', '/welcome?utm_source=partner&_tlv=signed-linker');

  installTracker({ domain: 'localhost' });

  const request = JSON.parse(String(vi.mocked(fetch).mock.calls[0][1]?.body));
  expect(request.payload.linker).toBe('signed-linker');
  expect(request.payload.url).not.toContain('_tlv');
  expect(window.location.search).toBe('?utm_source=partner');
});
