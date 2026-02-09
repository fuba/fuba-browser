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

  it('consumes a valid token and returns metadata', () => {
    const store = new TokenStore(60);
    const { token } = store.createToken();

    const result = store.consumeToken(token);
    expect(result).not.toBeNull();
    expect(result).toEqual({});
  });

  it('rejects a token that has already been consumed', () => {
    const store = new TokenStore(60);
    const { token } = store.createToken();

    expect(store.consumeToken(token)).not.toBeNull();
    expect(store.consumeToken(token)).toBeNull();
  });

  it('rejects an unknown token', () => {
    const store = new TokenStore(60);
    expect(store.consumeToken('nonexistent')).toBeNull();
  });

  it('rejects an expired token', () => {
    const store = new TokenStore(10);
    const { token } = store.createToken();

    // Advance time past TTL
    vi.advanceTimersByTime(11 * 1000);

    expect(store.consumeToken(token)).toBeNull();
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
    expect(store.consumeToken(token)).not.toBeNull();
  });

  it('expired token at default TTL boundary', () => {
    const store = new TokenStore();
    const { token } = store.createToken();

    // Expired at 301 seconds
    vi.advanceTimersByTime(301 * 1000);
    expect(store.consumeToken(token)).toBeNull();
  });

  it('stores and returns metadata with vncHost', () => {
    const store = new TokenStore(60);
    const { token } = store.createToken({ vncHost: 'puma2:39101' });

    const result = store.consumeToken(token);
    expect(result).toEqual({ vncHost: 'puma2:39101' });
  });

  it('returns empty metadata when created without metadata', () => {
    const store = new TokenStore(60);
    const { token } = store.createToken();

    const result = store.consumeToken(token);
    expect(result).toEqual({});
  });

  it('stores and returns metadata with vncPassword', () => {
    const store = new TokenStore(60);
    const { token } = store.createToken({ vncPassword: 'random123' });

    const result = store.consumeToken(token);
    expect(result).toEqual({ vncPassword: 'random123' });
  });

  it('stores and returns metadata with both vncHost and vncPassword', () => {
    const store = new TokenStore(60);
    const { token } = store.createToken({ vncHost: 'puma2:39101', vncPassword: 'abc12345' });

    const result = store.consumeToken(token);
    expect(result).toEqual({ vncHost: 'puma2:39101', vncPassword: 'abc12345' });
  });
});
