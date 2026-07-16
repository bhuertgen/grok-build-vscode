import { EventEmitter } from 'node:events';
import type { CliDetectionResult } from './detect';

/**
 * Shared CLI readiness state for status bar + webview.
 */
export class CliStatus extends EventEmitter {
  private _ready = false;
  private _detection: CliDetectionResult | null = null;
  private _checking = true;

  get ready(): boolean {
    return this._ready;
  }

  get checking(): boolean {
    return this._checking;
  }

  get detection(): CliDetectionResult | null {
    return this._detection;
  }

  get snapshot() {
    return {
      ready: this._ready,
      checking: this._checking,
      cliPath: this._detection?.cliPath ?? null,
      version: this._detection?.version ?? null,
      error: this._detection?.error ?? null,
    };
  }

  setChecking(): void {
    this._checking = true;
    this.emit('changed', this.snapshot);
  }

  update(detection: CliDetectionResult): void {
    this._checking = false;
    this._ready = detection.ok;
    this._detection = detection;
    this.emit('changed', this.snapshot);
  }
}

let shared: CliStatus | undefined;

export function getCliStatus(): CliStatus {
  if (!shared) {
    shared = new CliStatus();
  }
  return shared;
}
