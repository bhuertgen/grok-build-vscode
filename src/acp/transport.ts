import { EventEmitter } from 'node:events';
import type { ChildProcessWithoutNullStreams } from 'node:child_process';
import type {
  JsonRpcError,
  JsonRpcMessage,
  JsonRpcNotification,
  JsonRpcRequest,
  JsonRpcSuccess,
} from './types';
import { getLogger } from '../util/logger';

type Pending = {
  resolve: (value: unknown) => void;
  reject: (err: Error) => void;
  method: string;
  timer?: NodeJS.Timeout;
};

/**
 * Line-delimited JSON-RPC 2.0 transport over a child process stdio.
 * Each message is a single JSON object terminated by `\n`.
 */
export class AcpTransport extends EventEmitter {
  private nextId = 1;
  private pending = new Map<number | string, Pending>();
  private buffer = '';
  private closed = false;
  private readonly log = getLogger();

  constructor(private readonly proc: ChildProcessWithoutNullStreams) {
    super();
    proc.stdout.setEncoding('utf8');
    proc.stderr.setEncoding('utf8');

    proc.stdout.on('data', (chunk: string) => this.onStdout(chunk));
    proc.stderr.on('data', (chunk: string) => {
      const text = chunk.trim();
      if (text) {
        this.log.debug(`[agent stderr] ${text}`);
        this.emit('stderr', text);
      }
    });
    proc.on('error', (err) => {
      this.log.error('Agent process error', err);
      this.emit('error', err);
      this.failAll(err);
    });
    proc.on('close', (code, signal) => {
      this.closed = true;
      this.log.info(`Agent process closed code=${code} signal=${signal}`);
      this.emit('close', code, signal);
      this.failAll(
        new Error(`Agent process exited (code=${code}, signal=${signal})`)
      );
    });
  }

  get isClosed(): boolean {
    return this.closed;
  }

  /** Send a request and wait for the matching response. */
  request<T = unknown>(
    method: string,
    params?: unknown,
    timeoutMs = 0
  ): Promise<T> {
    if (this.closed) {
      return Promise.reject(new Error('ACP transport is closed'));
    }
    const id = this.nextId++;
    const msg: JsonRpcRequest = {
      jsonrpc: '2.0',
      id,
      method,
      params,
    };
    return new Promise<T>((resolve, reject) => {
      const pending: Pending = {
        resolve: (v) => resolve(v as T),
        reject,
        method,
      };
      if (timeoutMs > 0) {
        pending.timer = setTimeout(() => {
          this.pending.delete(id);
          reject(new Error(`ACP request timeout: ${method} (${timeoutMs}ms)`));
        }, timeoutMs);
      }
      this.pending.set(id, pending);
      this.write(msg);
    });
  }

  /** Fire-and-forget notification (no id). */
  notify(method: string, params?: unknown): void {
    if (this.closed) {
      return;
    }
    const msg: JsonRpcNotification = {
      jsonrpc: '2.0',
      method,
      params,
    };
    this.write(msg);
  }

  /** Respond to an inbound request from the agent. */
  respond(id: number | string, result: unknown): void {
    const msg: JsonRpcSuccess = {
      jsonrpc: '2.0',
      id,
      result,
    };
    this.write(msg);
  }

  /** Respond with an error to an inbound request. */
  respondError(
    id: number | string,
    code: number,
    message: string,
    data?: unknown
  ): void {
    const msg: JsonRpcError = {
      jsonrpc: '2.0',
      id,
      error: { code, message, data },
    };
    this.write(msg);
  }

  dispose(): void {
    this.failAll(new Error('Transport disposed'));
    try {
      if (!this.proc.killed) {
        this.proc.kill();
      }
    } catch {
      /* ignore */
    }
  }

  private write(msg: JsonRpcMessage): void {
    const line = JSON.stringify(msg) + '\n';
    this.log.debug('→', msg);
    try {
      this.proc.stdin.write(line);
    } catch (err) {
      this.log.error('Failed to write to agent stdin', err);
      this.emit('error', err);
    }
  }

  private onStdout(chunk: string): void {
    this.buffer += chunk;
    let idx: number;
    while ((idx = this.buffer.indexOf('\n')) >= 0) {
      const line = this.buffer.slice(0, idx).trim();
      this.buffer = this.buffer.slice(idx + 1);
      if (!line) {
        continue;
      }
      try {
        const msg = JSON.parse(line) as JsonRpcMessage;
        this.log.debug('←', msg);
        this.dispatch(msg);
      } catch (err) {
        this.log.warn('Failed to parse agent stdout line', line.slice(0, 200), err);
      }
    }
  }

  private dispatch(msg: JsonRpcMessage): void {
    if ('id' in msg && msg.id !== undefined && msg.id !== null && !('method' in msg)) {
      // Response (success or error)
      const pending = this.pending.get(msg.id);
      if (!pending) {
        this.log.debug('Unexpected response id', msg.id);
        return;
      }
      this.pending.delete(msg.id);
      if (pending.timer) {
        clearTimeout(pending.timer);
      }
      if ('error' in msg && msg.error) {
        pending.reject(
          new Error(
            `ACP error in ${pending.method}: [${msg.error.code}] ${msg.error.message}`
          )
        );
      } else if ('result' in msg) {
        pending.resolve(msg.result);
      }
      return;
    }

    if ('method' in msg && msg.method) {
      if ('id' in msg && msg.id !== undefined && msg.id !== null) {
        // Inbound request from agent
        this.emit('request', msg as JsonRpcRequest);
      } else {
        // Notification
        this.emit('notification', msg as JsonRpcNotification);
      }
    }
  }

  private failAll(err: Error): void {
    for (const [id, p] of this.pending) {
      if (p.timer) {
        clearTimeout(p.timer);
      }
      p.reject(err);
      this.pending.delete(id);
    }
  }
}
