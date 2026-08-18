#!/usr/bin/env node
/**
 * Uctan uca test kosucusu.
 *
 * Sahte IPTV sunucusunu ve uretim derlemesini ayaga kaldirir, senaryolari
 * gercek bir Chromium'da calistirir ve her sey bittiginde temizler.
 *
 * Kullanim:
 *   npm run build -w @appleiptv/web
 *   npm i -D playwright && npx playwright install chromium
 *   node apps/web/e2e/run.mjs
 */
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { scenarios } from './scenarios.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const webRoot = resolve(here, '..');
const BASE_URL = 'http://127.0.0.1:4173/';

let chromium;
try {
  ({ chromium } = await import('playwright'));
} catch {
  console.error('playwright bulunamadi. Kurmak icin:\n  npm i -D playwright && npx playwright install chromium');
  process.exit(1);
}

const children = [];
function start(command, args, options = {}) {
  const child = spawn(command, args, { stdio: 'ignore', ...options });
  children.push(child);
  return child;
}

async function waitFor(url, timeoutMs = 20_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      /* henuz ayakta degil */
    }
    await delay(300);
  }
  throw new Error(`Zaman asimi: ${url}`);
}

function cleanup() {
  for (const child of children) child.kill();
}
process.on('exit', cleanup);
process.on('SIGINT', () => { cleanup(); process.exit(130); });

start(process.execPath, [resolve(here, 'mock-server.mjs')]);
start('npx', ['vite', 'preview', '--port', '4173', '--host', '127.0.0.1'], { cwd: webRoot });

await waitFor('http://127.0.0.1:8899/get.php');
await waitFor(BASE_URL);

// PLAYWRIGHT_CHROMIUM_PATH, hazir bir Chromium bulunan ortamlarda
// (CI kaplari gibi) tarayici indirmeden calismayi saglar.
const browser = await chromium.launch({
  args: ['--autoplay-policy=no-user-gesture-required'],
  ...(process.env.PLAYWRIGHT_CHROMIUM_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH } : {}),
});
let failed = 0;

for (const scenario of scenarios) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  page.on('pageerror', (error) => console.log('   ! sayfa hatasi:', error.message));
  console.log(`\n▶ ${scenario.name}`);
  try {
    await scenario.run(page, BASE_URL);
    console.log(`   ✓ ${scenario.name}`);
  } catch (error) {
    failed += 1;
    console.error(`   ✗ ${scenario.name}: ${error.message}`);
  }
  await context.close();
}

await browser.close();
cleanup();
console.log(failed === 0 ? '\nTum senaryolar basarili.' : `\n${failed} senaryo basarisiz.`);
process.exit(failed === 0 ? 0 : 1);
