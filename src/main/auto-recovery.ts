/**
 * Orchestrates automatic recovery of the Playwright browser after a crash or
 * unexpected disconnect.
 *
 * This module intentionally has no dependency on Playwright itself: it is
 * injected with a `reset()` function and a `checkHealth()` function so it can
 * be unit tested without a real browser. The caller (src/main/index.ts) is
 * responsible for:
 *  - Attaching `page.on('crash', ...)` / `browser.on('disconnected', ...)`
 *    handlers on the CURRENT page/browser after every (re)initialization, and
 *    calling `notifyCrash()` from them.
 *  - Routing EVERY reset entry point (POST /api/reset, setDeviceProfile,
 *    and the automatic recovery path itself) through this module - either
 *    via `requestManualReset()` or the internal recovery loop - so that (a)
 *    the "expected reset" guard covers self-inflicted close/disconnect
 *    events fired while the old page/context/browser are torn down, and (b)
 *    no two reset attempts ever run resetFn() concurrently (see
 *    runSerializedReset below).
 */

export type RecoveryTrigger = 'crash' | 'disconnected' | 'watchdog';

export interface AutoRecoveryHealthResult {
  ok: boolean;
  error?: string;
}

export interface AutoRecoveryDeps {
  /** Performs the actual browser reset (close + reinitialize). May throw/reject. */
  reset: () => Promise<void>;
  /** Reports current browser health; used by the watchdog. */
  checkHealth: () => Promise<AutoRecoveryHealthResult>;
  /** Called once recovery has failed maxConsecutiveFailures times in a row. */
  onFatal: (message: string) => void;
  /** Logging sink. Defaults to console.error. Messages already include the "[System]" prefix. */
  log?: (message: string) => void;
  /** Watchdog polling interval in ms. Defaults to 60000. */
  intervalMs?: number;
  /** Backoff delays (ms) between consecutive recovery attempts. Defaults to [1000, 5000, 15000]. */
  backoffMs?: number[];
  /** Consecutive recovery failures before escalating via onFatal. Defaults to 3. */
  maxConsecutiveFailures?: number;
  /**
   * Timeout (ms) for a single reset attempt (page.close/context.close/
   * browser.close + reinitialize). A wedged close can otherwise hang
   * `reset()` forever. Defaults to 120000.
   */
  resetTimeoutMs?: number;
  /**
   * Timeout (ms) for a single watchdog checkHealth() call. A frozen renderer
   * can make `page.evaluate()` hang forever; a timed-out check is treated as
   * UNHEALTHY. Defaults to 15000.
   */
  healthCheckTimeoutMs?: number;
}

const DEFAULT_INTERVAL_MS = 60_000;
const DEFAULT_BACKOFF_MS = [1_000, 5_000, 15_000];
const DEFAULT_MAX_CONSECUTIVE_FAILURES = 3;
const DEFAULT_RESET_TIMEOUT_MS = 120_000;
const DEFAULT_HEALTH_CHECK_TIMEOUT_MS = 15_000;

const TRIGGER_LABELS: Record<RecoveryTrigger, string> = {
  crash: 'page crash event',
  disconnected: 'browser disconnected event',
  watchdog: 'watchdog health check',
};

/**
 * Serializes browser-recovery attempts, suppresses self-inflicted events
 * fired while a reset (manual or automatic) is in progress, retries failed
 * recovery attempts with backoff, and escalates to a fatal callback after
 * too many consecutive failures.
 */
export class AutoRecovery {
  private readonly resetFn: () => Promise<void>;
  private readonly checkHealthFn: () => Promise<AutoRecoveryHealthResult>;
  private readonly onFatal: (message: string) => void;
  private readonly log: (message: string) => void;
  private readonly intervalMs: number;
  private readonly backoffMs: number[];
  private readonly maxConsecutiveFailures: number;
  private readonly resetTimeoutMs: number;
  private readonly healthCheckTimeoutMs: number;

  private watchdogTimer: ReturnType<typeof setInterval> | null = null;
  // Depth counter (not a boolean) so nested begin/end pairs from overlapping
  // callers can never under-count and drop the guard early.
  private expectedResetDepth = 0;
  private recovering = false;
  private consecutiveFailures = 0;
  // True while a watchdog checkHealth() call is in flight, so setInterval
  // ticks that land before it settles are skipped instead of piling up
  // concurrent checks (fix for overlapping-watchdog issue).
  private watchdogCheckInFlight = false;
  // Bumped by beginExpectedReset() - i.e. on every manual or recovery-loop
  // reset attempt. A watchdog check captures this before awaiting
  // checkHealth(); if it changed by the time the check settles, a reset
  // happened concurrently and the (possibly stale/unhealthy) result no
  // longer describes the current browser instance, so it's discarded rather
  // than triggering a redundant recovery.
  private resetGeneration = 0;
  // Serializes every reset attempt (manual POST /api/reset, setDeviceProfile,
  // and the recovery loop's own attempts) into a single FIFO queue so
  // resetFn() (which tears down and rebuilds the module-level
  // browser/context/page state) never runs concurrently with itself. See
  // runSerializedReset() for why the chain never gets poisoned by a
  // rejected/timed-out link.
  private resetQueue: Promise<void> = Promise.resolve();

