export interface UserAgentMetadata {
  brands: { brand: string; version: string }[];
  fullVersionList: { brand: string; version: string }[];
  fullVersion: string;
  platform: string;
  platformVersion: string;
  architecture: string;
  model: string;
  mobile: boolean;
  bitness: string;
  wow64: boolean;
}

export interface BrowserIdentity {
  userAgent: string;
  platform: string;
  vendor: string;
  isMobile: boolean;
  hasTouch: boolean;
  metadata?: UserAgentMetadata;
}

/** Derive advertised identity from the literal UA, never from the host OS. */
export function deriveBrowserIdentity(userAgent: string): BrowserIdentity {
  if (typeof userAgent !== 'string' || userAgent.length === 0 || userAgent.length > 2048 || /[^\x20-\x7e]/.test(userAgent)) {
    throw new Error('userAgent must be a nonempty printable ASCII string (maximum 2048 characters)');
  }
  const ios = /iPhone|iPad|iPod/.test(userAgent);
  const android = /Android/.test(userAgent);
  const windowsPhone = /Windows Phone/.test(userAgent);
  const blackberry = /BB10|PlayBook/.test(userAgent);
  const meego = /MeeGo/.test(userAgent);
  const silk = /Silk\//.test(userAgent);
  const legacyMobile = windowsPhone || blackberry || meego || silk;
  const mobile = ios || android || legacyMobile;
  let platform: string;
  let os: string;
  let version: string;
  if (windowsPhone) {
    platform = 'Win32'; os = 'Windows Phone';
    version = userAgent.match(/Windows Phone ([\d.]+)/)?.[1] || '';
  } else if (blackberry) {
    platform = /PlayBook/.test(userAgent) ? 'PlayBook' : 'BlackBerry';
    os = /PlayBook/.test(userAgent) ? 'RIM Tablet OS' : 'BlackBerry';
    version = userAgent.match(/RIM Tablet OS ([\d.]+)/)?.[1] || '';
  } else if (meego || silk) {
    // Legacy descriptors lack CPU detail; retain a deterministic mobile platform.
    platform = 'Linux armv7l'; os = meego ? 'MeeGo' : 'Android'; version = '';
  } else if (ios) {
    platform = /iPad/.test(userAgent) ? 'iPad' : /iPod/.test(userAgent) ? 'iPod' : 'iPhone';
    os = 'iOS';
    version = userAgent.match(/OS ([\d_]+)/)?.[1]?.replaceAll('_', '.') || '';
  } else if (android) {
    platform = /aarch64|arm64/.test(userAgent) ? 'Linux aarch64' : 'Linux armv8l';
    os = 'Android';
    version = userAgent.match(/Android ([\d.]+)/)?.[1] || '';
  } else if (/Windows NT/.test(userAgent)) {
    platform = 'Win32'; os = 'Windows';
    version = userAgent.match(/Windows NT ([\d.]+)/)?.[1] || '';
  } else if (/Macintosh/.test(userAgent)) {
    platform = 'MacIntel'; os = 'macOS';
    version = userAgent.match(/Mac OS X ([\d_]+)/)?.[1]?.replaceAll('_', '.') || '';
  } else if (/CrOS/.test(userAgent)) {
    platform = /aarch64|arm/.test(userAgent) ? 'Linux aarch64' : 'Linux x86_64';
    os = 'Chrome OS'; version = userAgent.match(/CrOS \S+ ([\d.]+)/)?.[1] || '';
  } else if (/Linux|X11/.test(userAgent)) {
    platform = /aarch64|arm/.test(userAgent) ? 'Linux aarch64' : /i[3-6]86/.test(userAgent) ? 'Linux i686' : 'Linux x86_64';
    os = 'Linux'; version = '';
  } else {
    throw new Error('Unsupported UA operating system');
  }
  // Windows Phone embeds Android/Chrome compatibility tokens, not a Chromium identity.
  const chrome = !ios && !legacyMobile && userAgent.match(/(?:Chrome|Chromium)\/(\d+\.\d+\.\d+\.\d+)/);
  const firefox = /Firefox\//.test(userAgent);
  const safari = /Version\/[\d.]+.*Safari\//.test(userAgent);
  const legacyBrowser = (blackberry && safari) || (meego && /NokiaBrowser\//.test(userAgent)) || silk || (windowsPhone && /IEMobile\/|Edge\//.test(userAgent));
  if (!chrome && !firefox && !safari && !legacyBrowser && !/CriOS\/|FxiOS\//.test(userAgent)) {
    throw new Error('Unsupported UA browser: expected Chrome, Chromium, Edge, Firefox or Safari');
  }
  const identity: BrowserIdentity = {
    userAgent, platform,
    vendor: legacyMobile || firefox || /FxiOS\//.test(userAgent) ? '' : chrome ? 'Google Inc.' : 'Apple Computer, Inc.',
    isMobile: mobile, hasTouch: mobile,
  };
  if (chrome) {
    const fullVersion = chrome[1];
    const edge = userAgent.match(/Edg(?:A)?\/(\d+\.\d+\.\d+\.\d+)/);
    const fullVersionList = [{ brand: 'Not_A Brand', version: '99.0.0.0' }, { brand: 'Chromium', version: fullVersion }];
    if (edge) fullVersionList.push({ brand: 'Microsoft Edge', version: edge[1] });
    else if (/Chrome\//.test(userAgent)) fullVersionList.push({ brand: 'Google Chrome', version: fullVersion });
    const arm = android || /aarch64|arm64|ARM/.test(userAgent);
    const bits = /WOW64|Win64|x64|x86_64|aarch64|arm64/.test(userAgent) ? '64' : android ? '' : os === 'macOS' ? '64' : '32';
    const model = android ? userAgent.match(/Android [^;)]+;\s*(?:[a-z]{2}(?:[-_][A-Z]{2})?;\s*)?([^;)]+?)(?: Build\/[^;)]+)?\)/)?.[1]?.trim() || '' : '';
    identity.metadata = {
      brands: fullVersionList.map(({ brand, version: v }) => ({ brand, version: v.split('.')[0] })),
      fullVersionList, fullVersion, platform: os,
      // Reduced UAs cannot reveal a more precise OS version; do not invent one.
      platformVersion: version ? [...version.split('.'), '0', '0'].slice(0, 3).join('.') : '',
      architecture: arm ? 'arm' : 'x86', bitness: bits, model,
      mobile: /Mobile/.test(userAgent), wow64: /WOW64/.test(userAgent),
    };
  }
  return identity;
}
