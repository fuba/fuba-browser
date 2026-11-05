import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type Browser } from 'playwright';
import { createServer, type Server } from 'node:http';
import { deriveBrowserIdentity } from '../browser/identity.js';
import { launchIdentityChromium, configureIdentityContext } from '../browser/identity-browser.js';

const ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/156.0.0.0 Safari/537.36';
const enabled = !!process.env.FUBA_BROWSER_EXECUTABLE_PATH;
describe.skipIf(!enabled)('real Chromium UA identity', () => {
  let browser: Browser;
  let server: Server;
  let origin: string;
  const headers: Record<string, string | string[] | undefined>[] = [];
  beforeAll(async () => {
    server = createServer((req, res) => {
      headers.push(req.headers);
      res.setHeader('Accept-CH', 'Sec-CH-UA-Full-Version-List, Sec-CH-UA-Platform-Version');
      res.setHeader('Content-Type', req.url?.endsWith('.js') ? 'application/javascript' : 'text/html');

      return res.end(req.url === '/worker.js' ? 'postMessage({ua:navigator.userAgent,platform:navigator.platform,data:navigator.userAgentData?.toJSON(),hints:"userAgentData" in navigator})' : '<html><script>globalThis.firstIdentity={ua:navigator.userAgent,platform:navigator.platform,vendor:navigator.vendor}</script><body>identity</body></html>');
    });
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    origin = `http://127.0.0.1:${(server.address() as {port: number}).port}`;
  });
  afterAll(async () => { await browser?.close(); await new Promise<void>(resolve => server?.close(() => resolve())); });
  it('applies the same native identity to documents, popups and workers', async () => {
    const launched = await launchIdentityChromium({executablePath:process.env.FUBA_BROWSER_EXECUTABLE_PATH,headless:true,args:['--no-sandbox']}, () => deriveBrowserIdentity(ua));
    browser = launched.browser;
    const {bridge} = launched;
    const context = await browser.newContext({ userAgent: ua });
    await configureIdentityContext(context, launched.identity);
    await context.setExtraHTTPHeaders({Authorization:'Bearer identity-test'});
    await context.addCookies([{name:'identity-test',value:'preserved',url:origin}]);
    const page = await context.newPage();
    await bridge.ready(page);
    await page.goto(origin);
    const identity = await page.evaluate(async () => ({ ua: navigator.userAgent, platform: navigator.platform, data: await (navigator as Navigator & {userAgentData: {getHighEntropyValues(keys: string[]): Promise<{fullVersionList: {brand:string;version:string}[]}>}}).userAgentData.getHighEntropyValues(['fullVersionList', 'platformVersion']) }));
    expect(identity).toMatchObject({ ua, platform: 'Win32', data: { platform: 'Windows', platformVersion: '10.0.0' } });
    expect(identity.data.fullVersionList).toContainEqual({brand:'Google Chrome',version:'156.0.0.0'});
    expect(headers[0]['user-agent']).toBe(ua);
    expect(headers[0]['authorization']).toBe('Bearer identity-test');
    expect(headers[0]['cookie']).toContain('identity-test=preserved');
    expect(headers[0]['sec-ch-ua']).toContain('Google Chrome');
    const worker = await page.evaluate(() => new Promise(resolve => {const w = new Worker('/worker.js'); w.onmessage = e => {w.terminate(); resolve(e.data);};}));
    expect(worker).toMatchObject({ua, platform:'Win32', data: {platform:'Windows'}});
    const popupPromise = context.waitForEvent('page');
    await page.evaluate(url => window.open(url), origin);
    const popup = await popupPromise;
    await popup.waitForURL(origin + '/');
    await popup.waitForLoadState();
    expect(await popup.evaluate(() => ({ua:navigator.userAgent, platform:navigator.platform}))).toEqual({ua,platform:'Win32'});
    expect(await popup.evaluate('firstIdentity')).toMatchObject({ua,platform:'Win32',vendor:'Google Inc.'});
    const popupHints = await popup.evaluate("navigator.userAgentData.getHighEntropyValues(['fullVersionList'])") as {fullVersionList:{brand:string;version:string}[]};
    expect(popupHints.fullVersionList).toContainEqual({brand:'Google Chrome',version:'156.0.0.0'});
    expect(headers.at(-1)?.['sec-ch-ua']).toContain('Google Chrome');
    expect(headers.at(-1)?.['sec-ch-ua-full-version-list']).toContain('156.0.0.0');
    await context.close();
  }, 30000);
  it.each([
    ['Linux Chrome', 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0.0.0 Safari/537.36'],
    ['macOS Chrome', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0.0.0 Safari/537.36'],
    ['Android Chrome', 'Mozilla/5.0 (Linux; Android 14; Pixel 8 Build/ABC) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0.0.0 Mobile Safari/537.36'],
    ['iOS Safari', 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1'],
    ['Firefox', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:140.0) Gecko/20100101 Firefox/140.0'],
    ['Edge', ua + ' Edg/156.0.0.0'],
  ])('changes headers, hints and JS together for %s', async (_name, input) => {
    await browser?.close();
    headers.length = 0;
    const identity = deriveBrowserIdentity(input);
    const launched = await launchIdentityChromium({executablePath:process.env.FUBA_BROWSER_EXECUTABLE_PATH,headless:true,args:['--no-sandbox']}, () => identity);
    browser = launched.browser;
    const {bridge} = launched;
    const context = await browser.newContext({userAgent:input,isMobile:identity.isMobile,hasTouch:identity.hasTouch});
    await configureIdentityContext(context, identity);
    const page = await context.newPage();
    await bridge.ready(page);
    await page.goto(origin);
    const result = await page.evaluate(() => ({ua:navigator.userAgent,platform:navigator.platform,vendor:navigator.vendor,hints:'userAgentData' in navigator,touch:navigator.maxTouchPoints}));
    expect(result).toMatchObject({ua:input,platform:identity.platform,vendor:identity.vendor,hints:!!identity.metadata});
    expect(await page.evaluate('firstIdentity')).toEqual({ua:input,platform:identity.platform,vendor:identity.vendor});
    expect(result.touch > 0).toBe(identity.hasTouch);
    expect(headers[0]['user-agent']).toBe(input);
    if (identity.metadata) expect(headers[0]['sec-ch-ua-platform']).toBe(JSON.stringify(identity.metadata.platform));
    else expect(headers[0]['sec-ch-ua']).toBeUndefined();
    const worker = await page.evaluate(() => new Promise(resolve => {const w = new Worker('/worker.js'); w.onmessage = e => {w.terminate(); resolve(e.data);};}));
    expect(worker).toMatchObject({ua:input,platform:identity.platform,hints:!!identity.metadata});
    await context.close();
  }, 30000);
});
