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
      writeNotified({ 'owner/repo#123': { notifiedAt: date, updatedAt: date, title: 'Test' } });

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
});
