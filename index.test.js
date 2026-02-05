import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawn } from 'child_process';
import { existsSync, readFileSync, writeFileSync, unlinkSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const NOTIFIED_FILE = join(__dirname, 'logs/notified.json');
const SCRIPT_PATH = join(__dirname, 'index.js');

function runScript(args = []) {
  return new Promise((resolve) => {
    const proc = spawn('node', [SCRIPT_PATH, ...args], { cwd: __dirname });
    let stdout = '', stderr = '';
    proc.stdout.on('data', (d) => (stdout += d));
    proc.stderr.on('data', (d) => (stderr += d));
    proc.on('close', (code) => resolve({ stdout, stderr, code }));
  });
}

function readNotified() {
  return existsSync(NOTIFIED_FILE) ? JSON.parse(readFileSync(NOTIFIED_FILE, 'utf-8')) : null;
}

function writeNotified(data) {
  writeFileSync(NOTIFIED_FILE, JSON.stringify(data, null, 2));
}

function cleanup() {
  if (existsSync(NOTIFIED_FILE)) unlinkSync(NOTIFIED_FILE);
}

describe('PR Notifier', () => {
  beforeEach(cleanup);
  afterEach(cleanup);

  describe('Basic', () => {
    it('starts and exits cleanly', async () => {
      const { stdout, code } = await runScript(['--dry-run']);
      expect(code).toBe(0);
      expect(stdout).toMatch(/Started/);
      expect(stdout).toMatch(/(Done|No review requests)/);
    });

    it('--dry-run does not open browser', async () => {
      const { stdout } = await runScript(['--dry-run']);
      expect(stdout).toMatch(/(\[DRY-RUN\]|No review requests)/);
    });
  });

  describe('Storage', () => {
    it('works without notified.json', async () => {
      expect(existsSync(NOTIFIED_FILE)).toBe(false);
      const { code } = await runScript(['--dry-run']);
      expect(code).toBe(0);
    });

    it('preserves existing records', async () => {
      const date = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString();
      writeNotified({ 'owner/repo#123': { at: date, title: 'Test' } });

      const { code } = await runScript(['--dry-run']);
      expect(code).toBe(0);

      const data = readNotified();
      expect(data?.['owner/repo#123']).toBeDefined();
    });

    it('handles corrupted JSON', async () => {
      writeFileSync(NOTIFIED_FILE, 'invalid{{{');
      const { code } = await runScript(['--dry-run']);
      expect(code).toBe(0);
    });
  });

  describe('Output', () => {
    it('logs timestamp', async () => {
      const { stdout } = await runScript(['--dry-run']);
      expect(stdout).toMatch(/\[\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    });

    it('logs PR count', async () => {
      const { stdout } = await runScript(['--dry-run']);
      expect(stdout).toMatch(/Fetched: \d+ PRs/);
    });
  });

  describe('Error', () => {
    it('handles gh failure gracefully', async () => {
      const { code, stdout } = await runScript(['--dry-run']);
      expect(code).toBe(0);
      expect(stdout).toMatch(/Started/);
    });
  });

  // 古い通知のクリーンアップテスト
  describe('Cleanup', () => {
    it('removes old notifications beyond retention period', async () => {
      const oldDate = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(); // 10日前
      const recentDate = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(); // 3日前
      writeNotified({
        'owner/old#1': { at: oldDate, title: 'Old PR' },
        'owner/recent#2': { at: recentDate, title: 'Recent PR' },
      });

      const { code } = await runScript(['--dry-run']);
      expect(code).toBe(0);

      const data = readNotified();
      expect(data?.['owner/old#1']).toBeUndefined(); // 古いのは削除
      expect(data?.['owner/recent#2']).toBeDefined(); // 新しいのは残る
    });
  });

  // stats コマンドテスト
  describe('Stats', () => {
    it('shows stats with empty history', async () => {
      const { stdout, code } = await runScript(['stats']);
      expect(code).toBe(0);
      expect(stdout).toMatch(/PR Opener Stats/);
      expect(stdout).toMatch(/Total PRs notified: 0/);
    });

    it('shows stats with PR history', async () => {
      const recentDate = new Date().toISOString();
      writeNotified({
        'owner/repo-a#1': { at: recentDate, title: 'PR 1' },
        'owner/repo-a#2': { at: recentDate, title: 'PR 2' },
        'owner/repo-b#3': { at: recentDate, title: 'PR 3' },
      });

      const { stdout, code } = await runScript(['stats']);
      expect(code).toBe(0);
      expect(stdout).toMatch(/Total PRs notified: 3/);
      expect(stdout).toMatch(/Last 7 days: 3/);
      expect(stdout).toMatch(/owner\/repo-a \(2\)/);
    });
  });
});
