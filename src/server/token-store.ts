import crypto from 'node:crypto';

const DEFAULT_TTL_SECONDS = 300; // 5 minutes

interface TokenEntry {
  expiresAt: number; // Unix timestamp in ms
}

export class TokenStore {
  private readonly tokens = new Map<string, TokenEntry>();
  private readonly ttlMs: number;

  constructor(ttlSeconds?: number) {
    const ttl = ttlSeconds ?? DEFAULT_TTL_SECONDS;
    this.ttlMs = ttl * 1000;
  }

  /** Generate a one-time token and store it with TTL. */
  createToken(): { token: string; expiresAt: Date } {
    this.purgeExpired();

    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = Date.now() + this.ttlMs;
    this.tokens.set(token, { expiresAt });

    return { token, expiresAt: new Date(expiresAt) };
  }

  /** Validate and consume a token atomically. Returns true if valid. */
  consumeToken(token: string): boolean {
    const entry = this.tokens.get(token);
    if (!entry) {
      return false;
    }
    // Always delete first to prevent TOCTOU race
    this.tokens.delete(token);

    if (Date.now() > entry.expiresAt) {
      return false;
    }
    return true;
  }

  /** Remove expired tokens (lazy purge on createToken). */
  purgeExpired(): void {
    const now = Date.now();
    for (const [token, entry] of this.tokens) {
      if (now > entry.expiresAt) {
        this.tokens.delete(token);
      }
    }
  }

  /** Number of stored tokens (for testing). */
  get size(): number {
    return this.tokens.size;
  }
}