  constructor(deps: AutoRecoveryDeps) {
    this.resetFn = deps.reset;
    this.checkHealthFn = deps.checkHealth;
    this.onFatal = deps.onFatal;
    this.log = deps.log ?? ((message: string) => console.error(message));
    this.intervalMs = deps.intervalMs ?? DEFAULT_INTERVAL_MS;
    this.backoffMs = deps.backoffMs ?? DEFAULT_BACKOFF_MS;
    this.maxConsecutiveFailures = deps.maxConsecutiveFailures ?? DEFAULT_MAX_CONSECUTIVE_FAILURES;
    this.resetTimeoutMs = deps.resetTimeoutMs ?? DEFAULT_RESET_TIMEOUT_MS;
    this.healthCheckTimeoutMs = deps.healthCheckTimeoutMs ?? DEFAULT_HEALTH_CHECK_TIMEOUT_MS;
  }

  /** Start the periodic health-check watchdog (belt-and-braces for missed events). */
  start(): void {
    if (this.watchdogTimer) {
      return;
    }
    this.watchdogTimer = setInterval(() => {
      void this.runWatchdogCheck();
    }, this.intervalMs);
    // Never keep the process alive just for the watchdog.
    this.watchdogTimer.unref?.();
  }

  /** Stop the watchdog. Safe to call multiple times. */
  stop(): void {
    if (this.watchdogTimer) {
      clearInterval(this.watchdogTimer);
      this.watchdogTimer = null;
    }
  }

  /**
   * Mark that a reset is about to happen deliberately (manual POST /api/reset,
   * setDeviceProfile, or this module's own recovery attempts). While the
   * guard is active, notifyCrash() and the watchdog ignore incoming events
   * so tearing down the old page/context/browser can never trigger a
   * duplicate/competing recovery. Also bumps resetGeneration (see field doc)
   * so any watchdog check already in flight knows to discard its result.
   */
  beginExpectedReset(): void {
    this.expectedResetDepth += 1;
    this.resetGeneration += 1;
  }

  /** Pair with beginExpectedReset(). Never goes below zero. */
  endExpectedReset(): void {
    this.expectedResetDepth = Math.max(0, this.expectedResetDepth - 1);
  }

  private get expectedResetInProgress(): boolean {
    return this.expectedResetDepth > 0;
  }

  /** True while a recovery attempt (including its backoff retries) is running. */
  get isRecovering(): boolean {
    return this.recovering;
  }

  /**
   * Report a crash/disconnect event and (unless suppressed) start recovery.
   * Safe to call repeatedly: concurrent notifications while a recovery is
   * already in flight are coalesced into that single recovery.
   */
  notifyCrash(reason: RecoveryTrigger): void {
    if (this.expectedResetInProgress) {
      // Self-inflicted event from a reset we already know about; ignore.
      return;
    }
    if (this.recovering) {
      this.log(`[System] Auto-recovery already in progress; ignoring additional ${TRIGGER_LABELS[reason]}`);
      return;
    }

    // Set the flag synchronously (before any await) so any notifyCrash()
    // call re-entering later in this same tick coalesces correctly.
    this.recovering = true;
    this.log(`[System] Auto-recovery triggered by ${TRIGGER_LABELS[reason]}`);

    void this.runRecoveryLoop().finally(() => {
      this.recovering = false;
    });
  }

  /**
   * Runs a single reset attempt outside the recovery loop's retry/backoff/
   * escalation machinery - the entry point for manual resets (POST
   * /api/reset, setDeviceProfile). It is serialized against the recovery
   * loop's own attempts through the SAME queue (runSerializedReset), and
   * subject to the same resetTimeoutMs, so a manual caller can't hang
   * forever behind (or race) an automatic recovery attempt. Unlike
   * notifyCrash(), a failure here rejects back to the caller instead of
   * retrying - the HTTP layer decides what to do next (e.g. return 500).
   */
  async requestManualReset(): Promise<void> {
    await this.withTimeout(this.runSerializedReset(() => this.resetFn()), this.resetTimeoutMs, 'Browser reset');
  }

