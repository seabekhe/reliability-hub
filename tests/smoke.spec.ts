import { test, expect } from '@playwright/test';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

let testArtifactsDir: string;
let consoleLogs: string[] = [];
let consoleErrors: string[] = [];
let pageErrors: string[] = [];
let failedRequests: string[] = [];

test('smoke test - app loads and displays home page', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('Reliability Hub')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Executive summary' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Executive summary' })).toBeVisible();
});

test('smoke test - company link opens the reliability tab', async ({ page }) => {
  await page.goto('/company');
  await expect(page.getByRole('tab', { name: 'Reliability', selected: true })).toBeVisible();
});

test.beforeEach(async ({ page }) => {
  consoleLogs = [];
  consoleErrors = [];
  pageErrors = [];
  failedRequests = [];
  testArtifactsDir = join(process.cwd(), '.smoke-test');
  mkdirSync(testArtifactsDir, { recursive: true });
  page.on('console', (msg) => {
    const text = msg.text();
    if (!text.trim() || /^%[osd]$/.test(text.trim())) return;
    consoleLogs.push(`[${msg.type()}] ${text}`);
    if (msg.type() === 'error') consoleErrors.push(text);
  });
  page.on('pageerror', (error) => {
    pageErrors.push(`Page error: ${error.message}\nStack: ${error.stack || ''}`);
  });
  page.on('requestfailed', (request) => {
    failedRequests.push(`Failed request: ${request.url()} - ${request.failure()?.errorText}`);
  });
});

test.afterEach(async ({ page }, testInfo) => {
  const testName = testInfo.title.replace(/ /g, '-').toLowerCase();
  await page.screenshot({ path: join(testArtifactsDir, `${testName}-app-screenshot.png`), fullPage: true });
  writeFileSync(
    join(testArtifactsDir, `${testName}-console-logs.txt`),
    ['=== Console Logs ===', ...consoleLogs, '\n=== Errors ===', ...consoleErrors, ...pageErrors, ...failedRequests].join('\n'),
    'utf-8',
  );
  await page.close();
});
