/**
 * Debug logger for GeoSDK
 * Controlled by the `debug` config option
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'none';

interface LoggerConfig {
  enabled: boolean;
  level: LogLevel;
  prefix: string;
}

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
  none: 4,
};

class Logger {
  private config: LoggerConfig = {
    enabled: false,
    level: 'info',
    prefix: '[GeoSDK]',
  };

  /**
   * Configure the logger
   */
  configure(options: Partial<LoggerConfig>): void {
    this.config = { ...this.config, ...options };
  }

  /**
   * Set debug mode on/off
   */
  setDebug(enabled: boolean): void {
    this.config.enabled = enabled;
  }

  /**
   * Set log level
   */
  setLevel(level: LogLevel): void {
    this.config.level = level;
  }

  /**
   * Set prefix for log messages
   */
  setPrefix(prefix: string): void {
    this.config.prefix = prefix;
  }

  /**
   * Check if logging is enabled for a given level
   */
  private shouldLog(level: LogLevel): boolean {
    if (!this.config.enabled) return false;
    return LOG_LEVELS[level] >= LOG_LEVELS[this.config.level];
  }

  /**
   * Format message with prefix
   */
  private format(message: string): string {
    return `${this.config.prefix} ${message}`;
  }

  /**
   * Debug level logging
   */
  debug(message: string, ...args: unknown[]): void {
    if (this.shouldLog('debug')) {
      console.log(this.format(message), ...args);
    }
  }

  /**
   * Info level logging
   */
  info(message: string, ...args: unknown[]): void {
    if (this.shouldLog('info')) {
      console.log(this.format(message), ...args);
    }
  }

  /**
   * Warning level logging
   */
  warn(message: string, ...args: unknown[]): void {
    if (this.shouldLog('warn')) {
      console.warn(this.format(message), ...args);
    }
  }

  /**
   * Error level logging
   */
  error(message: string, ...args: unknown[]): void {
    if (this.shouldLog('error')) {
      console.error(this.format(message), ...args);
    }
  }
}

// Singleton logger instance
export const logger = new Logger();

/**
 * Create a logger with a custom prefix
 */
export function createLogger(prefix: string): Logger {
  const customLogger = new Logger();
  customLogger.configure({
    enabled: logger['config'].enabled,
    level: logger['config'].level,
    prefix,
  });
  return customLogger;
}