  /**
   * Chains `fn` onto the single reset queue so it can never run concurrently
   * with another reset attempt (manual or recovery-loop). Wraps execution in
   * the beginExpectedReset/endExpectedReset guard.
   *
   * Uses `.then(run, run)` (not `.finally`) so a REJECTED link still hands
   * off to the next queued caller: the queue's own continuation always
   * resolves (its rejection is swallowed via the trailing `.then(noop, noop)`
   * below), while each individual caller still observes their own attempt's
   * real outcome through the `result` promise this method returns. Without
   * this, a single failed/timed-out reset would permanently wedge every
   * future reset behind a queue that never advances.
   *
   * Note: if `fn()` itself never settles (e.g. a wedged browser.close()),
   * the queue genuinely stalls - subsequent callers' `run` never even
   * starts executing (so resetFn() is not invoked again on their behalf).
   * That is intentional: invoking resetFn() again while a previous call is
   * still in flight is exactly the concurrent-teardown bug this method
   * exists to prevent. Callers that need to make progress regardless (the
   * recovery loop, via resetTimeoutMs) race the *outer* promise this method
   * returns against a timeout instead of trying to cancel/un-stick `fn()`.
   */
  private runSerializedReset(fn: () => Promise<void>): Promise<void> {
    const run = async (): Promise<void> => {
      this.beginExpectedReset();
      try {
        await fn();
      } finally {
        this.endExpectedReset();
      }
    };

    const result = this.resetQueue.then(run, run);
    this.resetQueue = result.then(
      () => undefined,
      () => undefined
    );
    return result;
  }

  private async runWatchdogCheck(): Promise<void> {
    if (this.expectedResetInProgress || this.recovering) {
      // A manual reset or an already-running recovery is in progress; skip silently.
      return;
    }
    if (this.watchdogCheckInFlight) {
      // A previous check (e.g. page.evaluate() stuck on a frozen renderer)
      // hasn't settled yet; skip this tick rather than piling up concurrent
      // checkHealth() calls.
      return;
    }

    this.watchdogCheckInFlight = true;
    const generationAtStart = this.resetGeneration;
    try {
      const result = await this.withTimeout(this.checkHealthFn(), this.healthCheckTimeoutMs, 'Health check').catch(
        (error): AutoRecoveryHealthResult => ({
          ok: false,
          error: error instanceof Error ? error.message : String(error),
        })
      );

      if (this.resetGeneration !== generationAtStart) {
        // A reset started (or completed) while we were awaiting checkHealth;
        // this result may describe a browser instance we've already
        // replaced, or duplicate a recovery already in flight. Discard it.
        return;
      }

      if (!result.ok) {
        this.notifyCrash('watchdog');
      }
    } finally {
      this.watchdogCheckInFlight = false;
    }
  }

  private async runRecoveryLoop(): Promise<void> {
    let attempt = 0;

    for (;;) {
      attempt += 1;

      try {
        // Race the serialized reset attempt against resetTimeoutMs. This
        // does NOT cancel/un-stick a wedged resetFn() - see
        // runSerializedReset's doc comment - it only stops US from waiting
        // on it forever, so consecutiveFailures/backoff/onFatal keep
        // running. onFatal exits the process (supervisord restarts it
        // whole), which is what actually clears a permanently wedged close.
        await this.withTimeout(this.runSerializedReset(() => this.resetFn()), this.resetTimeoutMs, 'Browser reset');
        this.consecutiveFailures = 0;
        this.log('[System] Auto-recovery succeeded');
        return;
      } catch (error) {
        this.consecutiveFailures += 1;
        const message = error instanceof Error ? error.message : String(error);
        this.log(
          `[System] Auto-recovery attempt ${attempt} failed (consecutive failures: ${this.consecutiveFailures}): ${message}`
        );

        if (this.consecutiveFailures >= this.maxConsecutiveFailures) {
          const fatalMessage =
            `[System] Auto-recovery failed ${this.consecutiveFailures} consecutive times; ` +
            'giving up on in-process recovery and exiting so supervisord can restart cleanly.';
          this.log(fatalMessage);
          this.onFatal(fatalMessage);
          return;
        }

        const delay = this.backoffMs[Math.min(attempt - 1, this.backoffMs.length - 1)];
        await this.sleep(delay);
      }
    }
  }

  /**
   * Races `promise` against a `ms`-millisecond timer. If the timer fires
   * first, the returned promise rejects with a timeout Error; the original
   * `promise` is left to settle on its own (we attach a no-op handler to it
   * so a late resolution/rejection can never surface as an unhandled
   * rejection), but its result is otherwise ignored - the loser of the race
   * never leaks into the caller.
   */
  private withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      let settled = false;

      const timer = setTimeout(() => {
        if (settled) {
          return;
        }
        settled = true;
        reject(new Error(`${label} timed out after ${ms}ms`));
      }, ms);
      timer.unref?.();

      promise.then(
        (value) => {
          if (settled) {
            return;
          }
          settled = true;
          clearTimeout(timer);
          resolve(value);
        },
        (error) => {
          if (settled) {
            return;
          }
          settled = true;
          clearTimeout(timer);
          reject(error);
        }
      );
    });
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => {
      const timer = setTimeout(resolve, ms);
      timer.unref?.();
    });
  }
}
