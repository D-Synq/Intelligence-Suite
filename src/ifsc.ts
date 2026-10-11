export type IfscResult = {
  code: string;
  valid: boolean;
  bank?: string;
  branch?: string;
  city?: string;
  state?: string;
  upi?: boolean;
  neft?: boolean;
  imps?: boolean;
  rtgs?: boolean;
  error?: string;
};

export type BatchIfscStatus = 'Valid' | 'Invalid Format' | 'Invalid / Not Found' | 'Verification Failed';

export type BatchIfscRow = {
  rowIndex: number;
  originalRow: Record<string, unknown>;
  ifscCode: string;
  status: BatchIfscStatus;
  bank: string;
  branch: string;
  city: string;
  state: string;
};

const IFSC_REGEX = /^[A-Z]{4}0[A-Z0-9]{6}$/;
const API_BASE = 'https://ifsc.razorpay.com/';
const TIMEOUT_MS = 3000;
const CACHE_KEY = 'dsynq_ifsc_cache';
const BATCH_DELAY_MS = 350;
const CONCURRENCY = 8;

const memoryCache = new Map<string, IfscResult>();

let diskCacheLoaded = false;
let diskCache: Record<string, IfscResult> = {};
let saveTimeout: ReturnType<typeof setTimeout> | null = null;

function ensureDiskCacheLoaded(): void {
  if (diskCacheLoaded) return;
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    diskCache = raw ? (JSON.parse(raw) as Record<string, IfscResult>) : {};
  } catch {
    diskCache = {};
  }
  diskCacheLoaded = true;
  for (const [k, v] of Object.entries(diskCache)) {
    memoryCache.set(k, v);
  }
}

function scheduleSaveDiskCache(): void {
  if (saveTimeout) return;
  saveTimeout = setTimeout(() => {
    saveTimeout = null;
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify(diskCache));
    } catch {
      // LocalStorage quota may be reached; memoryCache continues to serve
    }
  }, 200);
}

function cacheGet(code: string): IfscResult | undefined {
  if (memoryCache.has(code)) return memoryCache.get(code);
  ensureDiskCacheLoaded();
  return memoryCache.get(code);
}

function cacheSet(result: IfscResult): void {
  memoryCache.set(result.code, result);
  ensureDiskCacheLoaded();
  diskCache[result.code] = result;
  scheduleSaveDiskCache();
}

export function normalizeIfsc(code: string): string {
  return code.trim().toUpperCase();
}

export function isValidIfscFormat(code: string): boolean {
  return IFSC_REGEX.test(normalizeIfsc(code));
}

export async function lookupIfsc(rawCode: string): Promise<IfscResult> {
  const code = normalizeIfsc(rawCode);
  if (!code) {
    return { code, valid: false, error: 'IFSC code is empty' };
  }
  if (!isValidIfscFormat(code)) {
    const result: IfscResult = { code, valid: false, error: 'Invalid format — must be 4 letters, 0, then 6 alphanumeric' };
    cacheSet(result);
    return result;
  }
  const cached = cacheGet(code);
  if (cached) return cached;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(`${API_BASE}${code}`, { signal: controller.signal });
    if (response.status === 404) {
      const result: IfscResult = { code, valid: false, error: 'IFSC code not found' };
      cacheSet(result);
      return result;
    }
    if (!response.ok) {
      const result: IfscResult = { code, valid: false, error: `Lookup failed (${response.status})` };
      cacheSet(result);
      return result;
    }
    const data = (await response.json()) as Record<string, unknown>;
    const result: IfscResult = {
      code,
      valid: true,
      bank: String(data.BANK ?? '').trim(),
      branch: String(data.BRANCH ?? '').trim(),
      city: String(data.CITY ?? '').trim(),
      state: String(data.STATE ?? '').trim(),
      upi: Boolean(data.UPI),
      neft: Boolean(data.NEFT),
      imps: Boolean(data.IMPS),
      rtgs: Boolean(data.RTGS),
    };
    cacheSet(result);
    return result;
  } catch (err) {
    const message = err instanceof DOMException && err.name === 'AbortError'
      ? 'Lookup timed out'
      : err instanceof Error ? err.message : 'Network error';
    return { code, valid: false, error: message };
  } finally {
    clearTimeout(timer);
  }
}

export async function batchValidateIfsc(
  codes: string[],
  onProgress?: (done: number, total: number) => void,
): Promise<Map<string, IfscResult>> {
  const unique = [...new Set(codes.map(normalizeIfsc).filter(Boolean))];
  const results = new Map<string, IfscResult>();
  let done = 0;

  for (let i = 0; i < unique.length; i += CONCURRENCY) {
    const chunk = unique.slice(i, i + CONCURRENCY);
    const settled = await Promise.all(chunk.map((code) => lookupIfsc(code)));
    for (const result of settled) {
      results.set(result.code, result);
      done++;
      onProgress?.(done, unique.length);
    }
    if (i + CONCURRENCY < unique.length) {
      await new Promise((resolve) => setTimeout(resolve, BATCH_DELAY_MS));
    }
  }
  return results;
}

export const IFSC_HEADER_ALIASES = ['ifsc', 'ifsc code', 'ifsc_code', 'bank ifsc', 'branch ifsc'];

export function detectIfscColumn(headers: string[]): string | null {
  const normalized = headers.map((h) => h.trim().toLowerCase());
  for (const alias of IFSC_HEADER_ALIASES) {
    const match = normalized.findIndex((h) => h === alias);
    if (match !== -1) return headers[match];
  }
  for (const alias of IFSC_HEADER_ALIASES) {
    const match = normalized.findIndex((h) => h.includes(alias));
    if (match !== -1) return headers[match];
  }
  return null;
}

export function ifscStatusFromResult(result: IfscResult): BatchIfscStatus {
  if (result.valid) return 'Valid';
  if (result.error === 'Invalid format — must be 4 letters, 0, then 6 alphanumeric') return 'Invalid Format';
  if (result.error === 'IFSC code not found') return 'Invalid / Not Found';
  return 'Verification Failed';
}
