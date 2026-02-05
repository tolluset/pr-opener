#!/usr/bin/env node

import { execSync } from 'child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CONFIG_FILE = join(__dirname, 'config.json');
const LOGS_DIR = join(__dirname, 'logs');
const NOTIFIED_FILE = join(LOGS_DIR, 'notified.json');
const DRY_RUN = process.argv.includes('--dry-run');
const COMMAND = process.argv[2]; // 'pause' | 'resume' | 'status' | undefined

if (COMMAND === 'pause' || COMMAND === 'resume' || COMMAND === 'status') {
  handleCommand(COMMAND);
  process.exit(0);
}

function loadConfig() {
  const defaults = { maxTabsToOpen: 5, paused: false };
  try {
    return { ...defaults, ...JSON.parse(readFileSync(CONFIG_FILE, 'utf-8')) };
  } catch {
    return defaults;
  }
}

function saveConfig(config) {
  writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
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

function fetchPRs() {
  try {
    const cmd = `gh search prs --review-requested=@me --state=open --json number,url,repository,title,updatedAt --limit 50`;
    return JSON.parse(execSync(cmd, { encoding: 'utf-8', timeout: 30000 }));
  } catch (e) {
    console.error('GitHub API failed:', e.message);
    return [];
  }
}

function openTab(url) {
  if (DRY_RUN) {
    console.log(`[DRY-RUN] Would open: ${url}`);
    return true;
  }
  try {
    execSync(`open -a "Google Chrome" "${url}"`);
    console.log(`Opened: ${url}`);
    return true;
  } catch (e) {
    console.error(`Failed: ${url}`, e.message);
    return false;
  }
}

function main() {
  const config = loadConfig();
  if (config.paused) return console.log('Paused');

  console.log(`[${new Date().toISOString()}] Started`);

  const prs = fetchPRs();
  console.log(`Fetched: ${prs.length} PRs`);
  if (!prs.length) return console.log('No review requests');

  const notified = loadNotified();
  const key = (pr) => `${pr.repository.nameWithOwner}#${pr.number}`;

  const newPRs = prs.filter((pr) => !notified[key(pr)]).slice(0, config.maxTabsToOpen);
  console.log(`New: ${newPRs.length} PRs`);

  for (const pr of newPRs) {
    if (openTab(pr.url)) {
      notified[key(pr)] = { at: new Date().toISOString(), title: pr.title };
    }
  }

  saveNotified(notified);
  console.log('Done');
}

main();
