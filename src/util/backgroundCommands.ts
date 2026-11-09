/**
 * Info line for terminals still running when a prompt turn ends.
 * Matches the Grok CLI 1.0.79 TUI note. Pure — unit-tested.
 *
 * The line is ephemeral: the session keeps one copy and drops it from
 * persisted history, because a reload no longer owns those processes.
 */

export const BACKGROUND_NOTICE_ID = 'bg-commands';

/** Listed commands before "and N more". */
export const BACKGROUND_COMMANDS_LISTED = 3;

/** Visible length of one command, including the ellipsis when truncated. */
export const BACKGROUND_COMMAND_MAX_LEN = 64;

const SHELL_BASENAMES = new Set([
  'bash',
  'sh',
  'zsh',
  'dash',
  'ash',
  'ksh',
  'fish',
  'cmd',
  'cmd.exe',
  'powershell',
  'powershell.exe',
  'pwsh',
  'pwsh.exe',
]);

export interface BackgroundNoticeMessage {
  id: string;
  role: string;
  content: string;
  timestamp: number;
}

/** Collapse whitespace. Empty input stays empty. */
export function truncateCommand(command: string, max = BACKGROUND_COMMAND_MAX_LEN): string {
  const one = String(command ?? '').replace(/\s+/g, ' ').trim();
  if (!one || one.length <= max) {
    return one;
  }
  const keep = Math.max(1, max - 1);
  return one.slice(0, keep) + '…';
}

/**
 * Human-readable command for a `terminal/create` request.
 * `/usr/bin/bash -lc 'npm run dev'` and `bash` + `['-lc', 'npm run dev']`
 * both become `npm run dev`. A direct argv (`npm`, `['run', 'dev']`) is joined.
 */
export function displayTerminalCommand(
  command: string | undefined | null,
  args?: readonly string[] | null
): string {
  const argv = Array.isArray(args) ? args.map((a) => String(a)) : [];
  const cmd = String(command ?? '').trim();
  const parts = [cmd, ...argv.map((a) => a.trim())].filter((s) => s.length > 0);
  const joined = parts.join(' ');
  const inner = unwrapShellInvocation(joined);
  const shown = (inner || joined).replace(/\s+/g, ' ').trim();
  return shown || 'command';
}

/**
 * `1 background command still running: \`npm run dev\``
 * Plural for N. At most three commands, then `and N more`.
 * Undefined when nothing is running.
 */
export function formatBackgroundCommandsNotice(
  commands: readonly string[]
): string | undefined {
  const cleaned: string[] = [];
  for (const command of commands) {
    const shown = truncateCommand(command);
    if (shown) {
      cleaned.push(shown);
    }
  }
  if (cleaned.length === 0) {
    return undefined;
  }
  const listed = cleaned.slice(0, BACKGROUND_COMMANDS_LISTED);
  const extra = cleaned.length - listed.length;
  const list =
    listed.map(codeSpan).join(', ') + (extra > 0 ? ` and ${extra} more` : '');
  const noun = cleaned.length === 1 ? 'command' : 'commands';
  return `ℹ️ ${cleaned.length} background ${noun} still running: ${list}`;
}

/**
 * Insert, update, or remove the single background-command notice.
 * `placeAtEnd` (turn just finished) moves it after the latest message.
 * When false, an existing line is updated or removed in place and a missing
 * one is not created (a terminal exited before the next turn ends).
 * Returns whether `messages` changed.
 */
export function syncBackgroundCommandNotice<T extends BackgroundNoticeMessage>(
  messages: T[],
  commands: readonly string[],
  options: { placeAtEnd: boolean; now?: number }
): boolean {
  const text = formatBackgroundCommandsNotice(commands);
  const idx = messages.findIndex((m) => m.id === BACKGROUND_NOTICE_ID);
  if (!text) {
    if (idx < 0) {
      return false;
    }
    messages.splice(idx, 1);
    return true;
  }
  const now = options.now ?? Date.now();
  if (idx >= 0) {
    const msg = messages[idx];
    const contentChanged = msg.content !== text;
    msg.content = text;
    let moved = false;
    if (options.placeAtEnd) {
      let othersMax = 0;
      for (let i = 0; i < messages.length; i++) {
        if (i === idx) {
          continue;
        }
        othersMax = Math.max(othersMax, messages[i].timestamp || 0);
      }
      if (msg.timestamp <= othersMax) {
        msg.timestamp = Math.max(now, othersMax + 1);
        moved = true;
      }
      if (idx !== messages.length - 1) {
        messages.splice(idx, 1);
        messages.push(msg);
        moved = true;
      }
    }
    return contentChanged || moved;
  }
  if (!options.placeAtEnd) {
    return false;
  }
  let maxTs = 0;
  for (const m of messages) {
    maxTs = Math.max(maxTs, m.timestamp || 0);
  }
  messages.push({
    id: BACKGROUND_NOTICE_ID,
    role: 'system',
    content: text,
    timestamp: Math.max(now, maxTs + 1),
  } as T);
  return true;
}

function codeSpan(command: string): string {
  return '`' + command.replace(/`/g, "'") + '`';
}

function unwrapShellInvocation(line: string): string {
  const tokens = splitShellTokens(line);
  if (tokens.length < 2) {
    return line;
  }
  const base = shellBasename(tokens[0]);
  if (!SHELL_BASENAMES.has(base)) {
    return line;
  }
  for (let i = 1; i < tokens.length; i++) {
    if (!isShellCommandFlag(tokens[i])) {
      continue;
    }
    const rest = tokens.slice(i + 1).join(' ').trim();
    return rest || line;
  }
  return line;
}

function shellBasename(exe: string): string {
  const name = exe.replace(/\\/g, '/').split('/').pop() || exe;
  return name.toLowerCase();
}

function isShellCommandFlag(token: string): boolean {
  if (
    token === '--command' ||
    token === '/c' ||
    token === '-Command' ||
    token === '-command'
  ) {
    return true;
  }
  return /^-[a-zA-Z]*c[a-zA-Z]*$/.test(token);
}

/** Split a shell command line. Single and double quotes become one token. */
function splitShellTokens(line: string): string[] {
  const out: string[] = [];
  const n = line.length;
  let i = 0;
  while (i < n) {
    while (i < n && /\s/.test(line[i])) {
      i++;
    }
    if (i >= n) {
      break;
    }
    const quote = line[i];
    if (quote === "'" || quote === '"') {
      let j = i + 1;
      let buf = '';
      while (j < n && line[j] !== quote) {
        if (quote === '"' && line[j] === '\\' && j + 1 < n) {
          buf += line[j + 1];
          j += 2;
          continue;
        }
        buf += line[j];
        j++;
      }
      out.push(buf);
      i = j < n ? j + 1 : j;
      continue;
    }
    let j = i;
    let buf = '';
    while (j < n && !/\s/.test(line[j])) {
      buf += line[j];
      j++;
    }
    out.push(buf);
    i = j;
  }
  return out;
}
