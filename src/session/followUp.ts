/**
 * Mid-turn follow-ups, matching the Grok CLI TUI default
 * `[ui] follow_up_behavior = "queue"` (user guide, v1.0.70).
 *
 * While a turn is running, a non-empty composer submit is stored here and
 * sent later through the normal `session/prompt` path — one turn at a time.
 * Send now stops the current turn, then that prompt is the next turn.
 *
 * CLI 1.0.84/1.0.85 keeps that queue when a permission prompt is rejected
 * or cancelled, when the turn is cancelled, and when the turn stops for
 * `max_turn_requests`, repeated tool calls (`action_stationarity`), or
 * `refusal` — the next queued prompt still runs. This client does the same.
 * Stop / Esc / Cancel Current Turn is the exception: the CLI keeps the
 * queue across a user interrupt, and so do we, but we do not auto-send.
 * The user just asked the turn to stop; the queued rows stay until they
 * send one (Send now, or another turn that is not a Stop).
 *
 * CLI 1.0.84 also refuses send-now / double-Enter while the running
 * prompt's user message is not committed yet, so the second press cannot
 * cancel the turn the first press just started. `session/prompt` here is
 * one call that lasts the whole turn, so that window is `FRESH_TURN_MS`
 * from the moment the turn is claimed.
 *
 * Steer (`follow_up_behavior = "steer"`, ACP ext-notification
 * `x.ai/queue/interject`) is intentionally not implemented. Interject only
 * injects a prompt the agent has already accepted onto its own queue, which
 * means a second in-flight `session/prompt`. This client keeps the follow-up
 * locally and `sendPrompt` still rejects a second concurrent turn, so there
 * is nothing to interject. Do not fake steer by splicing text into the live
 * answer.
 */

export const BUSY_ERROR = 'Session is busy';
export const EMPTY_FOLLOW_UP = 'Empty follow-up';
export const QUEUE_FULL = 'Follow-up queue is full';

/** Composer drafts waiting behind the current turn. */
export const MAX_FOLLOW_UPS = 30;

/**
 * Send-now / double-Enter must not cancel a turn this recently claimed.
 * Matches CLI 1.0.84 ("send-now and double-Enter no longer cancel a turn
 * that the first press just started"). A deliberate send-now after the
 * window still cancels.
 */
export const FRESH_TURN_MS = 500;

/**
 * What to do with the local queue when a turn ends.
 * `continue` — keep every row and send the next one (CLI 1.0.84/1.0.85).
 * `hold` — keep every row and do not send (user pressed Stop).
 */
export type QueueDisposition = 'continue' | 'hold';

export interface QueueDispositionInput {
  stopReason?: string | null;
  /**
   * `_meta.cancellationCategory` when the CLI sends one.
   * `PermissionRejected` / `PermissionCancelled` (1.0.84),
   * `action_stationarity` (repeated tool calls, 1.0.85),
   * `max_turns_reached` (turn cap, often paired with `max_turn_requests`).
   */
  cancellationCategory?: string | null;
  /** Stop, Esc, or Cancel Current Turn. Send-now is not a user stop. */
  userStopped?: boolean;
}

/**
 * Keep the queue and keep draining it for every agent stop, including a
 * rejected or cancelled permission, a cancelled turn, `max_turn_requests`,
 * repeated tool calls, and `refusal`. A user Stop keeps the queue and
 * does not auto-send.
 */
export function queueDisposition(input: QueueDispositionInput): QueueDisposition {
  if (input.userStopped) {
    return 'hold';
  }
  // Every other ending keeps draining: end_turn, cancelled (including a
  // permission reject or cancel, and a cancel the user did not press Stop
  // for), refusal, max_tokens, max_turn_requests, and categories such as
  // PermissionRejected, PermissionCancelled, action_stationarity, and
  // max_turns_reached. An unknown reason continues too — losing the queue
  // is the bug CLI 1.0.84/1.0.85 fixed. stopReason and cancellationCategory
  // are accepted so callers and tests can name the ending; they do not drop.
  return 'continue';
}

