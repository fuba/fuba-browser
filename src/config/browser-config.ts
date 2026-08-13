// Browser configuration from environment variables

export interface ProxyConfig {
  server: string;    // e.g. "http://localhost:13128"
  bypass?: string;   // e.g. "localhost,127.0.0.1"
}

/** Selects whether Chromium should request a hardware Vulkan renderer. */
export type GpuMode = 'off' | 'auto' | 'nvidia' | 'amd';

const GPU_LAUNCH_ARGS = [
  '--use-gl=angle',
  '--use-angle=vulkan',
  '--enable-features=Vulkan',
  '--disable-gpu-blocklist',
  '--enable-unsafe-webgpu',
] as const;

const SOFTWARE_RENDERER_MARKERS = [
  'swiftshader',
  'llvmpipe',
  'softpipe',
  'software rasterizer',
  'software renderer',
  'microsoft basic render',
] as const;

export interface BrowserConfig {
  headless: boolean;
  deviceScaleFactor: number;
  locale: string;
  timezoneId: string;
  viewportWidth: number;
  viewportHeight: number;
  proxy?: ProxyConfig;
  deviceProfile?: string;
  gpuMode: GpuMode;
}

function parseGpuMode(value: string | undefined): GpuMode {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) {
    return 'off';
  }
  if (normalized === 'auto' || normalized === 'nvidia' || normalized === 'amd' || normalized === 'off') {
    return normalized;
  }
  throw new Error(`Unsupported FUBA_GPU_MODE '${value}'. Use off, auto, nvidia, or amd.`);
}

/** Return Chromium flags only when a hardware renderer was explicitly requested. */
export function getGpuLaunchArgs(mode: GpuMode): string[] {
  return mode === 'off' ? [] : [...GPU_LAUNCH_ARGS];
}

/** Detect software fallbacks that must not silently be used for a hardware mode. */
export function isHardwareRenderer(renderer: string): boolean {
  const normalized = renderer.trim().toLowerCase();
  return normalized.length > 0 && !SOFTWARE_RENDERER_MARKERS.some(marker => normalized.includes(marker));
}

function rendererVendor(renderer: string): 'nvidia' | 'amd' | 'unknown' {
  const normalized = renderer.toLowerCase();
  if (normalized.includes('nvidia') || normalized.includes('geforce') || normalized.includes('quadro')) {
    return 'nvidia';
  }
  if (normalized.includes('amd') || normalized.includes('radeon') || normalized.includes('ati')) {
    return 'amd';
  }
  return 'unknown';
}

/** Check the renderer against the requested mode before serving requests. */
export function isGpuRendererCompatible(mode: GpuMode, renderer: string): boolean {
  if (mode === 'off') {
    return true;
  }
  if (!isHardwareRenderer(renderer)) {
    return false;
  }
  const vendor = rendererVendor(renderer);
  return mode === 'auto' ? vendor === 'nvidia' || vendor === 'amd' : vendor === mode;
}

export function getBrowserConfig(): BrowserConfig {
  const headless = process.env.HEADLESS !== 'false';
  const deviceScaleFactor = Number(process.env.DEVICE_SCALE_FACTOR) || 2;
  const locale = process.env.LOCALE || 'ja-JP';
  const timezoneId = process.env.TIMEZONE_ID || 'Asia/Tokyo';
  const viewportWidth = Number(process.env.VIEWPORT_WIDTH) || 1200;
  const viewportHeight = Number(process.env.VIEWPORT_HEIGHT) || 2000;

  const proxyServer = process.env.PROXY_SERVER;
  const proxy: ProxyConfig | undefined = proxyServer
    ? { server: proxyServer, bypass: process.env.PROXY_BYPASS || '' }
    : undefined;

  const deviceProfile = process.env.DEVICE_PROFILE || undefined;
  const gpuMode = parseGpuMode(process.env.FUBA_GPU_MODE);

  return { headless, deviceScaleFactor, locale, timezoneId, viewportWidth, viewportHeight, proxy, deviceProfile, gpuMode };
}
