import { execFileSync, spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

const launcher = new URL('../../fuba-browser.sh', import.meta.url).pathname;

function runShell(script: string): string {
  return execFileSync('bash', ['-c', script], {
    env: { ...process.env, FBB_SOURCE_ONLY: 'true', LAUNCHER_PATH: launcher },
    encoding: 'utf8',
  }).trim();
}

describe('fuba-browser GPU launcher options', () => {
  it('defaults GPU mode to off', () => {
    expect(runShell('source "$LAUNCHER_PATH"; parse_start_args; printf "%s" "$GPU_MODE"')).toBe('off');
  });

  it('treats a bare --gpu flag as auto', () => {
    expect(runShell('source "$LAUNCHER_PATH"; parse_start_args --gpu; printf "%s" "$GPU_MODE"')).toBe('auto');
  });

  it.each(['auto', 'nvidia', 'amd'])('accepts --gpu %s', mode => {
    expect(runShell(`source "$LAUNCHER_PATH"; parse_start_args --gpu ${mode}; printf "%s" "$GPU_MODE"`)).toBe(mode);
  });

  it('accepts --gpu=<mode>', () => {
    expect(runShell('source "$LAUNCHER_PATH"; parse_start_args --gpu=amd; printf "%s" "$GPU_MODE"')).toBe('amd');
  });

  it('rejects unsupported GPU modes', () => {
    const result = spawnSync('bash', ['-c', 'source "$LAUNCHER_PATH"; parse_start_args --gpu intel'], {
      env: { ...process.env, FBB_SOURCE_ONLY: 'true', LAUNCHER_PATH: launcher },
      encoding: 'utf8',
    });

    expect(result.status).not.toBe(0);
    expect(result.stdout + result.stderr).toContain("Unsupported GPU mode 'intel'");
  });

  it('auto-selects a single detected vendor', () => {
    expect(runShell('source "$LAUNCHER_PATH"; resolve_gpu_mode auto nvidia')).toBe('nvidia');
    expect(runShell('source "$LAUNCHER_PATH"; resolve_gpu_mode auto amd')).toBe('amd');
  });

  it('rejects an explicit vendor that is not available on the host', () => {
    const result = spawnSync('bash', ['-c', 'source "$LAUNCHER_PATH"; resolve_gpu_mode nvidia amd'], {
      env: { ...process.env, FBB_SOURCE_ONLY: 'true', LAUNCHER_PATH: launcher },
      encoding: 'utf8',
    });

    expect(result.status).not.toBe(0);
    expect(result.stdout + result.stderr).toContain("Requested NVIDIA GPU was not detected");
  });

  it('requires an explicit vendor when NVIDIA and AMD are both detected', () => {
    const result = spawnSync('bash', ['-c', 'source "$LAUNCHER_PATH"; resolve_gpu_mode auto nvidia amd'], {
      env: { ...process.env, FBB_SOURCE_ONLY: 'true', LAUNCHER_PATH: launcher },
      encoding: 'utf8',
    });

    expect(result.status).not.toBe(0);
    expect(result.stdout + result.stderr).toContain('Both NVIDIA and AMD GPUs were detected');
  });

  it('passes only AMD render nodes into the container', () => {
    const args = runShell(`
      source "$LAUNCHER_PATH"
      find_amd_render_devices() { printf '%s\\n' /dev/null; }
      configure_gpu_docker_args amd
      printf '%s\\n' "\${GPU_DOCKER_ARGS[@]}"
    `);

    expect(args).toContain('/dev/null');
    expect(args).not.toContain('/dev/dri/card');
  });
});
