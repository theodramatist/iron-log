// Optional smoke test (CLAUDE.md, M3): click through the week of 2026-11-02 in
// a real browser with the dev-only `?today=` override, and check every Today
// card against the engine's own prescription for the log the app stored.
// Then check T77 in the real session screen: a rest timer stays right across
// a reload two minutes later.
//
//   npm run smoke
//
// Needs Playwright's Chromium. It starts its own Vite dev server.

/* global indexedDB */

import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { createServer } from 'vite';

const PORT = 5199;
const BASE = `http://localhost:${PORT}/`;

const server = await createServer({ server: { port: PORT, strictPort: true }, logLevel: 'warn' });
await server.listen();
const engine = await server.ssrLoadModule('/src/engine/index.ts');
const { default: program } = await server.ssrLoadModule('/src/program/program.json');

const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
const problems = [];
page.on('console', (m) => m.type() === 'error' && problems.push(m.text()));
page.on('pageerror', (e) => problems.push(e.message));
await page.clock.install({ time: new Date('2026-11-03T23:00:00Z') });

/** The log the app stored, as the engine's input for `today`. */
async function storedInput(today) {
  const { events, settings } = await page.evaluate(
    () =>
      new Promise((resolve, reject) => {
        const open = indexedDB.open('iron-log');
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const tx = open.result.transaction(['events', 'meta'], 'readonly');
          const all = tx.objectStore('events').getAll();
          const settings = tx.objectStore('meta').get('settings');
          tx.oncomplete = () => {
            resolve({ events: all.result, settings: settings.result ?? {} });
            open.result.close();
          };
        };
      }),
  );
  return { program, settings, events, today };
}

async function checkCard(date) {
  await page.goto(`${BASE}?today=${date}`);
  await page.waitForSelector('section[aria-label="Today\'s session"]');
  const shown = await page.locator('section[aria-label="Today\'s session"] .lines li').allInnerTexts();
  const day = engine.planFor(await storedInput(date), date);
  const expected =
    day.kind === 'conditioning'
      ? [
          `${day.conditioning.targetMinutes} min easy · ${day.conditioning.machines.easy}`,
          ...(day.conditioning.intervals > 0 ? [`${day.conditioning.intervals} intervals · ${day.conditioning.machines.intervals}`] : []),
          ...(day.conditioning.noIntervalsReason ? [day.conditioning.noIntervalsReason] : []),
        ]
      : day.summary;
  assert.deepEqual(shown, expected, `${date}: the Today card should match the engine`);
  await noExclamation(`Today ${date}`);
  console.log(`${date}  ${day.kind.padEnd(12)} ${shown.join(' | ')}`);
  return day;
}

/** CLAUDE.md, ground rule 8: no exclamation points anywhere in the interface. */
async function noExclamation(where) {
  const text = await page.locator('body').innerText();
  assert.ok(!text.includes('!'), `${where}: an exclamation point on screen`);
}

const pick = (group, name) => page.getByRole('group', { name: group }).getByRole('button', { name, exact: true });

async function skipTimer() {
  const skip = page.locator('.timer .skip');
  if (await skip.count()) await skip.click();
}

async function clickEach(locator) {
  for (let guard = 0; (await locator.count()) > 0; guard++) {
    assert.ok(guard < 40, 'too many taps');
    await locator.first().click();
    await skipTimer();
  }
}

async function setup() {
  await page.goto(`${BASE}?today=2026-11-03`);
  for (let step = 1; step <= 6; step++) {
    // Walk forward and back once so every setup screen is checked.
    await noExclamation(`setup step ${step}`);
    if (step < 6) await page.locator('.btn-row .btn-primary').last().evaluate((b) => b.disabled && b.removeAttribute('disabled'));
    if (step < 6) await page.getByRole('button', { name: 'Next' }).click();
  }
  for (let step = 6; step > 1; step--) await page.getByRole('button', { name: 'Back' }).click();
  await page.getByRole('button', { name: 'Next' }).click();
  await pick('Squat: how did the last work set feel?', '3–4 reps left').click();
  await pick('Press: how did the last work set feel?', '1–2 reps left').click();
  await pick('Deadlift: how did the last work set feel?', '3–4 reps left').click();
  await pick('Chins: reps to spare on the last set', '2+').click();
  await page.getByRole('button', { name: 'Next' }).click();
  await page.getByRole('button', { name: '40 and over', exact: true }).click();
  for (let i = 0; i < 3; i++) await page.getByRole('button', { name: 'Next' }).click();
  await page.getByRole('button', { name: "I've read this" }).click();
  await page.getByRole('button', { name: 'Finish' }).click();
  await page.waitForSelector('text=Start session');
}