export interface QueuedImage {
  mimeType: string;
  data: string;
}

export interface QueuedPrompt {
  id: string;
  text: string;
  images?: QueuedImage[];
  /** Open in the queue editor — drain and empty-Enter send-now skip it. */
  held?: boolean;
}

/** What the webview renders. Image bytes stay on the extension side. */
export interface FollowUpQueueItem {
  id: string;
  text: string;
  imageCount: number;
  held?: boolean;
  /** Armed by send-now; becomes the next turn as soon as this one ends. */
  sendNow?: boolean;
}

export type ComposerAction = 'ignore' | 'send' | 'queue' | 'send-now';

export interface ComposerSubmitInput {
  busy: boolean;
  text: string;
  hasImages: boolean;
  queueLength: number;
  /** Ctrl/Cmd+Enter — interruptive "stop and take this". */
  forceSendNow?: boolean;
}

/**
 * Webview composer decision. Bundled as `GrokFollowUp.decideComposerSubmit`.
 * Keep the fallback in `webview/main.js` identical.
 */
export function decideComposerSubmit(input: ComposerSubmitInput): ComposerAction {
  const nonEmpty = input.text.trim().length > 0 || input.hasImages;
  if (input.forceSendNow) {
    return nonEmpty || input.queueLength > 0 ? 'send-now' : 'ignore';
  }
  if (!input.busy) {
    return nonEmpty ? 'send' : 'ignore';
  }
  if (nonEmpty) {
    return 'queue';
  }
  // CLI: Enter on an empty composer while something is queued is send now
  // (cancel this turn, then run the top queued prompt).
  if (input.queueLength > 0) {
    return 'send-now';
  }
  return 'ignore';
}

export function coerceQueuedImages(raw: unknown): QueuedImage[] | undefined {
  if (!Array.isArray(raw)) {
    return undefined;
  }
  const out: QueuedImage[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') {
      continue;
    }
    const rec = item as { mimeType?: unknown; data?: unknown };
    const mimeType = typeof rec.mimeType === 'string' ? rec.mimeType : '';
    const data = typeof rec.data === 'string' ? rec.data : '';
    if (!mimeType.startsWith('image/') || mimeType.length > 100 || !data) {
      continue;
    }
    // ~6 MB of base64 is already a large paste; ignore anything beyond that.
    if (data.length > 8_000_000) {
      continue;
    }
    out.push({ mimeType, data });
    if (out.length >= 8) {
      break;
    }
  }
  return out.length ? out : undefined;
}

let seq = 0;

function nextId(): string {
  seq += 1;
  return `fq_${Date.now().toString(36)}_${seq.toString(36)}`;
}

function cloneImages(images?: QueuedImage[]): QueuedImage[] | undefined {
  if (!images?.length) {
    return undefined;
  }
  return images.map((img) => ({ mimeType: img.mimeType, data: img.data }));
}

export function createQueuedPrompt(
  text: string,
  images?: QueuedImage[],
  id?: string
): QueuedPrompt {
  const imgs = cloneImages(images);
  const body = text.trim();
  const cleanId = id?.trim();
  return {
    id: cleanId ? cleanId.slice(0, 80) : nextId(),
    text: body || (imgs?.length ? '(image)' : ''),
    images: imgs,
  };
}

export function isSendable(prompt: QueuedPrompt): boolean {
  return prompt.text.trim().length > 0 || (prompt.images?.length ?? 0) > 0;
}

export type SendNowOrigin = 'draft' | 'queue';

export type SendNowResult =
  | { action: 'ignore' }
  | { action: 'send'; prompt: QueuedPrompt; origin: SendNowOrigin }
  | { action: 'cancel'; prompt: QueuedPrompt; origin: SendNowOrigin }
  | { action: 'queued'; prompt: QueuedPrompt; origin: 'draft' };

