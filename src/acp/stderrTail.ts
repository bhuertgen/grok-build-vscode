/**
 * Bounded tail of an agent process's stderr.
 * Pure (no vscode) — unit-tested.
 *
 * The CLI prints the reason it is about to exit on stderr (`error: …`) and
 * then closes before ACP `initialize`. The full stream is noise and may
 * contain secrets; the user-facing text is the last few lines, preferring
 * `error:` lines, with ANSI codes removed and the result truncated.
 */

export const STDERR_TAIL_MAX_CHARS = 2048;
export const STDERR_TAIL_MAX_LINES = 20;

const ANSI_CSI = /\u001b\[[0-?]*[ -/]*[@-~]/g;
const ANSI_OSC = /\u001b\][^\u0007]*(?:\u0007|\u001b\\)/g;
const ANSI_SINGLE = /\u001b[@-_]/g;

/** Remove CSI/OSC color and cursor sequences. */
export function stripAnsi(text: string): string {
  return text.replace(ANSI_CSI, '').replace(ANSI_OSC, '').replace(ANSI_SINGLE, '');
}

/**
 * Hide credential-shaped values. The sandbox error we want to show
 * (`error: unknown sandbox profile "…"`) does not match these.
 */
export function redactSecrets(text: string): string {
  return text
    .replace(/\bBearer\s+\S+/gi, 'Bearer <redacted>')
    .replace(
      /\b(authorization|api[_-]?key|token|secret|password|passwd)\b(\s*[:=]\s*)\S+/gi,
      '$1$2<redacted>'
    )
    .replace(/\b(?:sk|xai|ghp|github_pat)_[A-Za-z0-9_-]{8,}\b/g, '<redacted>');
}

/** True for a CLI diagnostic line (`error: unknown sandbox profile …`). */
export function isAgentErrorLine(line: string): boolean {
  return /^error:/i.test(line.trim());
}

function clipChars(text: string, max: number): string {
  if (text.length <= max) {
    return text;
  }
  const sliced = text.slice(text.length - max);
  const nl = sliced.indexOf('\n');
  if (nl >= 0 && nl < sliced.length - 1) {
    return sliced.slice(nl + 1).trim();
  }
  return sliced.trim();
}

/**
 * Remembers the recent stderr lines (capped) and the `error:` lines among
 * them so a burst of debug output does not push the cause out of the tail.
 */
export class StderrTail {
  private pending = '';
  private recent: string[] = [];
  private errors: string[] = [];

  /**
   * Feed one stderr chunk (may be a partial line).
   * Returns completed lines that start with `error:` so the caller can
   * log them at warn level. Those lines are not also returned as debug text.
   */
  push(chunk: string): { warnLines: string[]; debugText: string } {
    const clean = stripAnsi(String(chunk)).replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    this.pending += clean;
    const parts = this.pending.split('\n');
    this.pending = parts.pop() ?? '';
    const warnLines: string[] = [];
    const debugLines: string[] = [];
    for (const part of parts) {
      const stored = this.remember(part);
      if (!stored) {
        continue;
      }
      if (isAgentErrorLine(stored)) {
        warnLines.push(stored.trim());
      } else {
        debugLines.push(stored);
      }
    }
    return { warnLines, debugText: debugLines.join('\n').trim() };
  }

  /**
   * Flush a trailing partial line (the process exited without a final
   * newline). Returns any new `error:` line so it is logged at warn too.
   */
  flush(): string[] {
    if (!this.pending) {
      return [];
    }
    const stored = this.remember(this.pending);
    this.pending = '';
    if (stored && isAgentErrorLine(stored)) {
      return [stored.trim()];
    }
    return [];
  }

  /**
   * Text to attach to an exit error. `error:` lines win over ordinary
   * output. Empty when the process said nothing.
   */
  meaningful(): string {
    this.flush();
    const chosen = (this.errors.length ? this.errors : this.recent).slice(
      -STDERR_TAIL_MAX_LINES
    );
    return clipChars(chosen.join('\n'), STDERR_TAIL_MAX_CHARS);
  }

  private remember(raw: string): string | undefined {
    let line = redactSecrets(raw.replace(/[ \t]+$/g, ''));
    if (!line.trim()) {
      return undefined;
    }
    if (line.length > STDERR_TAIL_MAX_CHARS) {
      line = line.slice(0, STDERR_TAIL_MAX_CHARS);
    }
    this.recent.push(line);
    if (this.recent.length > STDERR_TAIL_MAX_LINES) {
      this.recent.splice(0, this.recent.length - STDERR_TAIL_MAX_LINES);
    }
    if (isAgentErrorLine(line)) {
      this.errors.push(line);
      if (this.errors.length > STDERR_TAIL_MAX_LINES) {
        this.errors.splice(0, this.errors.length - STDERR_TAIL_MAX_LINES);
      }
    }
    return line;
  }
}

/**
 * Exit error shown in the chat and on the session status line.
 * The cause leads so a short banner (the status line keeps ~80 characters)
 * shows the `error:` text, not only the exit code.
 * With an empty tail the message is unchanged from the historical wording.
 */
export function formatAgentExitError(
  code: number | null,
  signal: NodeJS.Signals | string | null,
  tail: string
): string {
  const base = `Agent process exited (code=${code}, signal=${signal})`;
  const detail = tail.trim();
  if (!detail) {
    return base;
  }
  return `${detail}\n${base}`;
}

/**
 * Chat line when a live session's process exits. No tail → the historical
 * sentence, so a clean disconnect reads the same as before.
 */
export function formatDisconnectNotice(tail: string): string {
  const base = 'Agent process disconnected. Send a message to reconnect.';
  const detail = tail.trim();
  if (!detail) {
    return base;
  }
  return `${base}\n\n${detail}`;
}
