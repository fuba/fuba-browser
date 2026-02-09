import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const DEFAULT_PASSWORD_TTL_SECONDS = 600; // 10 minutes (token TTL 5min + grace 5min)
const PURGE_INTERVAL_MS = 60_000; // 60 seconds

interface PasswordEntry {
  password: string;
  expiresAt: number; // Unix timestamp in ms
}

export class VncPasswordManager {
  private readonly passwords = new Map<string, PasswordEntry>();
  private readonly basePassword: string;
  private readonly passwdFilePath: string;
  private readonly ttlMs: number;
  private purgeTimer: ReturnType<typeof setInterval> | null = null;

  constructor(options: {
    basePassword: string;
    passwdFilePath: string;
    ttlSeconds?: number;
  }) {
    this.basePassword = options.basePassword;
    this.passwdFilePath = options.passwdFilePath;
    this.ttlMs = (options.ttlSeconds ?? DEFAULT_PASSWORD_TTL_SECONDS) * 1000;
  }

  /** Initialize the password file with just the base password. */
  initializeFile(): void {
    this.writePasswordFile();
  }

  /** Generate a random 8-char password, add to file and track with TTL. */
  createPassword(): string {
    const password = crypto.randomBytes(6).toString('base64url').slice(0, 8);
    const expiresAt = Date.now() + this.ttlMs;
    this.passwords.set(password, { password, expiresAt });
    this.writePasswordFile();
    return password;
  }

  /** Remove expired passwords from the map and rewrite the file. */
  purgeExpired(): void {
    const now = Date.now();
    let changed = false;
    for (const [key, entry] of this.passwords) {
      if (now > entry.expiresAt) {
        this.passwords.delete(key);
        changed = true;
      }
    }
    if (changed) {
      this.writePasswordFile();
    }
  }

  /** Start periodic purge timer. */
  start(): void {
    if (this.purgeTimer) return;
    this.purgeTimer = setInterval(() => this.purgeExpired(), PURGE_INTERVAL_MS);
    // Allow the process to exit even if the timer is still running
    if (this.purgeTimer.unref) {
      this.purgeTimer.unref();
    }
  }

  /** Stop periodic purge timer. */
  stop(): void {
    if (this.purgeTimer) {
      clearInterval(this.purgeTimer);
      this.purgeTimer = null;
    }
  }

  /** Number of dynamic (non-base) passwords currently tracked. */
  get size(): number {
    return this.passwords.size;
  }

  /**
   * Write base password + all dynamic passwords to file atomically.
   * Uses fsync before rename to ensure x11vnc (which re-reads the file
   * on each connection via -passwdfile read:) always sees the latest content.
   */
  private writePasswordFile(): void {
    const lines = [this.basePassword];
    for (const entry of this.passwords.values()) {
      lines.push(entry.password);
    }
    const content = lines.join('\n') + '\n';

    const tmpPath = this.passwdFilePath + '.tmp';
    const dir = path.dirname(this.passwdFilePath);

    // Ensure directory exists
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const fd = fs.openSync(tmpPath, 'w', 0o600);
    fs.writeSync(fd, content);
    fs.fsyncSync(fd);
    fs.closeSync(fd);
    fs.renameSync(tmpPath, this.passwdFilePath);
  }
}