/**
 * One session's follow-up queue plus the single-turn lock.
 * `claimTurn` is the busy guard: a second call throws `Session is busy`
 * and does not enqueue.
 */
export class FollowUpGate {
  private queue: QueuedPrompt[] = [];
  private sendNow: QueuedPrompt | null = null;
  private _busy = false;
  private turnStartedAt = 0;

  get busy(): boolean {
    return this._busy;
  }

  /** Start a turn. Throws when one is already running — does not touch the queue. */
  claimTurn(now = Date.now()): void {
    if (this._busy) {
      throw new Error(BUSY_ERROR);
    }
    this._busy = true;
    this.turnStartedAt = now;
  }

  /** True while send-now must not cancel the turn the previous press just started. */
  isFreshTurn(now = Date.now()): boolean {
    return this._busy && now - this.turnStartedAt < FRESH_TURN_MS;
  }

  /**
   * The turn has left the agent. Clears the lock and returns the next prompt
   * (send-now first, otherwise the first row that is not being edited).
   */
  releaseTurn(): QueuedPrompt | null {
    if (!this._busy) {
      return null;
    }
    this._busy = false;
    return this.takeNext();
  }

  /**
   * The user pressed Stop. Clear the lock and leave every row queued,
   * including a send-now that had not been delivered yet.
   */
  holdTurn(): void {
    if (!this._busy) {
      return;
    }
    this._busy = false;
    if (this.sendNow) {
      const prompt = this.sendNow;
      this.sendNow = null;
      this.unshift(prompt);
    }
  }

  /** After a local slash command, or when an edit hold ends and nothing is running. */
  takeIfIdle(): QueuedPrompt | null {
    if (this._busy) {
      return null;
    }
    return this.takeNext();
  }

  enqueue(text: string, images?: QueuedImage[], id?: string): QueuedPrompt {
    const prompt = createQueuedPrompt(text, images, id);
    if (!isSendable(prompt)) {
      throw new Error(EMPTY_FOLLOW_UP);
    }
    if (this.queue.length >= MAX_FOLLOW_UPS) {
      throw new Error(QUEUE_FULL);
    }
    this.queue.push(prompt);
    return prompt;
  }

  update(id: string, text: string): 'updated' | 'missing' {
    const prompt = this.find(id);
    if (!prompt) {
      return 'missing';
    }
    prompt.text = text.trim();
    return 'updated';
  }

  remove(id: string): boolean {
    if (this.sendNow?.id === id) {
      this.sendNow = null;
      return true;
    }
    const idx = this.queue.findIndex((q) => q.id === id);
    if (idx < 0) {
      return false;
    }
    this.queue.splice(idx, 1);
    return true;
  }

  /** Hold only a waiting row. The send-now slot is already committed. */
  hold(id: string, held: boolean): boolean {
    const prompt = this.queue.find((q) => q.id === id);
    if (!prompt) {
      return false;
    }
    prompt.held = held ? true : undefined;
    return true;
  }

  /**
   * Interruptive send. A composer draft wins over the queue; an explicit row
   * id wins over the draft. While busy, the chosen prompt is stored and the
   * caller cancels the turn — it is not sent until `releaseTurn`.
   * Replacing a previous send-now puts that prompt back at the front.
   * A turn that just started is not cancelled: a draft is queued behind it
   * and an empty send-now is ignored (CLI 1.0.84).
   */
  armSendNow(
    req: { text?: string; images?: QueuedImage[]; id?: string },
    now = Date.now()
  ): SendNowResult {
    if (this._busy && this.isFreshTurn(now)) {
      return this.deferFreshSendNow(req);
    }
    const picked = this.pickSendNow(req);
    if (!picked) {
      return { action: 'ignore' };
    }
    if (!this._busy) {
      return { action: 'send', prompt: picked.prompt, origin: picked.origin };
    }
    if (this.sendNow) {
      this.queue.unshift(this.sendNow);
    }
    this.sendNow = picked.prompt;
    return { action: 'cancel', prompt: picked.prompt, origin: picked.origin };
  }

