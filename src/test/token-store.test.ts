import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TokenStore } from '../server/token-store.js';

describe('TokenStore', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('creates a token with expected format', () => {
    const store = new TokenStore(60);
    const { token, expiresAt } = store.createToken();

    expect(token).toMatch(/^[0-9a-f]{64}$/);
    expect(expiresAt).toBeInstanceOf(Date);
    expect(expiresAt.getTime()).toBe(Date.now() + 60 * 1000);
  });

  it('consumes a valid token and returns true', () => {
    const store = new TokenStore(60);
    const { token } = store.createToken();

    expect(store.consumeToken(token)).toBe(true);
  });

  it('rejects a token that has already been consumed', () => {
    const store = new TokenStore(60);
    const { token } = store.createToken();

    expect(store.consumeToken(token)).toBe(true);
    expect(store.consumeToken(token)).toBe(false);
  });

  it('rejects an unknown token', () => {
    const store = new TokenStore(60);
    expect(store.consumeToken('nonexistent')).toBe(false);
  });

  it('rejects an expired token', () => {
    const store = new TokenStore(10);
    const { token } = store.createToken();

    // Advance time past TTL
    vi.advanceTimersByTime(11 * 1000);

    expect(store.consumeToken(token)).toBe(false);
  });

  it('purges expired tokens on createToken', () => {
    const store = new TokenStore(10);
    store.createToken();
    store.createToken();
    expect(store.size).toBe(2);

    // Advance time past TTL
    vi.advanceTimersByTime(11 * 1000);

    // Creating a new token triggers purge
    store.createToken();
    expect(store.size).toBe(1);
  });

  it('uses default TTL of 300 seconds when not specified', () => {
    const store = new TokenStore();
    const { token } = store.createToken();

    // Still valid at 299 seconds
    vi.advanceTimersByTime(299 * 1000);
    expect(store.consumeToken(token)).toBe(true);
  });

  it('expired token at default TTL boundary', () => {
    const store = new TokenStore();
    const { token } = store.createToken();

    // Expired at 301 seconds
    vi.advanceTimersByTime(301 * 1000);
    expect(store.consumeToken(token)).toBe(false);
  });
});