async function conditioning(date) {
  const day = await checkCard(date);
  assert.equal(day.kind, 'conditioning');
  await page.getByRole('button', { name: 'Start session' }).click();
  await pick('Last night under 6 hours?', 'No').click();
  await page.getByRole('button', { name: 'Start', exact: true }).click();
  await page.clock.fastForward(`${day.conditioning.targetMinutes}:05`);
  await page.waitForSelector('text=Minutes done');
  await noExclamation(`conditioning ${date}`);
  await page.getByRole('button', { name: 'Save session' }).click();
  await page.getByRole('button', { name: 'Done', exact: true }).click();
}

async function lifting(date) {
  const day = await checkCard(date);
  assert.equal(day.kind, 'lifting');
  await page.getByRole('button', { name: 'Start session' }).click();
  for (const q of program.checkIns.liftingStart) await pick(q.text, 'No').click();
  await page.getByRole('button', { name: 'Begin' }).click();
  await page.locator('.check-row', { hasText: '5 easy minutes' }).click();
  const cards = page.locator('.session section.card');
  for (let i = 0; i < (await cards.count()); i++) {
    const card = cards.nth(i);
    const label = await card.getAttribute('aria-label');
    if (label === 'Chins and dips') continue;
    if (label.endsWith('calibration')) {
      for (const b of ['Fast', 'Fast', 'Fast', 'Starting to slow', 'Clearly slowed']) {
        await card.getByRole('button', { name: b, exact: true }).click();
        await skipTimer();
      }
    } else {
      await clickEach(card.locator('.check-row[aria-pressed="false"]'));
    }
    await clickEach(card.locator('button.set-main[aria-label$="not done"]'));
    await card.getByRole('group', { name: 'Effort rating' }).getByRole('button', { name: '3–4 reps left' }).click();
  }
  const block = page.locator('section[aria-label="Chins and dips"]');
  if (await block.getByRole('button', { name: 'Next set: 10 lb less help' }).count()) {
    for (const b of ['Next set: 10 lb less help', 'Next set: 10 lb less help', 'Next set: 10 lb less help', 'Close: 5 lb less', '5 solid with 2 or 3 to spare']) {
      await block.getByRole('button', { name: b }).click();
    }
  }
  await clickEach(block.locator('button.done-btn[aria-pressed="false"]'));
  for (const m of ['Chin-up (assisted)', 'Dip (assisted)']) await block.getByRole('group', { name: `${m}: reps to spare` }).getByRole('button', { name: '2+' }).click();
  await noExclamation(`lifting ${date}`);
  await page.getByRole('button', { name: 'Finish', exact: true }).click();
  await pick('Did warm-ups feel heavy today?', 'No').click();
  await page.getByRole('button', { name: 'Save session' }).click();
  await page.waitForSelector('text=Next time');
  await noExclamation(`summary ${date}`);
  await page.getByRole('button', { name: 'Done', exact: true }).click();
}

try {
  await setup();
  await conditioning('2026-11-03');
  await lifting('2026-11-04');
  await conditioning('2026-11-05');
  await lifting('2026-11-06');
  const monday = await checkCard('2026-11-09');

  const week = engine.weekSummary(await storedInput('2026-11-08'), '2026-11-02');
  assert.equal(week.liftingDone, 3, 'three lifting sessions that week');
  assert.equal(week.conditioningDone, 2, 'two conditioning sessions that week');

  // T77 in the real screen: start a rest, leave for two minutes, come back.
  const squat = engine.prescribe(await storedInput('2026-11-09'), '2026-11-09').lifts.find((l) => l.lift === 'squat');
  assert.equal(monday.kind, 'lifting');
  await page.getByRole('button', { name: 'Start session' }).click();
  for (const q of program.checkIns.liftingStart) await pick(q.text, 'No').click();
  await page.getByRole('button', { name: 'Begin' }).click();
  await page.locator('section[aria-label="Squat"] button.set-main').first().click();
  await page.clock.fastForward('02:00');
  await page.reload();
  await page.waitForSelector('.timer');
  const left = await page.locator('.timer-time').innerText();
  const want = squat.restSec - 120;
  assert.equal(left, `${Math.floor(want / 60)}:${String(want % 60).padStart(2, '0')}`, 'T77: the rest timer after two minutes away');
  console.log(`T77        rest ${squat.restSec} s, ${left} left after two minutes and a reload`);

  assert.deepEqual(problems, [], 'no console errors');
  console.log('Smoke test passed.');
} finally {
  await browser.close();
  await server.close();
}
