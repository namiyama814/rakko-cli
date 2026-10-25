export class RakkoError extends Error {}
export interface HttpOptions {
  fetch?: typeof fetch; timeoutMs?: number; sleep?: (ms: number) => Promise<void>;
}
export async function getText(url: string, options: HttpOptions = {}): Promise<string> {
  const request = options.fetch ?? fetch;
  const sleep = options.sleep ?? ((ms) => new Promise(resolve => setTimeout(resolve, ms)));
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await request(url, {
        signal: AbortSignal.timeout(options.timeoutMs ?? 15000), redirect: 'error',
        headers: { 'User-Agent': 'rakko-cli/0.1.0', Accept: 'application/json, text/html' },
      });
      if (response.status === 429 || [500, 502, 503, 504].includes(response.status)) {
        if (attempt < 2) {
          const retry = response.headers.get('retry-after');
          const seconds = retry && /^\d+$/.test(retry) ? Number(retry) : retry ? (Date.parse(retry) - Date.now()) / 1000 : NaN;
          await response.body?.cancel();
          await sleep(Number.isFinite(seconds) ? Math.min(30000, Math.max(0, seconds * 1000)) : 500 * 2 ** attempt);
          continue;
        }
      }
      if (!response.ok) throw new RakkoError(`HTTP ${response.status}: ${url}`);
      return await response.text();
    } catch (error) {
      if (error instanceof RakkoError) throw error;
      const name = error instanceof Error ? error.name : '';
      throw new RakkoError(name === 'TimeoutError' || name === 'AbortError'
        ? `通信がタイムアウトしました: ${url}` : `通信に失敗しました: ${url}`);
    }
  }
  throw new RakkoError('通信に失敗しました');
}
