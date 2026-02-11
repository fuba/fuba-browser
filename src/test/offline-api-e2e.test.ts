import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Response } from 'superagent';
import { Snapshot } from '../types/snapshot.js';
import { addConsoleMessage, addPageError } from '../server/routes/debug.js';
import { createOfflineE2EHarness, OfflineE2EHarness } from './support/offline-e2e-harness.js';

function binaryResponseParser(
  res: Response,
  callback: (error: Error | null, data: Buffer) => void
): void {
  const chunks: Buffer[] = [];
  res.on('data', (chunk: Buffer | string) => {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  });
  res.on('end', () => {
    callback(null, Buffer.concat(chunks));
  });
  res.on('error', (error: Error) => {
    callback(error, Buffer.alloc(0));
  });
}

function findRefBySelector(snapshot: Snapshot, selector: string): string {
  const entry = Object.entries(snapshot.refs).find(([, node]) => node.selector === selector);
  if (!entry) {
    throw new Error(`ref not found for selector: ${selector}`);
  }
  return entry[0];
}

describe.sequential('Offline API E2E', () => {
  let harness: OfflineE2EHarness | null = null;

  const requireHarness = (): OfflineE2EHarness => {
    if (!harness) {
      throw new Error('Harness is not initialized');
    }
    return harness;
  };

  const apiGet = (path: string) => requireHarness().agent.get(`/api${path}`);
  const apiDelete = (path: string) => requireHarness().agent.delete(`/api${path}`);
  const apiPost = (path: string, body: string | Record<string, unknown> = {}) => requireHarness().agent.post(`/api${path}`).send(body);

  beforeAll(async () => {
    harness = await createOfflineE2EHarness();
  }, 120000);

  beforeEach(async () => {
    const currentHarness = requireHarness();
    await apiPost('/navigate', { url: `${currentHarness.baseUrl}/app` });
    await apiDelete('/console');
    await apiDelete('/errors');
  });

  afterAll(async () => {
    if (harness) {
      await harness.close();
    }
  });

  it('verifies health and content APIs', async () => {
    const currentHarness = requireHarness();
    const healthRes = await currentHarness.agent.get('/health');
    expect(healthRes.status).toBe(200);
    expect(healthRes.body).toEqual({ status: 'ok', version: '0.1.0' });

    const contentRes = await apiGet('/content');
    expect(contentRes.status).toBe(200);
    expect(contentRes.body.success).toBe(true);
    expect(contentRes.body.data.title).toBe('Offline Fixture');
    expect(contentRes.body.data.url).toBe(`${currentHarness.baseUrl}/app`);
    expect(contentRes.body.data.markdown).toContain('Primary Action');

    const elementsRes = await apiGet('/elements');
    expect(elementsRes.status).toBe(200);
    expect(elementsRes.body.success).toBe(true);
    expect(elementsRes.body.data.some((item: { selector: string }) => item.selector === '#primary-btn')).toBe(true);

    const domRes = await apiGet('/dom');
    expect(domRes.status).toBe(200);
    expect(domRes.body.success).toBe(true);
    expect(domRes.body.data.title).toBe('Offline Fixture');
    expect(domRes.body.data.elementsCount).toBeGreaterThan(0);
  });

  it('verifies browser interaction and screenshot APIs', async () => {
    const typeRes = await apiPost('/type', { selector: '#text-input', text: 'abc' });
    expect(typeRes.status).toBe(200);
    expect(typeRes.body.success).toBe(true);

    const clickRes = await apiPost('/click', { selector: '#primary-btn' });
    expect(clickRes.status).toBe(200);
    expect(clickRes.body.success).toBe(true);

    const countRes = await apiGet(`/get/text/${encodeURIComponent('#click-count')}`);
    expect(countRes.status).toBe(200);
    expect(countRes.body.data.text).toBe('1');

    const valueRes = await apiGet(`/get/value/${encodeURIComponent('#text-input')}`);
    expect(valueRes.status).toBe(200);
    expect(valueRes.body.data.value).toBe('abc');

    const scrollRes = await apiPost('/scroll', { x: 0, y: 240 });
    expect(scrollRes.status).toBe(200);

    const evalRes = await apiPost('/eval', { script: 'window.scrollY' });
    expect(evalRes.status).toBe(200);
    expect(evalRes.body.data.result).toBeGreaterThanOrEqual(200);

    const screenshotGetRes = await apiGet('/screenshot').buffer(true).parse(binaryResponseParser);
    expect(screenshotGetRes.status).toBe(200);
    expect(screenshotGetRes.headers['content-type']).toContain('image/png');
    expect(Buffer.isBuffer(screenshotGetRes.body)).toBe(true);
    expect(screenshotGetRes.body.byteLength).toBeGreaterThan(0);

    const screenshotBase64Res = await apiPost('/screenshot', { selector: '#main-panel', type: 'base64' });
    expect(screenshotBase64Res.status).toBe(200);
    expect(screenshotBase64Res.body.success).toBe(true);
    expect(screenshotBase64Res.body.screenshot).toMatch(/^data:image\/png;base64,/);
  });

  it('verifies getter and wait APIs', async () => {
    const currentHarness = requireHarness();
    const titleRes = await apiGet('/get/title');
    expect(titleRes.status).toBe(200);
    expect(titleRes.body.data.title).toBe('Offline Fixture');

    const urlRes = await apiGet('/get/url');
    expect(urlRes.status).toBe(200);
    expect(urlRes.body.data.url).toBe(`${currentHarness.baseUrl}/app`);

    const textRes = await apiGet(`/get/text/${encodeURIComponent('#title')}`);
    expect(textRes.status).toBe(200);
    expect(textRes.body.data.text).toBe('Offline Fixture');

    const htmlRes = await apiGet(`/get/html/${encodeURIComponent('#main-panel')}`);
    expect(htmlRes.status).toBe(200);
    expect(htmlRes.body.data.html).toContain('primary-btn');

    const attrRes = await apiGet(`/get/attr/${encodeURIComponent('#next-link')}/${encodeURIComponent('href')}`);
    expect(attrRes.status).toBe(200);
    expect(attrRes.body.data.value).toContain('/next');

    const countRes = await apiGet(`/get/count/${encodeURIComponent('.countable')}`);
    expect(countRes.status).toBe(200);
    expect(countRes.body.data.count).toBe(2);

    const boxRes = await apiGet(`/get/box/${encodeURIComponent('#main-panel')}`);
    expect(boxRes.status).toBe(200);
    expect(boxRes.body.data.box.width).toBeGreaterThan(0);

    const visibleRes = await apiPost('/is/visible', { selector: '#main-panel' });
    expect(visibleRes.status).toBe(200);
    expect(visibleRes.body.data.visible).toBe(true);

    const enabledRes = await apiPost('/is/enabled', { selector: '#disabled-btn' });
    expect(enabledRes.status).toBe(200);
    expect(enabledRes.body.data.enabled).toBe(false);

    await apiPost('/eval', {
      script: "setTimeout(() => { const el = document.createElement('div'); el.id = 'delayed-marker'; el.textContent = 'READY_TEXT'; document.body.appendChild(el); }, 120); true;",
    });

    const waitSelectorRes = await apiPost('/wait/selector', { selector: '#delayed-marker', timeout: 5000 });
    expect(waitSelectorRes.status).toBe(200);
    expect(waitSelectorRes.body.data.found).toBe(true);

    const waitTextRes = await apiPost('/wait/text', { text: 'READY_TEXT', timeout: 5000 });
    expect(waitTextRes.status).toBe(200);
    expect(waitTextRes.body.data.found).toBe(true);

    await apiPost('/eval', {
      script: `setTimeout(() => { window.location.href = '${currentHarness.baseUrl}/next?from=wait'; }, 100); true;`,
    });

    const waitUrlRes = await apiPost('/wait/url', { pattern: 'next', timeout: 5000 });
    expect(waitUrlRes.status).toBe(200);
    expect(waitUrlRes.body.data.url).toContain('/next');

    const waitLoadRes = await apiPost('/wait/load', { state: 'domcontentloaded', timeout: 5000 });
    expect(waitLoadRes.status).toBe(200);
    expect(waitLoadRes.body.data.state).toBe('domcontentloaded');

    const waitTimeoutRes = await apiPost('/wait/timeout', { ms: 80 });
    expect(waitTimeoutRes.status).toBe(200);
    expect(waitTimeoutRes.body.data.waited).toBe(80);
  });

  it('verifies snapshot and action APIs', async () => {
    const snapshotRes = await apiGet('/snapshot?interactive=true&compact=true');
    expect(snapshotRes.status).toBe(200);
    expect(snapshotRes.body.success).toBe(true);

    const snapshot = snapshotRes.body.data as Snapshot;
    const primaryRef = findRefBySelector(snapshot, '#primary-btn');
    const dblRef = findRefBySelector(snapshot, '#dbl-btn');
    const textRef = findRefBySelector(snapshot, '#text-input');
    const checkRef = findRefBySelector(snapshot, '#check-input');
    const selectRef = findRefBySelector(snapshot, '#select-input');
    const hoverRef = findRefBySelector(snapshot, '#hover-target');
    const focusRef = findRefBySelector(snapshot, '#focus-target');

    const clickAction = await apiPost('/action', { ref: `@${primaryRef}`, action: 'click' });
    expect(clickAction.status).toBe(200);

    const dblAction = await apiPost('/action', { ref: dblRef, action: 'dblclick' });
    expect(dblAction.status).toBe(200);

    const fillAction = await apiPost('/action', { ref: textRef, action: 'fill', value: 'seed' });
    expect(fillAction.status).toBe(200);

    const typeAction = await apiPost('/action', { ref: textRef, action: 'type', value: '-more' });
    expect(typeAction.status).toBe(200);

    const checkAction = await apiPost('/action', { ref: checkRef, action: 'check' });
    expect(checkAction.status).toBe(200);

    const checkedRes = await apiPost('/is/checked', { selector: '#check-input' });
    expect(checkedRes.status).toBe(200);
    expect(checkedRes.body.data.checked).toBe(true);

    const uncheckAction = await apiPost('/action', { ref: checkRef, action: 'uncheck' });
    expect(uncheckAction.status).toBe(200);

    const uncheckedRes = await apiPost('/is/checked', { selector: '#check-input' });
    expect(uncheckedRes.status).toBe(200);
    expect(uncheckedRes.body.data.checked).toBe(false);

    const selectAction = await apiPost('/action', { ref: selectRef, action: 'select', value: 'b' });
    expect(selectAction.status).toBe(200);

    const valueRes = await apiGet(`/get/value/${encodeURIComponent('#select-input')}`);
    expect(valueRes.status).toBe(200);
    expect(valueRes.body.data.value).toBe('b');

    const hoverAction = await apiPost('/action', { ref: hoverRef, action: 'hover' });
    expect(hoverAction.status).toBe(200);

    const focusAction = await apiPost('/action', { ref: focusRef, action: 'focus' });
    expect(focusAction.status).toBe(200);

    const statusRes = await apiGet(`/get/text/${encodeURIComponent('#status')}`);
    expect(statusRes.status).toBe(200);
    expect(['hovered', 'focused']).toContain(statusRes.body.data.text);

    const clickCountRes = await apiGet(`/get/text/${encodeURIComponent('#click-count')}`);
    expect(clickCountRes.status).toBe(200);
    expect(clickCountRes.body.data.text).toBe('1');

    const dblCountRes = await apiGet(`/get/text/${encodeURIComponent('#dbl-count')}`);
    expect(dblCountRes.status).toBe(200);
    expect(dblCountRes.body.data.text).toBe('1');

    const textValueRes = await apiGet(`/get/value/${encodeURIComponent('#text-input')}`);
    expect(textValueRes.status).toBe(200);
    expect(textValueRes.body.data.value).toBe('seed-more');

    const clearSnapshotRes = await apiDelete('/snapshot');
    expect(clearSnapshotRes.status).toBe(200);
    expect(clearSnapshotRes.body.success).toBe(true);

    const noSnapshotAction = await apiPost('/action', { ref: primaryRef, action: 'click' });
    expect(noSnapshotAction.status).toBe(400);
    expect(noSnapshotAction.body.error).toContain('No snapshot available');
  });

  it('verifies keyboard and mouse input APIs', async () => {
    const clickInputRes = await apiPost('/click', { selector: '#text-input' });
    expect(clickInputRes.status).toBe(200);

    const keyPressRes = await apiPost('/keyboard/press', { key: 'a' });
    expect(keyPressRes.status).toBe(200);

    const keyDownRes = await apiPost('/keyboard/down', { key: 'Shift' });
    expect(keyDownRes.status).toBe(200);

    const keyUpRes = await apiPost('/keyboard/up', { key: 'Shift' });
    expect(keyUpRes.status).toBe(200);

    const valueRes = await apiGet(`/get/value/${encodeURIComponent('#text-input')}`);
    expect(valueRes.status).toBe(200);
    expect(valueRes.body.data.value.length).toBeGreaterThan(0);

    const moveRes = await apiPost('/mouse/move', { x: 10, y: 10 });
    expect(moveRes.status).toBe(200);

    const downRes = await apiPost('/mouse/down', { button: 'left' });
    expect(downRes.status).toBe(200);

    const upRes = await apiPost('/mouse/up', { button: 'left' });
    expect(upRes.status).toBe(200);

    const wheelRes = await apiPost('/mouse/wheel', { deltaY: 220 });
    expect(wheelRes.status).toBe(200);
    expect(wheelRes.body.success).toBe(true);
  });

  it('verifies storage APIs', async () => {
    const localSetRes = await apiPost('/storage/local', { key: 'local-key', value: 'local-value' });
    expect(localSetRes.status).toBe(200);

    const localGetAllRes = await apiGet('/storage/local');
    expect(localGetAllRes.status).toBe(200);
    expect(localGetAllRes.body.data['local-key']).toBe('local-value');

    const localGetRes = await apiGet(`/storage/local/${encodeURIComponent('local-key')}`);
    expect(localGetRes.status).toBe(200);
    expect(localGetRes.body.data.value).toBe('local-value');

    const localDeleteRes = await apiDelete(`/storage/local/${encodeURIComponent('local-key')}`);
    expect(localDeleteRes.status).toBe(200);

    const localClearRes = await apiDelete('/storage/local');
    expect(localClearRes.status).toBe(200);

    const sessionSetRes = await apiPost('/storage/session', { key: 'session-key', value: 'session-value' });
    expect(sessionSetRes.status).toBe(200);

    const sessionGetAllRes = await apiGet('/storage/session');
    expect(sessionGetAllRes.status).toBe(200);
    expect(sessionGetAllRes.body.data['session-key']).toBe('session-value');

    const sessionGetRes = await apiGet(`/storage/session/${encodeURIComponent('session-key')}`);
    expect(sessionGetRes.status).toBe(200);
    expect(sessionGetRes.body.data.value).toBe('session-value');

    const sessionDeleteRes = await apiDelete(`/storage/session/${encodeURIComponent('session-key')}`);
    expect(sessionDeleteRes.status).toBe(200);

    const sessionClearRes = await apiDelete('/storage/session');
    expect(sessionClearRes.status).toBe(200);
  });

  it('verifies session and cookie APIs', async () => {
    const currentHarness = requireHarness();
    const evalCookieRes = await apiPost('/eval', { script: "document.cookie = 'from_eval=1; path=/'; true;" });
    expect(evalCookieRes.status).toBe(200);

    const cookiePostRes = await apiPost('/cookies', {
      url: currentHarness.baseUrl,
      name: 'from_api',
      value: '1',
      domain: currentHarness.host,
      path: '/',
      secure: false,
      httpOnly: false,
      sameSite: 'Lax',
    });
    expect(cookiePostRes.status).toBe(200);

    const cookiesRes = await apiGet('/cookies');
    expect(cookiesRes.status).toBe(200);
    const cookieNames = cookiesRes.body.data.map((cookie: { name: string }) => cookie.name);
    expect(cookieNames).toContain('from_eval');
    expect(cookieNames).toContain('from_api');

    const sessionRes = await apiGet('/session');
    expect(sessionRes.status).toBe(200);
    expect(sessionRes.body.data.cookiesCount).toBeGreaterThan(0);

    const clearCookiesRes = await apiDelete('/cookies');
    expect(clearCookiesRes.status).toBe(200);

    const cookiesAfterClear = await apiGet('/cookies');
    expect(cookiesAfterClear.status).toBe(200);
    expect(cookiesAfterClear.body.data.length).toBe(0);
  });

  it('verifies state save/load/info APIs', async () => {
    await apiPost('/storage/local', { key: 'state-local', value: 'L' });
    await apiPost('/storage/session', { key: 'state-session', value: 'S' });
    await apiPost('/eval', { script: "document.cookie = 'state-cookie=1; path=/'; true;" });

    const saveRes = await apiPost('/state/save');
    expect(saveRes.status).toBe(200);
    expect(saveRes.body.success).toBe(true);

    const savedState = saveRes.body.data;
    expect(savedState.localStorage['state-local']).toBe('L');
    expect(savedState.sessionStorage['state-session']).toBe('S');

    await apiDelete('/storage/local');
    await apiDelete('/storage/session');
    await apiDelete('/cookies');

    const loadRes = await apiPost('/state/load', { state: savedState, navigateToUrl: true });
    expect(loadRes.status).toBe(200);
    expect(loadRes.body.success).toBe(true);

    const localAfterLoad = await apiGet('/storage/local');
    expect(localAfterLoad.status).toBe(200);
    expect(localAfterLoad.body.data['state-local']).toBe('L');

    const sessionAfterLoad = await apiGet('/storage/session');
    expect(sessionAfterLoad.status).toBe(200);
    expect(sessionAfterLoad.body.data['state-session']).toBe('S');

    const cookieAfterLoad = await apiGet('/cookies');
    expect(cookieAfterLoad.status).toBe(200);
    const names = cookieAfterLoad.body.data.map((cookie: { name: string }) => cookie.name);
    expect(names).toContain('state-cookie');

    const infoRes = await apiGet('/state/info');
    expect(infoRes.status).toBe(200);
    expect(infoRes.body.data.localStorageCount).toBeGreaterThan(0);
    expect(infoRes.body.data.sessionStorageCount).toBeGreaterThan(0);
  });

  it('verifies PDF export APIs', async () => {
    const pdfInfoRes = await apiPost('/pdf/info', {
      timestamp: {
        enabled: true,
        position: 'footer',
        align: 'right',
      },
    });
    expect(pdfInfoRes.status).toBe(200);
    expect(pdfInfoRes.body.success).toBe(true);
    expect(pdfInfoRes.body.data.base64.length).toBeGreaterThan(200);

    const pdfRes = await apiPost('/pdf', {}).buffer(true).parse(binaryResponseParser);
    expect(pdfRes.status).toBe(200);
    expect(pdfRes.headers['content-type']).toContain('application/pdf');
    expect(Buffer.isBuffer(pdfRes.body)).toBe(true);
    expect(pdfRes.body.byteLength).toBeGreaterThan(200);
  });

  it('verifies debug APIs', async () => {
    const evalRes = await apiPost('/eval', { script: '1 + 2 + 3' });
    expect(evalRes.status).toBe(200);
    expect(evalRes.body.data.result).toBe(6);

    const highlightRes = await apiPost('/highlight', { selector: '#primary-btn' });
    expect(highlightRes.status).toBe(200);
    expect(highlightRes.body.data.selector).toBe('#primary-btn');

    addConsoleMessage('log', 'fixture-log');
    addPageError('fixture-error');

    const consoleRes = await apiGet('/console');
    expect(consoleRes.status).toBe(200);
    expect(consoleRes.body.data.some((item: { message: string }) => item.message === 'fixture-log')).toBe(true);

    const errorsRes = await apiGet('/errors');
    expect(errorsRes.status).toBe(200);
    expect(errorsRes.body.data.some((item: { message: string }) => item.message === 'fixture-error')).toBe(true);

    const clearConsoleRes = await apiDelete('/console');
    expect(clearConsoleRes.status).toBe(200);

    const clearErrorsRes = await apiDelete('/errors');
    expect(clearErrorsRes.status).toBe(200);
  });

  it('verifies system reset API', async () => {
    const currentHarness = requireHarness();
    const resetRes = await apiPost('/reset');
    expect(resetRes.status).toBe(200);
    expect(resetRes.body.success).toBe(true);

    const navigateRes = await apiPost('/navigate', { url: `${currentHarness.baseUrl}/app` });
    expect(navigateRes.status).toBe(200);

    const titleRes = await apiGet('/get/title');
    expect(titleRes.status).toBe(200);
    expect(titleRes.body.data.title).toBe('Offline Fixture');
  });

  it('verifies web-vnc token flow', async () => {
    const currentHarness = requireHarness();
    const issueRes = await apiPost('/web-vnc/token', { vncHost: 'localhost:39001' });
    expect(issueRes.status).toBe(200);
    expect(issueRes.body.success).toBe(true);
    expect(issueRes.body.data.token).toMatch(/^[0-9a-f]{64}$/);

    const token = issueRes.body.data.token as string;

    const redirectRes = await currentHarness.agent.get(`/web-vnc?token=${token}`).redirects(0);
    expect(redirectRes.status).toBe(302);
    expect(redirectRes.headers.location).toContain('localhost:39001');

    const passwordMatch = redirectRes.headers.location.match(/password=([^&]+)/);
    expect(passwordMatch).not.toBeNull();
    expect(passwordMatch![1]).toHaveLength(8);

    const consumedRes = await currentHarness.agent.get(`/web-vnc?token=${token}`);
    expect(consumedRes.status).toBe(401);

    const noTokenRes = await currentHarness.agent.get('/web-vnc');
    expect(noTokenRes.status).toBe(401);
  });
});
