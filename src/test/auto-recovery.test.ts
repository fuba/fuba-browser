import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AutoRecovery, AutoRecoveryHealthResult } from '../main/auto-recovery.js';

describe('AutoRecovery', () => {
  let reset: ReturnType<typeof vi.fn<() => Promise<void>>>;
  let checkHealth: ReturnType<typeof vi.fn<() => Promise<AutoRecoveryHealthResult>>>;
  let onFatal: ReturnType<typeof vi.fn>;
  let log: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useFakeTimers();
    reset = vi.fn().mockResolvedValue(undefined);
    checkHealth = vi.fn().mockResolvedValue({ ok: true });
    onFatal = vi.fn();
    log = vi.fn();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function makeAutoRecovery(overrides: Partial<ConstructorParameters<typeof AutoRecovery>[0]> = {}) {
    return new AutoRecovery({
      reset,
      checkHealth,
      onFatal,
      log,
      backoffMs: [1_000, 5_000, 15_000],
      maxConsecutiveFailures: 3,
      intervalMs: 60_000,
      ...overrides,
    });
  }

  it('crash notification triggers exactly one reset', async () => {
    const autoRecovery = makeAutoRecovery();

    autoRecovery.notifyCrash('crash');
    await vi.advanceTimersByTimeAsync(0);

    expect(reset).toHaveBeenCalledTimes(1);
    expect(log).toHaveBeenCalledWith(expect.stringContaining('page crash event'));
    expect(log).toHaveBeenCalledWith('[System] Auto-recovery succeeded');
  });

  it('notifications during an in-flight recovery coalesce (no second reset)', async () => {
    let resolveReset: (() => void) | undefined;
    reset.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolveReset = resolve;
        })
    );
    const autoRecovery = makeAutoRecovery();

    autoRecovery.notifyCrash('crash');
    // Fired synchronously in the same tick, before the first reset() resolves.
    autoRecovery.notifyCrash('disconnected');
    autoRecovery.notifyCrash('crash');

    // The recovery loop's first attempt is dispatched through the reset
    // serializer (AutoRecovery.runSerializedReset, added for Fix 1), which
    // always defers invoking resetFn() by one microtask - even against an
    // idle queue - so every reset attempt goes through one consistent path.
    // Flush that microtask before asserting.
    await vi.advanceTimersByTimeAsync(0);
    expect(reset).toHaveBeenCalledTimes(1);

    resolveReset?.();
    await vi.advanceTimersByTimeAsync(0);

    expect(reset).toHaveBeenCalledTimes(1);
  });

  it('events during an expected/manual reset are ignored', async () => {
    const autoRecovery = makeAutoRecovery();

    autoRecovery.beginExpectedReset();
    autoRecovery.notifyCrash('crash');
    autoRecovery.notifyCrash('disconnected');
    await vi.advanceTimersByTimeAsync(0);

    expect(reset).not.toHaveBeenCalled();

    autoRecovery.endExpectedReset();
    autoRecovery.notifyCrash('crash');
    await vi.advanceTimersByTimeAsync(0);

    expect(reset).toHaveBeenCalledTimes(1);
  });

  it('nested beginExpectedReset/endExpectedReset pairs never drop the guard early', async () => {
    const autoRecovery = makeAutoRecovery();

    autoRecovery.beginExpectedReset();
    autoRecovery.beginExpectedReset();
    autoRecovery.endExpectedReset();
    autoRecovery.notifyCrash('crash');
    await vi.advanceTimersByTimeAsync(0);

    // Still one begin() outstanding -> guard still active.
    expect(reset).not.toHaveBeenCalled();

    autoRecovery.endExpectedReset();
    autoRecovery.notifyCrash('crash');
    await vi.advanceTimersByTimeAsync(0);

    expect(reset).toHaveBeenCalledTimes(1);
  });

  it('watchdog fires reset when checkHealth reports unhealthy and skips while recovering', async () => {
    checkHealth.mockResolvedValue({ ok: false, error: 'Target crashed' });
    // Never resolves, so the recovery stays "in progress" across the next tick.
    reset.mockImplementation(() => new Promise<void>(() => {}));
    const autoRecovery = makeAutoRecovery({ intervalMs: 1_000 });

    autoRecovery.start();

    await vi.advanceTimersByTimeAsync(1_000);
    expect(checkHealth).toHaveBeenCalledTimes(1);
    expect(reset).toHaveBeenCalledTimes(1);

    // Second tick: recovery is still in flight (reset() never resolved), so
    // the watchdog must skip silently without even calling checkHealth again.
    await vi.advanceTimersByTimeAsync(1_000);
    expect(checkHealth).toHaveBeenCalledTimes(1);
    expect(reset).toHaveBeenCalledTimes(1);

    autoRecovery.stop();
  });

  it('watchdog does nothing while checkHealth reports healthy', async () => {
    const autoRecovery = makeAutoRecovery({ intervalMs: 1_000 });
    autoRecovery.start();

    await vi.advanceTimersByTimeAsync(3_000);

    expect(checkHealth).toHaveBeenCalledTimes(3);
    expect(reset).not.toHaveBeenCalled();

    autoRecovery.stop();
  });

  it('stop() cancels the watchdog', async () => {
    const autoRecovery = makeAutoRecovery({ intervalMs: 1_000 });
    autoRecovery.start();
    autoRecovery.stop();

    await vi.advanceTimersByTimeAsync(10_000);

    expect(checkHealth).not.toHaveBeenCalled();
  });

  it('retries failed recovery attempts with backoff and calls onFatal after 3 consecutive failures', async () => {
    reset.mockRejectedValue(new Error('Target crashed'));
    const autoRecovery = makeAutoRecovery({ backoffMs: [1_000, 5_000, 15_000], maxConsecutiveFailures: 3 });

    autoRecovery.notifyCrash('crash');

    // Attempt 1 fails immediately (microtask), then backs off 1000ms.
    await vi.advanceTimersByTimeAsync(0);
    expect(reset).toHaveBeenCalledTimes(1);
    expect(onFatal).not.toHaveBeenCalled();

    // Attempt 2 runs after the 1s backoff, fails, backs off 5000ms.
    await vi.advanceTimersByTimeAsync(1_000);
    expect(reset).toHaveBeenCalledTimes(2);
    expect(onFatal).not.toHaveBeenCalled();

    // Attempt 3 runs after the 5s backoff, fails -> 3 consecutive failures -> escalate.
    await vi.advanceTimersByTimeAsync(5_000);
    expect(reset).toHaveBeenCalledTimes(3);
    expect(onFatal).toHaveBeenCalledTimes(1);
    expect(onFatal.mock.calls[0][0]).toContain('3 consecutive times');

    // No further retries scheduled after escalation.
    await vi.advanceTimersByTimeAsync(60_000);
    expect(reset).toHaveBeenCalledTimes(3);
  });

  it('a successful recovery resets the consecutive-failure counter', async () => {
    reset
      .mockRejectedValueOnce(new Error('fail 1'))
      .mockRejectedValueOnce(new Error('fail 2'))
      .mockResolvedValueOnce(undefined) // succeeds on the 3rd attempt -> counter resets to 0
      .mockRejectedValueOnce(new Error('fail 3'))
      .mockRejectedValueOnce(new Error('fail 4'))
      .mockRejectedValueOnce(new Error('fail 5'));
    const autoRecovery = makeAutoRecovery({ backoffMs: [1_000, 5_000, 15_000], maxConsecutiveFailures: 3 });

    autoRecovery.notifyCrash('crash');
    await vi.advanceTimersByTimeAsync(0); // attempt 1 fails
    await vi.advanceTimersByTimeAsync(1_000); // attempt 2 fails
    await vi.advanceTimersByTimeAsync(5_000); // attempt 3 succeeds

    expect(reset).toHaveBeenCalledTimes(3);
    expect(onFatal).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith('[System] Auto-recovery succeeded');

    // New crash after the successful recovery: the failure counter must have
    // been reset to 0, so escalation only happens after 3 *new* failures,
    // not after 1 more (which would happen if the old count of 2 had leaked).
    autoRecovery.notifyCrash('disconnected');
    await vi.advanceTimersByTimeAsync(0); // attempt 4 (fail 3) fails
    expect(onFatal).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1_000); // attempt 5 (fail 4) fails
    expect(onFatal).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(5_000); // attempt 6 (fail 5) fails -> 3 consecutive -> escalate
    expect(reset).toHaveBeenCalledTimes(6);
    expect(onFatal).toHaveBeenCalledTimes(1);
  });

  // --- Fix 1: serialize ALL reset executions -------------------------------

  it('a manual reset and a crash-triggered recovery never run resetFn() concurrently', async () => {
    let entered = false;
    let overlapDetected = false;
    const resolvers: Array<() => void> = [];
    reset.mockImplementation(() => {
      if (entered) {
        overlapDetected = true;
      }
      entered = true;
      return new Promise<void>((resolve) => {
        resolvers.push(() => {
          entered = false;
          resolve();
        });
      });
    });
    const autoRecovery = makeAutoRecovery();

    // A "manual" reset (e.g. POST /api/reset) and a crash notification
    // arriving back-to-back, before either resetFn() call has settled.
    const manualPromise = autoRecovery.requestManualReset();
    autoRecovery.notifyCrash('crash');
    await vi.advanceTimersByTimeAsync(0);

    // Only the manual reset's call should have started; the recovery loop's
    // attempt must be queued behind it, not running concurrently.
    expect(reset).toHaveBeenCalledTimes(1);
    expect(resolvers).toHaveLength(1);

    // Release the manual reset; only now should the recovery loop's queued
    // attempt actually start.
    resolvers[0]();
    await vi.advanceTimersByTimeAsync(0);

    expect(reset).toHaveBeenCalledTimes(2);
    expect(resolvers).toHaveLength(2);
    resolvers[1]();

    await manualPromise;
    await vi.advanceTimersByTimeAsync(0);

    expect(overlapDetected).toBe(false);
    expect(log).toHaveBeenCalledWith('[System] Auto-recovery succeeded');
  });

  // --- Fix 2: timeout on recovery reset attempts ---------------------------

  it('a reset attempt that never resolves times out and counts as a failure; 3 consecutive timeouts escalate to onFatal', async () => {
    // Simulates a wedged page.close()/context.close()/browser.close() that
    // never settles.
    reset.mockImplementation(() => new Promise<void>(() => {}));
    const autoRecovery = makeAutoRecovery({
      backoffMs: [1_000, 5_000, 15_000],
      maxConsecutiveFailures: 3,
      resetTimeoutMs: 10_000,
    });

    autoRecovery.notifyCrash('crash');

    // Attempt 1: resetFn() never resolves; after resetTimeoutMs it's a failure.
    await vi.advanceTimersByTimeAsync(10_000);
    expect(reset).toHaveBeenCalledTimes(1);
    expect(onFatal).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith(expect.stringContaining('timed out'));

    // Attempt 2: backoff 1s, then times out again after another
    // resetTimeoutMs. The original resetFn() call is still wedged and still
    // occupying the serializer queue (see runSerializedReset's doc comment),
    // so resetFn() itself is NOT invoked a second time here - only the
    // recovery loop's own wait against resetTimeoutMs fires, which is
    // exactly what keeps the failure-counting/escalation machinery alive.
    await vi.advanceTimersByTimeAsync(1_000 + 10_000);
    expect(reset).toHaveBeenCalledTimes(1);
    expect(onFatal).not.toHaveBeenCalled();

    // Attempt 3: backoff 5s, times out -> 3 consecutive failures -> escalate.
    await vi.advanceTimersByTimeAsync(5_000 + 10_000);
    expect(reset).toHaveBeenCalledTimes(1);
    expect(onFatal).toHaveBeenCalledTimes(1);
    expect(onFatal.mock.calls[0][0]).toContain('3 consecutive times');
  });

  // --- Fix 3: watchdog overlap + stale-result protection -------------------

  it('watchdog suppresses overlapping checks while a previous checkHealth() call is still in flight', async () => {
    let resolveCheck: ((r: AutoRecoveryHealthResult) => void) | undefined;
    checkHealth.mockImplementation(
      () =>
        new Promise<AutoRecoveryHealthResult>((resolve) => {
          resolveCheck = resolve;
        })
    );
    const autoRecovery = makeAutoRecovery({ intervalMs: 1_000 });
    autoRecovery.start();

    // First tick starts a check that doesn't resolve within this window.
    await vi.advanceTimersByTimeAsync(1_000);
    expect(checkHealth).toHaveBeenCalledTimes(1);

    // Two more ticks land while the first check is still in flight -> both skipped.
    await vi.advanceTimersByTimeAsync(2_000);
    expect(checkHealth).toHaveBeenCalledTimes(1);

    // Resolve the first check as healthy; the next tick should check again.
    resolveCheck?.({ ok: true });
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(checkHealth).toHaveBeenCalledTimes(2);
    expect(reset).not.toHaveBeenCalled();

    autoRecovery.stop();
  });

  it('a health check that never resolves times out and is treated as unhealthy, triggering recovery', async () => {
    checkHealth.mockImplementation(() => new Promise<AutoRecoveryHealthResult>(() => {}));
    const autoRecovery = makeAutoRecovery({ intervalMs: 1_000, healthCheckTimeoutMs: 5_000 });
    autoRecovery.start();

    await vi.advanceTimersByTimeAsync(1_000); // tick fires the check
    expect(checkHealth).toHaveBeenCalledTimes(1);
    expect(reset).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(5_000); // healthCheckTimeoutMs elapses -> treated as unhealthy
    expect(reset).toHaveBeenCalledTimes(1);
    expect(log).toHaveBeenCalledWith(expect.stringContaining('watchdog health check'));

    autoRecovery.stop();
  });

  it('discards a stale unhealthy watchdog result if a reset already happened while checkHealth() was in flight', async () => {
    let resolveCheck: ((r: AutoRecoveryHealthResult) => void) | undefined;
    checkHealth.mockImplementation(
      () =>
        new Promise<AutoRecoveryHealthResult>((resolve) => {
          resolveCheck = resolve;
        })
    );
    const autoRecovery = makeAutoRecovery({ intervalMs: 1_000 });
    autoRecovery.start();

    await vi.advanceTimersByTimeAsync(1_000);
    expect(checkHealth).toHaveBeenCalledTimes(1);

    // A manual reset (e.g. POST /api/reset) happens while the watchdog's
    // checkHealth() call is still in flight - this bumps resetGeneration.
    const manualResetPromise = autoRecovery.requestManualReset();
    await vi.advanceTimersByTimeAsync(0);
    expect(reset).toHaveBeenCalledTimes(1);

    // The stale checkHealth() call now resolves as unhealthy - it describes
    // the browser instance the manual reset already replaced.
    resolveCheck?.({ ok: false, error: 'Target crashed' });
    await vi.advanceTimersByTimeAsync(0);

    // Must NOT trigger a second, redundant recovery.
    expect(reset).toHaveBeenCalledTimes(1);
    expect(autoRecovery.isRecovering).toBe(false);

    await manualResetPromise;
    autoRecovery.stop();
  });
});
