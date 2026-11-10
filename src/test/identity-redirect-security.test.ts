import { createServer, type Server, type IncomingHttpHeaders } from 'node:http';
import { chromium } from 'playwright';
import { describe, expect, it } from 'vitest';
import { deriveBrowserIdentity } from '../browser/identity.js';
import { configureIdentityContext, launchIdentityChromium } from '../browser/identity-browser.js';

const ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/156.0.0.0 Safari/537.36';
async function listen(server: Server): Promise<string> {
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  return `http://127.0.0.1:${(server.address() as {port:number}).port}`;
}
async function close(server: Server) { await new Promise<void>(resolve => server.close(() => resolve())); }

describe.skipIf(!process.env.FUBA_BROWSER_EXECUTABLE_PATH)('identity redirect credential isolation', () => {
  const cases: [boolean,number][] = [301,302,303,307,308].flatMap(status => [[false,status],[true,status]] as [boolean,number][]);
  it.each(cases)('does not replay Authorization across origins (normalization=%s, status=%i)', async (normalize,status) => {
    const observed: {path:string;headers:IncomingHttpHeaders}[] = [];
    const destination = createServer((req,res) => {
      observed.push({path:'destination',headers:req.headers});
      res.setHeader('Access-Control-Allow-Origin','*');
      res.end('ok');
    });
    const destinationUrl = await listen(destination);
    const source = createServer((req,res) => {
      observed.push({path:req.url || '',headers:req.headers});
      if (req.url === '/same') {res.writeHead(302,{Location:'/redirect'});res.end();}
      else if (req.url === '/redirect') {res.writeHead(status,{Location:destinationUrl+'/destination'});res.end();}
      else {res.setHeader('Content-Type','text/html');res.end('<html>redirect test</html>');}
    });
    const sourceUrl = await listen(source);
    const options = {executablePath:process.env.FUBA_BROWSER_EXECUTABLE_PATH,headless:true,args:['--no-sandbox']};
    const launched = normalize
      ? await launchIdentityChromium(options, () => deriveBrowserIdentity(ua))
      : {browser:await chromium.launch(options),identity:deriveBrowserIdentity(ua),bridge:undefined};
    try {
      const context = await launched.browser.newContext({userAgent:ua});
      if (normalize) await configureIdentityContext(context, launched.identity);
      const page = await context.newPage();
      await launched.bridge?.ready(page);
      await page.goto(sourceUrl);
      expect(await page.evaluate(async () => (await fetch('/same',{headers:{Authorization:'Bearer synthetic-redirect-test'}})).text())).toBe('ok');
      expect(observed.find(value => value.path === '/same')?.headers.authorization).toBe('Bearer synthetic-redirect-test');
      expect(observed.find(value => value.path === '/redirect')?.headers.authorization).toBe('Bearer synthetic-redirect-test');
      const final = observed.find(value => value.path === 'destination');
      expect(final).toBeDefined();
      expect(final?.headers.authorization).toBeUndefined();
      await context.close();
    } finally {await launched.browser.close();await close(source);await close(destination);}
  },30000);
});
