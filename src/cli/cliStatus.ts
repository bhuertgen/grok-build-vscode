import { EventEmitter } from 'node:events';
import type { CliDetectionResult } from './detect';
import type { CliUpdateInfo } from './updateCheck';
import {
  assessCliCompat,
  shouldShowCompatBanner,
  type CliCompatAssessment,
  type CliCompatLevel,
} from './compat';
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
  private _compat: CliCompatAssessment | null = null;
  private _compatDismissedLevel: CliCompatLevel | null = null;

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

  get compat(): CliCompatAssessment | null {
    return this._compat;
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

    const showCompat =
      !!this._compat &&
      shouldShowCompatBanner(this._compat.level) &&
      this._compat.level !== this._compatDismissedLevel;

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
      compatLevel: this._compat?.level ?? null,
      compatMessage: showCompat ? this._compat?.message ?? null : null,
      compatVersion: this._compat?.version ?? null,
      compatHardMin: this._compat?.hardMin ?? null,
      compatSoftMin: this._compat?.softMin ?? null,
      compatUsable: this._compat?.usable ?? null,
      showCompatBanner: showCompat,
    };
  }

  setChecking(): void {
    this._checking = true;
    this.emit('changed', this.snapshot);
  }

  /** Apply CLI detection result (ready / path / version + compat floors). */
  setDetection(detection: CliDetectionResult): void {
    this._checking = false;
    this._detection = detection;
    this._compat = assessCliCompat({
      detected: detection.ok,
      rawVersion: detection.version,
      error: detection.error,
    });
    // Hard floor / missing → not ready even if binary spawned
    this._ready = detection.ok && this._compat.usable;
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

  dismissCompatBanner(): void {
    if (this._compat && shouldShowCompatBanner(this._compat.level)) {
      this._compatDismissedLevel = this._compat.level;
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
