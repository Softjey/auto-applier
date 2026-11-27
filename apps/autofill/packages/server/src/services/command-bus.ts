import { randomUUID } from 'node:crypto';
import type { Command, CommandEnvelope, ExtResultRequest } from '@applier/protocol';

/** How long the extension's long-poll waits for a command before it asks again. */
export const POLL_MS = 20_000;
/** A service worker polls every ≤20 s while awake; this long without one means it is not there. */
const CONNECTED_WITHIN_MS = 45_000;

interface Waiting {
  resolve: (cmd: CommandEnvelope | null) => void;
  timer: ReturnType<typeof setTimeout>;
}
interface Pending {
  resolve: (data: unknown) => void;
  reject: (e: Error) => void;
  timer: ReturnType<typeof setTimeout>;
  pickedUp: boolean;
}

/**
 * The agent's commands to the extension. The extension is the only thing that can act inside
 * the user's real Chrome, and it can only be reached by asking: a service worker cannot listen.
 * So the agent's call waits here, the extension's long-poll takes the command, and its result
 * resolves the call.
 */
export class CommandBus {
  private queue: CommandEnvelope[] = [];
  private waiting: Waiting | null = null;
  private pending = new Map<string, Pending>();
  private lastPoll = 0;

  constructor(private readonly now: () => number = Date.now) {}

  /** Has an extension polled recently? */
  get connected(): boolean {
    return this.now() - this.lastPoll < CONNECTED_WITHIN_MS;
  }

  /** Resolves with the extension's answer, or rejects when it answers with an error / never does. */
  dispatch(command: Command, timeoutMs: number): Promise<unknown> {
    const id = randomUUID();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        const entry = this.pending.get(id);
        this.pending.delete(id);
        this.queue = this.queue.filter((e) => e.id !== id);
        reject(
          new Error(
            entry?.pickedUp
              ? `The extension took the command but gave no result in ${Math.round(timeoutMs / 1000)} s.`
              : this.connected
                ? 'The extension is connected but did not pick the command up.'
                : 'The Applier extension is not connected. Is Chrome open with the extension loaded (chrome://extensions → reload it once)?',
          ),
        );
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer, pickedUp: false });
      this.offer({ id, command });
    });
  }

  private offer(envelope: CommandEnvelope): void {
    if (this.waiting) {
      this.take(envelope);
      this.waiting.resolve(envelope);
      return;
    }
    this.queue.push(envelope);
  }

  private take(envelope: CommandEnvelope): void {
    const entry = this.pending.get(envelope.id);
    if (entry) entry.pickedUp = true;
  }

  /** The extension's long-poll. Null = nothing came; ask again. */
  next(signal?: AbortSignal): Promise<CommandEnvelope | null> {
    this.lastPoll = this.now();
    const queued = this.queue.shift();
    if (queued) {
      this.take(queued);
      return Promise.resolve(queued);
    }
    // One extension, one poll: a newer poll replaces a stale one (a restarted worker).
    this.waiting?.resolve(null);
    return new Promise((resolve) => {
      const finish = (cmd: CommandEnvelope | null) => {
        if (this.waiting?.resolve === finish) this.waiting = null;
        clearTimeout(timer);
        resolve(cmd);
      };
      const timer = setTimeout(() => finish(null), POLL_MS);
      this.waiting = { resolve: finish, timer };
      signal?.addEventListener('abort', () => finish(null), { once: true });
    });
  }

  result(res: ExtResultRequest): boolean {
    const entry = this.pending.get(res.id);
    if (!entry) return false;
    this.pending.delete(res.id);
    clearTimeout(entry.timer);
    if (res.ok) entry.resolve(res.data);
    else entry.reject(new Error(res.error));
    return true;
  }
}
