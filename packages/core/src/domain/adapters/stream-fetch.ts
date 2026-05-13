/** Shared fetch + SSE helpers for cloud LLM adapters. */

const DEFAULT_STREAM_TIMEOUT_MS = 30_000;
const MAX_429_RETRIES = 4;

export function defaultStreamTimeoutMs(): number {
  return DEFAULT_STREAM_TIMEOUT_MS;
}

/** User abort + wall-clock timeout (default 30s). */
export function combineTimeoutSignal(userSignal: AbortSignal | undefined, timeoutMs: number): AbortSignal {
  const ms = Math.max(1000, timeoutMs);
  const ctrl = new AbortController();
  const timer = setTimeout(() => {
    ctrl.abort(new DOMException(`Request timed out after ${ms}ms`, 'TimeoutError'));
  }, ms);

  const clear = () => clearTimeout(timer);

  if (userSignal) {
    if (userSignal.aborted) {
      clear();
      ctrl.abort(userSignal.reason);
      return ctrl.signal;
    }
    userSignal.addEventListener(
      'abort',
      () => {
        clear();
        ctrl.abort(userSignal.reason);
      },
      { once: true },
    );
  }

  ctrl.signal.addEventListener('abort', clear, { once: true });
  return ctrl.signal;
}

export function parseRetryAfterSeconds(header: string | null, fallbackSec = 5): number {
  if (!header) return fallbackSec;
  const n = parseInt(header.trim(), 10);
  if (!Number.isNaN(n) && n >= 0) return Math.min(Math.max(n, 1), 120);
  const when = Date.parse(header);
  if (!Number.isNaN(when)) {
    const sec = Math.ceil((when - Date.now()) / 1000);
    return Math.min(Math.max(sec, 1), 120);
  }
  return fallbackSec;
}

export function sleepMs(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function formatNetworkError(err: unknown): string {
  if (err instanceof DOMException && err.name === 'TimeoutError') return err.message;
  if (err instanceof Error) return err.message;
  return 'Network error';
}

export async function fetchWith429Retry(
  url: string,
  init: RequestInit,
  onRatePauseMessage: (text: string) => void,
  options?: { max429Rounds?: number },
): Promise<Response> {
  const maxRounds = options?.max429Rounds ?? MAX_429_RETRIES;

  for (let round = 0; round < maxRounds; round++) {
    const res = await fetch(url, init);

    if (res.status === 429) {
      if (round < maxRounds - 1) {
        const sec = parseRetryAfterSeconds(res.headers.get('Retry-After'));
        res.body?.cancel().catch(() => {});
        onRatePauseMessage(`\n\nRate limited — retry in ${sec}s\n\n`);
        await sleepMs(sec * 1000);
        continue;
      }
      return res;
    }

    return res;
  }

  throw new Error('fetchWith429Retry: unreachable');
}
