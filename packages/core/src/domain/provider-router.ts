/**
 * Provider Router — multi-provider failover and model routing.
 * 
 * Primary → Fallback chain. Auto-switches on:
 * - 429 (rate limit)
 * - 5xx (server error)
 * - Network failures
 * 
 * @see Knowledge Base: Wave 5.2 — Mid-stream failure recovery
 */

import type { StreamAdapter, StreamRequest } from './stream-provider.js';
import type { StreamChunk } from '../types/stream.js';

export interface ProviderRoute {
  provider: string;
  adapter: StreamAdapter;
  apiKey: string;
}

export interface RouterConfig {
  routes: ProviderRoute[];
  maxRetries?: number;
  onFailover?: (from: string, to: string, reason: string) => void;
}

export class ProviderRouter {
  private routes: ProviderRoute[];
  private maxRetries: number;
  private onFailover?: (from: string, to: string, reason: string) => void;

  constructor(config: RouterConfig) {
    this.routes = config.routes;
    this.maxRetries = config.maxRetries ?? 1;
    this.onFailover = config.onFailover;
  }

  /**
   * Stream with automatic failover.
   * Tries primary provider first, falls back to next on failure.
   */
  async stream(
    request: StreamRequest,
    onChunk: (chunk: StreamChunk) => void,
    signal?: AbortSignal,
  ): Promise<{ provider: string; failedProviders: string[] }> {
    const failedProviders: string[] = [];

    for (let i = 0; i < this.routes.length; i++) {
      const route = this.routes[i];
      let lastError: string | null = null;

      for (let retry = 0; retry <= this.maxRetries; retry++) {
        try {
          // Wrap onChunk to detect rate limit errors in-stream
          let hitRateLimit = false;

          await route.adapter.stream(
            request,
            route.apiKey,
            (chunk: StreamChunk) => {
              if (chunk.type === 'error' && isRateLimitError(chunk.content)) {
                hitRateLimit = true;
                return; // Don't forward rate limit errors to UI yet
              }
              onChunk(chunk);
            },
            signal,
          );

          if (hitRateLimit) {
            lastError = 'Rate limited (429)';
            throw new Error(lastError);
          }

          // Success
          return { provider: route.provider, failedProviders };
        } catch (err) {
          lastError = err instanceof Error ? err.message : 'Unknown error';

          // If aborted by user, don't retry
          if (signal?.aborted) {
            throw err;
          }

          // If rate limit, wait before retry
          if (isRateLimitError(lastError) && retry < this.maxRetries) {
            await sleep(1000 * (retry + 1)); // Linear backoff
            continue;
          }

          break; // Don't retry on other errors, try next provider
        }
      }

      // Provider failed, try next
      failedProviders.push(route.provider);

      if (i < this.routes.length - 1) {
        const nextRoute = this.routes[i + 1];
        this.onFailover?.(route.provider, nextRoute.provider, lastError ?? 'Unknown');
        onChunk({
          type: 'text_delta',
          content: `\n\n> ⚡ Switching from ${route.provider} to ${nextRoute.provider}: ${lastError}\n\n`,
        });
      }
    }

    // All providers failed
    onChunk({
      type: 'error',
      content: `All providers failed: ${failedProviders.join(', ')}`,
    });

    return { provider: 'none', failedProviders };
  }
}

function isRateLimitError(message: string): boolean {
  return (
    message.includes('429') ||
    message.includes('rate') ||
    message.includes('Rate') ||
    message.includes('quota') ||
    message.includes('Quota') ||
    message.includes('too many') ||
    message.includes('Too Many')
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