  /** Queue a draft behind a turn that just started. Do not cancel that turn. */
  private deferFreshSendNow(req: {
    text?: string;
    images?: QueuedImage[];
    id?: string;
  }): SendNowResult {
    if (!req.id) {
      const draft = createQueuedPrompt(req.text ?? '', req.images);
      if (isSendable(draft)) {
        if (this.queue.length >= MAX_FOLLOW_UPS) {
          throw new Error(QUEUE_FULL);
        }
        this.queue.push(draft);
        return { action: 'queued', prompt: draft, origin: 'draft' };
      }
    }
    return { action: 'ignore' };
  }

  /** Put a prompt back (turn never reached the agent, or the process is gone). */
  unshift(prompt: QueuedPrompt): void {
    if (this.queue.some((q) => q.id === prompt.id) || this.sendNow?.id === prompt.id) {
      return;
    }
    this.queue.unshift(prompt);
  }

  snapshot(): FollowUpQueueItem[] {
    const out: FollowUpQueueItem[] = [];
    if (this.sendNow) {
      out.push(toItem(this.sendNow, true));
    }
    for (const prompt of this.queue) {
      out.push(toItem(prompt, false));
    }
    return out;
  }

  private find(id: string): QueuedPrompt | undefined {
    if (this.sendNow?.id === id) {
      return this.sendNow;
    }
    return this.queue.find((q) => q.id === id);
  }

  private pickSendNow(req: {
    text?: string;
    images?: QueuedImage[];
    id?: string;
  }): { prompt: QueuedPrompt; origin: SendNowOrigin } | null {
    if (req.id) {
      if (this.sendNow?.id === req.id) {
        const prompt = this.sendNow;
        this.sendNow = null;
        prompt.held = undefined;
        return { prompt, origin: 'queue' };
      }
      const idx = this.queue.findIndex((q) => q.id === req.id);
      if (idx >= 0) {
        const [prompt] = this.queue.splice(idx, 1);
        prompt.held = undefined;
        return { prompt, origin: 'queue' };
      }
    }
    const draft = createQueuedPrompt(req.text ?? '', req.images);
    if (isSendable(draft)) {
      return { prompt: draft, origin: 'draft' };
    }
    const top = this.queue[0];
    // A row being edited (or empty) cannot be sent now; leave the turn running.
    if (!top || top.held || !isSendable(top)) {
      return null;
    }
    this.queue.shift();
    return { prompt: top, origin: 'queue' };
  }

  private takeNext(): QueuedPrompt | null {
    if (this.sendNow) {
      const prompt = this.sendNow;
      this.sendNow = null;
      return prompt;
    }
    const idx = this.queue.findIndex((q) => !q.held && isSendable(q));
    if (idx < 0) {
      return null;
    }
    return this.queue.splice(idx, 1)[0];
  }
}

function toItem(prompt: QueuedPrompt, sendNow: boolean): FollowUpQueueItem {
  return {
    id: prompt.id,
    text: prompt.text,
    imageCount: prompt.images?.length ?? 0,
    held: prompt.held || undefined,
    sendNow: sendNow || undefined,
  };
}

/**
 * End the in-flight turn. When `dispatched` is false the turn never reached
 * `session/prompt` (session not ready): the next prompt is put back so a
 * failure does not retry in a loop. `hold` keeps the queue and does not
 * send (user pressed Stop). Returns the prompt to send next, or null.
 */
export function settleTurn(
  gate: FollowUpGate,
  dispatched: boolean,
  disposition: QueueDisposition = 'continue'
): QueuedPrompt | null {
  if (!gate.busy) {
    return null;
  }
  if (disposition === 'hold') {
    gate.holdTurn();
    return null;
  }
  const next = gate.releaseTurn();
  if (!next) {
    return null;
  }
  if (!dispatched) {
    gate.unshift(next);
    return null;
  }
  return next;
}
