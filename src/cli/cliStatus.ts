import { EventEmitter } from 'node:events';
import type { CliDetectionResult } from './detect';
import type { CliUpdateInfo } from './updateCheck';
import type { ExtensionUpdateInfo } from '../util/extensionUpdate';

/**
 * Shared CLI readiness state for status bar + webview.
 */
export class CliStatus extends EventEmitter {
  private _ready = false;
  private _detection: CliDetectionResult | null = null;
  private _checking = true;
  private _update: CliUpdateInfo | null = null;
  private _extUpdate: ExtensionUpdateInfo | null = null;
  /** User dismissed the update banner for this version pair */
  private _updateDismissedKey: string | null = null;
  private _extUpdateDismissedKey: string | null = null;

  get ready(): boolean {
    return this._ready;
  }

  get checking(): boolean {
    return this._checking;
  }

  get detection(): CliDetectionResult | null {
    return this._detection;
  }

  get updateInfo(): CliUpdateInfo | null {
    return this._update;
  }

  get snapshot() {
    const updateKey =
      this._update?.updateAvailable &&
      this._update.currentVersion &&
      this._update.latestVersion
        ? `${this._update.currentVersion}→${this._update.latestVersion}`
        : null;
    const showUpdate =
      !!this._update?.updateAvailable &&
      updateKey != null &&
      updateKey !== this._updateDismissedKey;

    const extKey =
      this._extUpdate?.updateAvailable &&
      this._extUpdate.currentVersion &&
      this._extUpdate.latestVersion
        ? `ext:${this._extUpdate.currentVersion}→${this._extUpdate.latestVersion}`
        : null;
    const showExtUpdate =
      !!this._extUpdate?.updateAvailable &&
      extKey != null &&
      extKey !== this._extUpdateDismissedKey;

    return {
      ready: this._ready,
      checking: this._checking,
      cliPath: this._detection?.cliPath ?? null,
      version: this._detection?.version ?? this._update?.currentVersion ?? null,
      error: this._detection?.error ?? null,
      updateAvailable: showUpdate,
      updateCurrent: this._update?.currentVersion ?? null,
      updateLatest: this._update?.latestVersion ?? null,
      updateMessage: showUpdate
        ? this._update?.message ?? null
        : null,
      updateChannel: this._update?.channel ?? null,
      extensionUpdateAvailable: showExtUpdate,
      extensionUpdateCurrent: this._extUpdate?.currentVersion ?? null,
      extensionUpdateLatest: this._extUpdate?.latestVersion ?? null,
      extensionUpdateMessage: showExtUpdate
        ? this._extUpdate?.message ?? null
        : null,
      extensionReleaseUrl: showExtUpdate
        ? this._extUpdate?.releaseUrl ?? null
        : null,
      extensionVsixUrl: showExtUpdate
        ? this._extUpdate?.vsixUrl ?? null
        : null,
    };
  }

  setChecking(): void {
    this._checking = true;
    this.emit('changed', this.snapshot);
  }

  /** Apply CLI detection result (ready / path / version). */
  setDetection(detection: CliDetectionResult): void {
    this._checking = false;
    this._ready = detection.ok;
    this._detection = detection;
    this.emit('changed', this.snapshot);
  }

  /** @deprecated use setDetection */
  update(detection: CliDetectionResult): void {
    this.setDetection(detection);
  }

  setUpdateInfo(info: CliUpdateInfo): void {
    this._update = info;
    this.emit('changed', this.snapshot);
  }

  setExtensionUpdateInfo(info: ExtensionUpdateInfo): void {
    this._extUpdate = info;
    this.emit('changed', this.snapshot);
  }

  dismissUpdateBanner(): void {
    if (
      this._update?.updateAvailable &&
      this._update.currentVersion &&
      this._update.latestVersion
    ) {
      this._updateDismissedKey = `${this._update.currentVersion}→${this._update.latestVersion}`;
    }
    this.emit('changed', this.snapshot);
  }

  dismissExtensionUpdateBanner(): void {
    if (
      this._extUpdate?.updateAvailable &&
      this._extUpdate.currentVersion &&
      this._extUpdate.latestVersion
    ) {
      this._extUpdateDismissedKey = `ext:${this._extUpdate.currentVersion}→${this._extUpdate.latestVersion}`;
    }
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
