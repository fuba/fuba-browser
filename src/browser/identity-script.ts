import type { BrowserIdentity } from './identity.js';

/** This self-contained function is serialized into each supported JS realm. */
export function applyIdentity(identity: BrowserIdentity): void {
  const prototype = Object.getPrototypeOf(navigator);
  Object.defineProperty(prototype, 'platform', {configurable:true, get:() => identity.platform});
  if ('vendor' in navigator) Object.defineProperty(prototype, 'vendor', {configurable:true, get:() => identity.vendor});
  if (!identity.metadata) {delete prototype.userAgentData; return;}
  const data = (navigator as Navigator & {userAgentData?: {
    getHighEntropyValues(hints: string[]): Promise<Record<string, unknown>>;
  }}).userAgentData;
  if (!data) return;
  const metadata = identity.metadata;
  const low = () => ({brands:metadata.brands.map(value => ({...value})), mobile:metadata.mobile, platform:metadata.platform});
  const high: Record<string, unknown> = {
    ...metadata, uaFullVersion:metadata.fullVersion,
    formFactors:[identity.isMobile ? metadata.mobile ? 'Mobile' : 'Tablet' : 'Desktop'],
  };
  const dataPrototype = Object.getPrototypeOf(data);
  const original = data.getHighEntropyValues;
  for (const key of ['brands','mobile','platform'] as const) {
    Object.defineProperty(dataPrototype,key,{configurable:true,get:() => low()[key]});
  }
  Object.defineProperty(dataPrototype,'toJSON',{configurable:true,writable:true,value:low});
  Object.defineProperty(dataPrototype,'getHighEntropyValues',{configurable:true,writable:true,value:async function(this: typeof data, hints: string[]) {
    // Let Chromium enforce argument validation and permission-policy restrictions.
    const result = await original.call(this, hints);
    for (const key of Object.keys(result)) if (key in high) result[key] = structuredClone(high[key]);
    return result;
  }});
}
