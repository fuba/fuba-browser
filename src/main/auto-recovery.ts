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
 *  - Wrapping every reset entry point (POST /api/reset, setDeviceProfile,
 *    and the automatic recovery path itself) so that the "expected reset"
 *    guard covers self-inflicted close/disconnect events fired while the
 *    old page/context/browser are torn down.
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
}

const DEFAULT_INTERVAL_MS = 60_000;
const DEFAULT_BACKOFF_MS = [1_000, 5_000, 15_000];
const DEFAULT_MAX_CONSECUTIVE_FAILURES = 3;

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

  private watchdogTimer: ReturnType<typeof setInterval> | null = null;
  // Depth counter (not a boolean) so nested begin/end pairs from overlapping
  // callers can never under-count and drop the guard early.
  private expectedResetDepth = 0;
  private recovering = false;
  private consecutiveFailures = 0;

  constructor(deps: AutoRecoveryDeps) {
    this.resetFn = deps.reset;
    this.checkHealthFn = deps.checkHealth;
    this.onFatal = deps.onFatal;
    this.log = deps.log ?? ((message: string) => console.error(message));
    this.intervalMs = deps.intervalMs ?? DEFAULT_INTERVAL_MS;
    this.backoffMs = deps.backoffMs ?? DEFAULT_BACKOFF_MS;
    this.maxConsecutiveFailures = deps.maxConsecutiveFailures ?? DEFAULT_MAX_CONSECUTIVE_FAILURES;
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
   * duplicate/competing recovery.
   */
  beginExpectedReset(): void {
    this.expectedResetDepth += 1;
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

  private async runWatchdogCheck(): Promise<void> {
    if (this.expectedResetInProgress || this.recovering) {
      // A manual reset or an already-running recovery is in progress; skip silently.
      return;
    }

    let result: AutoRecoveryHealthResult;
    try {
      result = await this.checkHealthFn();
    } catch (error) {
      result = { ok: false, error: error instanceof Error ? error.message : String(error) };
    }

    if (!result.ok) {
      this.notifyCrash('watchdog');
    }
  }

  private async runRecoveryLoop(): Promise<void> {
    let attempt = 0;

    for (;;) {
      attempt += 1;

      // Guard the reset call itself: resetFn() closes the old
      // page/context/browser, which fires the very events this module
      // listens for. Suppress them for the duration of the attempt.
      this.beginExpectedReset();
      try {
        await this.resetFn();
        this.endExpectedReset();
        this.consecutiveFailures = 0;
        this.log('[System] Auto-recovery succeeded');
        return;
      } catch (error) {
        this.endExpectedReset();
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

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => {
      const timer = setTimeout(resolve, ms);
      timer.unref?.();
    });
  }
}
