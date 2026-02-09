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

  it('initializeFile creates a file with only the base password', () => {
    const mgr = new VncPasswordManager({
      basePassword: 'fuba-browser',
      passwdFilePath: passwdFile,
    });
    mgr.initializeFile();

    const content = fs.readFileSync(passwdFile, 'utf-8');
    expect(content.trim()).toBe('fuba-browser');
    const lines = content.trim().split('\n');
    expect(lines).toHaveLength(1);
  });

  it('createPassword generates an 8-char password and adds it to the file', () => {
    const mgr = new VncPasswordManager({
      basePassword: 'fuba-browser',
      passwdFilePath: passwdFile,
    });
    mgr.initializeFile();

    const pw = mgr.createPassword();
    expect(pw).toHaveLength(8);
    expect(typeof pw).toBe('string');

    const content = fs.readFileSync(passwdFile, 'utf-8');
    const lines = content.trim().split('\n');
    expect(lines).toHaveLength(2);
    expect(lines[0]).toBe('fuba-browser');
    expect(lines[1]).toBe(pw);
  });

  it('multiple passwords appear in the file', () => {
    const mgr = new VncPasswordManager({
      basePassword: 'fuba-browser',
      passwdFilePath: passwdFile,
    });
    mgr.initializeFile();

    const pw1 = mgr.createPassword();
    const pw2 = mgr.createPassword();
    const pw3 = mgr.createPassword();

    const content = fs.readFileSync(passwdFile, 'utf-8');
    const lines = content.trim().split('\n');
    expect(lines).toHaveLength(4);
    expect(lines[0]).toBe('fuba-browser');
    expect(lines).toContain(pw1);
    expect(lines).toContain(pw2);
    expect(lines).toContain(pw3);
  });

  it('purgeExpired removes expired passwords but keeps base password', () => {
    const mgr = new VncPasswordManager({
      basePassword: 'fuba-browser',
      passwdFilePath: passwdFile,
      ttlSeconds: 10,
    });
    mgr.initializeFile();

    mgr.createPassword();
    mgr.createPassword();
    expect(mgr.size).toBe(2);

    // Advance past TTL
    vi.advanceTimersByTime(11_000);
    mgr.purgeExpired();

    expect(mgr.size).toBe(0);
    const content = fs.readFileSync(passwdFile, 'utf-8');
    const lines = content.trim().split('\n');
    expect(lines).toHaveLength(1);
    expect(lines[0]).toBe('fuba-browser');
  });

  it('purgeExpired keeps non-expired passwords', () => {
    const mgr = new VncPasswordManager({
      basePassword: 'fuba-browser',
      passwdFilePath: passwdFile,
      ttlSeconds: 60,
    });
    mgr.initializeFile();

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
    expect(lines).toHaveLength(2);
    expect(lines[0]).toBe('fuba-browser');
    expect(lines).toContain(pw2);
    expect(lines).not.toContain(pw1);
  });

  it('generated passwords are unique', () => {
    const mgr = new VncPasswordManager({
      basePassword: 'fuba-browser',
      passwdFilePath: passwdFile,
    });
    mgr.initializeFile();

    const passwords = new Set<string>();
    for (let i = 0; i < 100; i++) {
      passwords.add(mgr.createPassword());
    }
    // All 100 should be unique (cryptographically random, collision extremely unlikely)
    expect(passwords.size).toBe(100);
  });

  it('start and stop manage the purge timer', () => {
    const mgr = new VncPasswordManager({
      basePassword: 'fuba-browser',
      passwdFilePath: passwdFile,
      ttlSeconds: 10,
    });
    mgr.initializeFile();
    mgr.createPassword();
    mgr.createPassword();

    mgr.start();

    // Advance past TTL and past purge interval
    vi.advanceTimersByTime(70_000);

    // Purge should have run automatically
    expect(mgr.size).toBe(0);

    mgr.stop();
  });

  it('initializeFile skips writing if file already has correct base password', () => {
    // Simulate the file created by entrypoint.sh
    fs.writeFileSync(passwdFile, 'fuba-browser\n', { mode: 0o600 });
    const statBefore = fs.statSync(passwdFile);

    const mgr = new VncPasswordManager({
      basePassword: 'fuba-browser',
      passwdFilePath: passwdFile,
    });
    mgr.initializeFile();

    const statAfter = fs.statSync(passwdFile);
    // File should not have been rewritten (same inode, same mtime)
    expect(statAfter.ino).toBe(statBefore.ino);
  });

  it('initializeFile writes if file has different content', () => {
    fs.writeFileSync(passwdFile, 'old-password\n', { mode: 0o600 });

    const mgr = new VncPasswordManager({
      basePassword: 'fuba-browser',
      passwdFilePath: passwdFile,
    });
    mgr.initializeFile();

    const content = fs.readFileSync(passwdFile, 'utf-8');
    expect(content.trim()).toBe('fuba-browser');
  });

  it('password file has restricted permissions (mode 0600)', () => {
    const mgr = new VncPasswordManager({
      basePassword: 'fuba-browser',
      passwdFilePath: passwdFile,
    });
    mgr.initializeFile();

    const stat = fs.statSync(passwdFile);
    // Check owner-only read/write (0600)
    const mode = stat.mode & 0o777;
    expect(mode).toBe(0o600);
  });
});
