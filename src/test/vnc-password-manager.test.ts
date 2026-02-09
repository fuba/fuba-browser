import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { VncPasswordManager } from '../server/vnc-password-manager.js';

describe('VncPasswordManager', () => {
  let tmpDir: string;
  let passwdFile: string;

  beforeEach(() => {
    vi.useFakeTimers();
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vnc-pw-test-'));
    passwdFile = path.join(tmpDir, 'vnc-passwords');
  });

  afterEach(() => {
    vi.useRealTimers();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('createPassword generates an 8-char password and writes it to the file', () => {
    const mgr = new VncPasswordManager({ passwdFilePath: passwdFile });

    const pw = mgr.createPassword();
    expect(pw).toHaveLength(8);
    expect(typeof pw).toBe('string');

    const content = fs.readFileSync(passwdFile, 'utf-8');
    const lines = content.trim().split('\n');
    // internal password + dynamic password
    expect(lines).toHaveLength(2);
    expect(lines).toContain(pw);
  });

  it('multiple passwords appear in the file', () => {
    const mgr = new VncPasswordManager({ passwdFilePath: passwdFile });

    const pw1 = mgr.createPassword();
    const pw2 = mgr.createPassword();
    const pw3 = mgr.createPassword();

    const content = fs.readFileSync(passwdFile, 'utf-8');
    const lines = content.trim().split('\n');
    // internal password + 3 dynamic passwords
    expect(lines).toHaveLength(4);
    expect(lines).toContain(pw1);
    expect(lines).toContain(pw2);
    expect(lines).toContain(pw3);
  });

  it('purgeExpired removes expired passwords but keeps internal password', () => {
    const mgr = new VncPasswordManager({
      passwdFilePath: passwdFile,
      ttlSeconds: 10,
    });

    mgr.createPassword();
    mgr.createPassword();
    expect(mgr.size).toBe(2);

    // Advance past TTL
    vi.advanceTimersByTime(11_000);
    mgr.purgeExpired();

    expect(mgr.size).toBe(0);
    const content = fs.readFileSync(passwdFile, 'utf-8');
    const lines = content.trim().split('\n');
    // Only internal password remains
    expect(lines).toHaveLength(1);
  });

  it('purgeExpired keeps non-expired passwords', () => {
    const mgr = new VncPasswordManager({
      passwdFilePath: passwdFile,
      ttlSeconds: 60,
    });

    const pw1 = mgr.createPassword();

    // Advance 30 seconds (not past TTL)
    vi.advanceTimersByTime(30_000);

    const pw2 = mgr.createPassword();

    // Advance another 35 seconds (pw1 expired at 60s, pw2 still valid)
    vi.advanceTimersByTime(35_000);
    mgr.purgeExpired();

    expect(mgr.size).toBe(1);
    const content = fs.readFileSync(passwdFile, 'utf-8');
    const lines = content.trim().split('\n');
    // internal password + pw2
    expect(lines).toHaveLength(2);
    expect(lines).toContain(pw2);
    expect(lines).not.toContain(pw1);
  });

  it('generated passwords are unique', () => {
    const mgr = new VncPasswordManager({ passwdFilePath: passwdFile });

    const passwords = new Set<string>();
    for (let i = 0; i < 100; i++) {
      passwords.add(mgr.createPassword());
    }
    // All 100 should be unique (cryptographically random, collision extremely unlikely)
    expect(passwords.size).toBe(100);
  });

  it('start and stop manage the purge timer', () => {
    const mgr = new VncPasswordManager({
      passwdFilePath: passwdFile,
      ttlSeconds: 10,
    });
    mgr.createPassword();
    mgr.createPassword();

    mgr.start();

    // Advance past TTL and past purge interval
    vi.advanceTimersByTime(70_000);

    // Purge should have run automatically
    expect(mgr.size).toBe(0);

    mgr.stop();
  });

  it('password file has restricted permissions (mode 0600)', () => {
    const mgr = new VncPasswordManager({ passwdFilePath: passwdFile });
    mgr.createPassword();

    const stat = fs.statSync(passwdFile);
    // Check owner-only read/write (0600)
    const mode = stat.mode & 0o777;
    expect(mode).toBe(0o600);
  });

  it('reuses first line of existing password file as internal password', () => {
    // Simulate entrypoint.sh creating the file before VncPasswordManager starts
    fs.writeFileSync(passwdFile, 'seedpass\nbootpw00\n', { mode: 0o600 });
    const mgr = new VncPasswordManager({ passwdFilePath: passwdFile });

    const dyn = mgr.createPassword();
    const content = fs.readFileSync(passwdFile, 'utf-8');
    const lines = content.trim().split('\n');

    // First line must be preserved from the original file
    expect(lines[0]).toBe('seedpass');
    expect(lines).toContain(dyn);
  });

  it('generates internal password when file does not exist', () => {
    const mgr = new VncPasswordManager({ passwdFilePath: passwdFile });

    mgr.createPassword();
    const content = fs.readFileSync(passwdFile, 'utf-8');
    const lines = content.trim().split('\n');

    // Internal password should be generated (8 chars)
    expect(lines[0]).toHaveLength(8);
    expect(lines).toHaveLength(2);
  });

  it('all passwords are 8 chars (x11vnc compatible)', () => {
    const mgr = new VncPasswordManager({ passwdFilePath: passwdFile });
    const dyn = mgr.createPassword();
    const content = fs.readFileSync(passwdFile, 'utf-8');
    const lines = content.trim().split('\n');

    // Internal password
    expect(lines[0]).toHaveLength(8);
    // Dynamic password
    expect(dyn).toHaveLength(8);
  });

  it('truncates existing internal password to 8 chars if longer', () => {
    // Simulate a file with a longer password (e.g., from older version)
    fs.writeFileSync(passwdFile, 'this-is-a-very-long-password\n', { mode: 0o600 });
    const mgr = new VncPasswordManager({ passwdFilePath: passwdFile });

    mgr.createPassword();
    const content = fs.readFileSync(passwdFile, 'utf-8');
    const lines = content.trim().split('\n');

    expect(lines[0]).toBe('this-is-');
    expect(lines[0]).toHaveLength(8);
  });

  it('file always contains at least internal password after purge', () => {
    const mgr = new VncPasswordManager({
      passwdFilePath: passwdFile,
      ttlSeconds: 5,
    });

    mgr.createPassword();
    expect(mgr.size).toBe(1);

    vi.advanceTimersByTime(6_000);
    mgr.purgeExpired();

    expect(mgr.size).toBe(0);
    const content = fs.readFileSync(passwdFile, 'utf-8');
    // File is never empty — internal password keeps x11vnc alive
    expect(content.trim().length).toBeGreaterThan(0);
    expect(content.trim().split('\n')).toHaveLength(1);
  });
});
