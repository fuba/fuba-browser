import type { BrowserIdentity } from './identity.js';

/** Normalize only identity fields on one CDP Fetch request, never a redirect chain. */
export function identityHeaders(headers: Record<string,string>, identity: BrowserIdentity): {name:string;value:string}[] {
  const metadata = identity.metadata;
  const brands = (values: {brand:string;version:string}[]) => values.map(value => `${JSON.stringify(value.brand)};v=${JSON.stringify(value.version)}`).join(', ');
  const hints: Record<string,string> = metadata ? {
    'sec-ch-ua': brands(metadata.brands),
    'sec-ch-ua-full-version-list': brands(metadata.fullVersionList),
    'sec-ch-ua-full-version': JSON.stringify(metadata.fullVersion),
    'sec-ch-ua-platform': JSON.stringify(metadata.platform),
    'sec-ch-ua-platform-version': JSON.stringify(metadata.platformVersion),
    'sec-ch-ua-mobile': metadata.mobile ? '?1' : '?0',
    'sec-ch-ua-arch': JSON.stringify(metadata.architecture),
    'sec-ch-ua-bitness': JSON.stringify(metadata.bitness),
    'sec-ch-ua-model': JSON.stringify(metadata.model),
    'sec-ch-ua-wow64': metadata.wow64 ? '?1' : '?0',
    'sec-ch-ua-form-factors': JSON.stringify(identity.isMobile ? metadata.mobile ? 'Mobile' : 'Tablet' : 'Desktop'),
  } : {};
  const result: {name:string;value:string}[] = [];
  for (const [name,value] of Object.entries(headers)) {
    const lower = name.toLowerCase();
    if (lower === 'user-agent') result.push({name,value:identity.userAgent});
    else if (lower === 'sec-ch-ua' || lower.startsWith('sec-ch-ua-')) {
      if (lower in hints) result.push({name,value:hints[lower]});
    } else result.push({name,value});
  }
  return result;
}
