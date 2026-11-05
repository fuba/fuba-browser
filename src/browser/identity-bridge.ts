import { createServer } from 'node:net';
import type { Page } from 'playwright';
import type { BrowserIdentity } from './identity.js';
import { applyIdentity } from './identity-script.js';

/** Reserve an ephemeral loopback port; Chromium binds it immediately after launch. */
export async function reserveDebugPort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const port = (server.address() as { port: number }).port;
  await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  return port;
}

// Shared/service workers have different startup lifecycles and are deliberately
// excluded. Do not claim identity consistency for these targets.
const autoAttach = {
  autoAttach: true, waitForDebuggerOnStart: true, flatten: true,
  filter: [{type:'page'}, {type:'iframe'}, {type:'worker'}, {exclude:true}],
};

/** Configure page/frame and dedicated-worker identities using a separate CDP session. */
export async function connectIdentityBridge(port: number, identity: BrowserIdentity, onFailure: (error: Error) => void = () => {}) {
  const response = await fetch(`http://127.0.0.1:${port}/json/version`, { signal: AbortSignal.timeout(5000) });
  if (!response.ok) throw new Error(`Chromium debugging endpoint returned ${response.status}`);
  const { webSocketDebuggerUrl } = await response.json() as {webSocketDebuggerUrl: string};
  const endpoint = new URL(webSocketDebuggerUrl);
  if (endpoint.hostname !== '127.0.0.1' || endpoint.port !== String(port) || endpoint.protocol !== 'ws:') {
    throw new Error('Refusing non-loopback Chromium debugging endpoint');
  }
  const socket = new WebSocket(endpoint);
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => { socket.close(); reject(new Error('Identity CDP connection timed out')); }, 5000);
    socket.addEventListener('open', () => { clearTimeout(timer); resolve(); }, { once: true });
    socket.addEventListener('error', () => { clearTimeout(timer); reject(new Error('Identity CDP connection failed')); }, { once: true });
  });
  let nextId = 0;
  let closing = false;
  let failure: Error | undefined;
  const pending = new Map<number, {resolve: (value: unknown) => void; reject: (error: Error) => void; method: string; timer: ReturnType<typeof setTimeout>}>();
  const targets = new Map<string, Promise<void>>();
  const sessions = new Map<string, string>();
  function send(method: string, params: object = {}, sessionId?: string): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const id = ++nextId;
      const timer = setTimeout(() => { pending.delete(id); reject(new Error(`Identity CDP timed out: ${method}`)); }, 5000);
      pending.set(id, {resolve, reject, timer, method});
      socket.send(JSON.stringify({ id, method, params, ...(sessionId ? {sessionId} : {}) }));
    });
  }
  async function initialize(sessionId: string, targetInfo: {type: string; targetId: string}) {
    await send('Network.setUserAgentOverride', {
      userAgent: identity.userAgent, platform: identity.platform,
      ...(identity.metadata ? {userAgentMetadata: identity.metadata} : {}),
    }, sessionId);
    if (targetInfo.type === 'worker') {
      const expression = `(${applyIdentity.toString()})(${JSON.stringify(identity)})`;
      const result = await send('Runtime.evaluate', {expression}, sessionId) as {exceptionDetails?: unknown};
      if (result.exceptionDetails) throw new Error('Dedicated worker identity script failed');
    }
    await send('Target.setAutoAttach', autoAttach, sessionId);
    await send('Runtime.runIfWaitingForDebugger', {}, sessionId);
  }
  socket.addEventListener('message', event => {
    const message = JSON.parse(String(event.data));
    if (message.id) {
      const request = pending.get(message.id);
      if (!request) return;
      clearTimeout(request.timer); pending.delete(message.id);
      if (message.error) request.reject(new Error(`${request.method}: ${message.error.message}`)); else request.resolve(message.result);
    } else if (message.method === 'Target.attachedToTarget') {
      const {sessionId, targetInfo} = message.params;
      const task = initialize(sessionId, targetInfo);
      sessions.set(sessionId, targetInfo.targetId);
      targets.set(targetInfo.targetId, task);
      void task.catch(async error => {
        // Closing a target during initialization is not an identity failure.
        if (closing || /Session with given id not found|Target closed|No target with given id/.test(String(error))) return;
        failure = error;
        console.error('[Identity] Target initialization failed:', error);
        onFailure(error);
        await send('Target.closeTarget', {targetId: targetInfo.targetId}).catch(() => {});
      });
    } else if (message.method === 'Target.detachedFromTarget') {
      const targetId = sessions.get(message.params.sessionId);
      if (targetId) targets.delete(targetId);
      sessions.delete(message.params.sessionId);
    }
  });
  socket.addEventListener('close', () => {
    if (!closing) onFailure(new Error('Identity CDP connection unexpectedly closed'));
    for (const request of pending.values()) { clearTimeout(request.timer); request.reject(new Error('Identity CDP connection closed')); }
    pending.clear();
  });
  try { await send('Target.setAutoAttach', autoAttach); }
  catch (error) { closing = true; socket.close(); throw error; }
  return {
    close: () => { closing = true; socket.close(); },
    async ready(page: Page) {
      if (failure) throw failure;
      const session = await page.context().newCDPSession(page);
      try {
        const { targetInfo } = await session.send('Target.getTargetInfo');
        const initialized = targets.get(targetInfo.targetId);
        if (!initialized) throw new Error('Page was not intercepted by identity bridge');
        await initialized;
      } finally { await session.detach().catch(() => {}); }
    },
  };
}
