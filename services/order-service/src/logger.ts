import { config } from './config.js';

export interface LogPayload {
  level?: 'debug' | 'info' | 'warn' | 'error';
  message: string;
  correlationId?: string;
  method?: string;
  route?: string;
  status?: number;
  durationMs?: number;
  errorCode?: string;
  details?: unknown;
  [key: string]: unknown;
}

const levelOrder: Record<string, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

export const logger = {
  log(payload: LogPayload) {
    const level = payload.level || 'info';
    if (levelOrder[level] < levelOrder[config.LOG_LEVEL]) {
      return;
    }

    const logEntry = {
      timestamp: new Date().toISOString(),
      service: 'order-service',
      environment: config.NODE_ENV,
      level,
      ...payload,
    };

    const out = JSON.stringify(logEntry);
    if (level === 'error') {
      console.error(out);
    } else if (level === 'warn') {
      console.warn(out);
    } else {
      console.log(out);
    }
  },

  info(message: string, extra?: Partial<LogPayload>) {
    this.log({ level: 'info', message, ...extra });
  },

  warn(message: string, extra?: Partial<LogPayload>) {
    this.log({ level: 'warn', message, ...extra });
  },

  error(message: string, extra?: Partial<LogPayload>) {
    this.log({ level: 'error', message, ...extra });
  },

  debug(message: string, extra?: Partial<LogPayload>) {
    this.log({ level: 'debug', message, ...extra });
  },
};
