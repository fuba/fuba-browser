import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const DEFAULT_PASSWORD_TTL_SECONDS = 600; // 10 minutes (token TTL 5min + grace 5min)
const PURGE_INTERVAL_MS = 60_000; // 60 seconds
// VNC protocol only uses the first 8 bytes of a password for DES authentication
const PASSWORD_LENGTH = 8;

interface PasswordEntry {
  password: string;
  expiresAt: number; // Unix timestamp in ms
}

export class VncPasswordManager {
  private readonly passwords = new Map<string, PasswordEntry>();
  private readonly passwdFilePath: string;
  private readonly ttlMs: number;
  // Internal password that keeps x11vnc alive but is never shared.
  // Loaded from the existing file (written by entrypoint.sh) when available,
  // so the first writePasswordFile() preserves the password x11vnc already knows.
  private readonly internalPassword: string;
  private purgeTimer: ReturnType<typeof setInterval> | null = null;

  constructor(options: {
    passwdFilePath: string;
    ttlSeconds?: number;
  }) {
    this.passwdFilePath = options.passwdFilePath;
    this.ttlMs = (options.ttlSeconds ?? DEFAULT_PASSWORD_TTL_SECONDS) * 1000;
    this.internalPassword = this.loadOrGenerateInternalPassword();
  }

  /** Generate a random 8-char password, add to file and track with TTL. */
  createPassword(): string {
    const password = VncPasswordManager.generatePassword();
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

  /** Number of dynamic passwords currently tracked. */
  get size(): number {
    return this.passwords.size;
  }

  /** Generate a random password of PASSWORD_LENGTH alphanumeric characters. */
  private static generatePassword(): string {
    return crypto.randomBytes(16).toString('base64url').slice(0, PASSWORD_LENGTH);
  }

  /**
   * Load the first non-empty line from the existing password file
   * (created by entrypoint.sh) so we preserve the password x11vnc already
   * knows. Falls back to generating a new one if the file doesn't exist.
   */
  private loadOrGenerateInternalPassword(): string {
    try {
      const content = fs.readFileSync(this.passwdFilePath, 'utf-8');
      const first = content.split(/\r?\n/).find((line) => line.trim().length > 0);
      if (first) {
        return first.slice(0, PASSWORD_LENGTH);
      }
    } catch {
      // File doesn't exist yet — generate a fresh password
    }
    return VncPasswordManager.generatePassword();
  }

  /**
   * Write internal password + all dynamic passwords to file atomically.
   * The internal password is loaded from the existing file at construction
   * or generated fresh, and keeps x11vnc alive but is never shared via API.
   * Uses fsync before rename to ensure x11vnc (which re-reads the file
   * on each connection via -passwdfile read:) always sees the latest content.
   */
  private writePasswordFile(): void {
    const lines = [this.internalPassword];
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
