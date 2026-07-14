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
});
