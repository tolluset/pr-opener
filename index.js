#!/usr/bin/env node

import { execSync } from 'child_process';
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CONFIG_FILE = join(__dirname, 'config.json');
const LOGS_DIR = join(__dirname, 'logs');
const NOTIFIED_FILE = join(LOGS_DIR, 'notified.json');
const LOG_FILE = join(LOGS_DIR, 'stdout.log');
const DRY_RUN = process.argv.includes('--dry-run');
const COMMAND = process.argv[2]; // 'pause' | 'resume' | 'status' | undefined

// ログディレクトリを事前に作成
mkdirSync(LOGS_DIR, { recursive: true });

function log(...args) {
  const msg = args.join(' ');
  console.log(msg);
  try { appendFileSync(LOG_FILE, msg + '\n'); } catch {}
}

function logError(...args) {
  const msg = args.join(' ');
  console.error(msg);
  try { appendFileSync(LOG_FILE, '[ERROR] ' + msg + '\n'); } catch {}
}

if (COMMAND === 'pause' || COMMAND === 'resume' || COMMAND === 'status') {
  handleCommand(COMMAND);
  process.exit(0);
}

if (COMMAND === 'stats') {
  handleStats();
  process.exit(0);
}

function loadConfig() {
  const defaults = { maxTabsToOpen: 5, paused: false, excludeDraft: true, notifiedRetentionDays: 7, enableNotification: true };
  try {
    return { ...defaults, ...JSON.parse(readFileSync(CONFIG_FILE, 'utf-8')) };
  } catch {
    return defaults;
  }
}

function saveConfig(config) {
  writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
}

// 統計情報を表示
function handleStats() {
  const notified = loadNotified();
  const entries = Object.entries(notified);
  const total = entries.length;

  // 最近7日間のPR数
  const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const recent = entries.filter(([, v]) => {
    const timestamp = v.at || v.notifiedAt;
    return timestamp && new Date(timestamp).getTime() > sevenDaysAgo;
  }).length;

  // リポジトリ別カウント（Top 3）
  const repoCounts = {};
  for (const [key] of entries) {
    const repo = key.split('#')[0];
    repoCounts[repo] = (repoCounts[repo] || 0) + 1;
  }
  const topRepos = Object.entries(repoCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3);

  console.log('📊 PR Opener Stats');
  console.log('─'.repeat(30));
  console.log(`Total PRs notified: ${total}`);
  console.log(`Last 7 days: ${recent}`);
  console.log('');
  if (topRepos.length > 0) {
    console.log('Top repositories:');
    topRepos.forEach(([repo, count], i) => {
      console.log(`  ${i + 1}. ${repo} (${count})`);
    });
  } else {
    console.log('No PR history yet.');
  }
}

function handleCommand(cmd) {
  const config = loadConfig();

  if (cmd === 'status') {
    console.log(config.paused ? '⏸ Paused' : '▶ Active');
    return;
  }

  config.paused = (cmd === 'pause');
  saveConfig(config);
  console.log(cmd === 'pause' ? '⏸ Paused' : '▶ Resumed');
}

function loadNotified() {
  if (!existsSync(NOTIFIED_FILE)) return {};
  try {
    return JSON.parse(readFileSync(NOTIFIED_FILE, 'utf-8'));
  } catch {
    return {};
  }
}

function saveNotified(data) {
  mkdirSync(LOGS_DIR, { recursive: true });
  writeFileSync(NOTIFIED_FILE, JSON.stringify(data, null, 2));
}

// 古い通知を削除（retentionDays日以上経過したもの）
function cleanupOldNotified(notified, retentionDays) {
  const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
  const cleaned = {};
  for (const [key, value] of Object.entries(notified)) {
    const timestamp = value.at || value.notifiedAt; // 下位互換性
    if (timestamp && new Date(timestamp).getTime() > cutoff) {
      cleaned[key] = value;
    }
  }
  return cleaned;
}

function fetchPRs(excludeDraft = true) {
  try {
    const draftFilter = excludeDraft ? ' --draft=false' : '';
    const cmd = `gh search prs --review-requested=@me --state=open${draftFilter} --json number,url,repository,title,updatedAt --limit 50`;
    return JSON.parse(execSync(cmd, { encoding: 'utf-8', timeout: 30000 }));
  } catch (e) {
    logError('GitHub API failed:', e.message);
    return [];
  }
}

// macOS通知センターに通知を送信（Glassサウンド付き）
function sendNotification(title, message) {
  try {
    // AppleScript文字列エスケープ
    const escapeAS = (s) => s.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    const script = `display notification "${escapeAS(message)}" with title "${escapeAS(title)}" sound name "Glass"`;
    execSync(`osascript -e '${script.replace(/'/g, "'\\''")}'`, { encoding: 'utf-8' });
  } catch {
    // 通知失敗は無視（メイン機能に影響しない）
  }
}

function openTab(url) {
  if (DRY_RUN) {
    log(`[DRY-RUN] Would open: ${url}`);
    return true;
  }
  try {
    execSync(`open -a "Google Chrome" "${url}"`);
    log(`Opened: ${url}`);
    return true;
  } catch (e) {
    logError(`Failed: ${url}`, e.message);
    return false;
  }
}

function main() {
  const config = loadConfig();
  if (config.paused) return log('Paused');

  log(`[${new Date().toISOString()}] Started`);

  let notified = loadNotified();
  notified = cleanupOldNotified(notified, config.notifiedRetentionDays);

  const prs = fetchPRs(config.excludeDraft);
  log(`Fetched: ${prs.length} PRs`);
  if (!prs.length) {
    saveNotified(notified); // クリーンアップ結果を保存
    return log('No review requests');
  }
  const key = (pr) => `${pr.repository.nameWithOwner}#${pr.number}`;

  const newPRs = prs.filter((pr) => !notified[key(pr)]).slice(0, config.maxTabsToOpen);
  log(`New: ${newPRs.length} PRs`);

  for (const pr of newPRs) {
    if (openTab(pr.url)) {
      notified[key(pr)] = { at: new Date().toISOString(), title: pr.title };
    }
  }

  if (newPRs.length > 0 && config.enableNotification) {
    sendNotification('PR Opener', `${newPRs.length}件の新しいPRがあります`);
  }

  saveNotified(notified);
  log('Done');
}

main();
