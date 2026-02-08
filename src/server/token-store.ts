import crypto from 'node:crypto';

const DEFAULT_TTL_SECONDS = 300; // 5 minutes

export interface TokenMetadata {
  vncHost?: string;
}

interface TokenEntry {
  expiresAt: number; // Unix timestamp in ms
  metadata: TokenMetadata;
}

export class TokenStore {
  private readonly tokens = new Map<string, TokenEntry>();
  private readonly ttlMs: number;

  constructor(ttlSeconds?: number) {
    const ttl = ttlSeconds ?? DEFAULT_TTL_SECONDS;
    this.ttlMs = ttl * 1000;
  }

  /** Generate a one-time token and store it with TTL. */
  createToken(metadata?: TokenMetadata): { token: string; expiresAt: Date } {
    this.purgeExpired();

    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = Date.now() + this.ttlMs;
    this.tokens.set(token, { expiresAt, metadata: metadata ?? {} });

    return { token, expiresAt: new Date(expiresAt) };
  }

  /** Validate and consume a token atomically. Returns metadata if valid, null otherwise. */
  consumeToken(token: string): TokenMetadata | null {
    const entry = this.tokens.get(token);
    if (!entry) {
      return null;
    }
    // Always delete first to prevent TOCTOU race
    this.tokens.delete(token);

    if (Date.now() > entry.expiresAt) {
      return null;
    }
    return entry.metadata;
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
