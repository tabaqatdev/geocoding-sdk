/**
 * SDK logger — thin wrapper over native console methods.
 *
 * - `debug` / `info` are gated by the `debug` config flag
 * - `warn` / `error` always log (they indicate actual issues)
 * - `time` / `timeEnd` use console.time for native DevTools timing
 *
 * In production, consumers can strip console calls via
 * `esbuild: { drop: ['console'] }` in their Vite/build config.
 */

const PREFIX = '[GeoSDK]';

export interface SDKLogger {
  debug(...args: unknown[]): void;
  info(...args: unknown[]): void;
  warn(...args: unknown[]): void;
  error(...args: unknown[]): void;
  time(label: string): void;
  timeEnd(label: string): void;
}

export function createLogger(isDebug: () => boolean): SDKLogger {
  return {
    debug: (...args) => {
      if (isDebug()) console.debug(PREFIX, ...args);
    },
    info: (...args) => {
      if (isDebug()) console.info(PREFIX, ...args);
    },
    warn: (...args) => console.warn(PREFIX, ...args),
    error: (...args) => console.error(PREFIX, ...args),
    time: (label) => {
      if (isDebug()) console.time(`${PREFIX} ${label}`);
    },
    timeEnd: (label) => {
      if (isDebug()) console.timeEnd(`${PREFIX} ${label}`);
    },
  };
}
