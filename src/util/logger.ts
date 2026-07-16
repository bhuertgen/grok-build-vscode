import * as vscode from 'vscode';

export type LogLevel = 'error' | 'warn' | 'info' | 'debug';

const LEVEL_ORDER: Record<LogLevel, number> = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3,
};

export class Logger {
  private channel: vscode.OutputChannel;
  private level: LogLevel = 'info';

  constructor(name = 'Grok Build') {
    this.channel = vscode.window.createOutputChannel(name);
    this.refreshLevel();
  }

  refreshLevel(): void {
    const cfg = vscode.workspace.getConfiguration('grokBuild');
    this.level = (cfg.get<LogLevel>('logLevel') ?? 'info') as LogLevel;
  }

  private shouldLog(level: LogLevel): boolean {
    return LEVEL_ORDER[level] <= LEVEL_ORDER[this.level];
  }

  private write(level: LogLevel, message: string, ...args: unknown[]): void {
    if (!this.shouldLog(level)) {
      return;
    }
    const ts = new Date().toISOString();
    const extra =
      args.length > 0
        ? ' ' +
          args
            .map((a) => {
              try {
                return typeof a === 'string' ? a : JSON.stringify(a);
              } catch {
                return String(a);
              }
            })
            .join(' ')
        : '';
    this.channel.appendLine(`[${ts}] [${level.toUpperCase()}] ${message}${extra}`);
  }

  error(message: string, ...args: unknown[]): void {
    this.write('error', message, ...args);
  }

  warn(message: string, ...args: unknown[]): void {
    this.write('warn', message, ...args);
  }

  info(message: string, ...args: unknown[]): void {
    this.write('info', message, ...args);
  }

  debug(message: string, ...args: unknown[]): void {
    this.write('debug', message, ...args);
  }

  show(preserveFocus = true): void {
    this.channel.show(preserveFocus);
  }

  dispose(): void {
    this.channel.dispose();
  }
}

let shared: Logger | undefined;

export function getLogger(): Logger {
  if (!shared) {
    shared = new Logger();
  }
  return shared;
}
