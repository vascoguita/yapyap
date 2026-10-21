import { expect, test } from '@playwright/test';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { measureOnce, median, type Sample } from './measure.ts';

const RUNS = 7;

interface Budget {
  readonly coldStartMs: number;
  readonly idleMemoryMb: number;
}

test('stays within the cold-start and idle-memory budgets', async ({}, testInfo) => {
  test.setTimeout((RUNS + 1) * 60_000);
  const budgets = JSON.parse(
    await readFile(join(import.meta.dirname, 'budgets.json'), 'utf8'),
  ) as Record<string, Budget | undefined>;
  const budget = budgets[process.platform];
  if (budget === undefined) throw new Error(`No budget for ${process.platform}`);
  // The first launch on a runner waits for the disk cache, which says nothing
  // about YapYap, so it warms up and is left out.
  await measureOnce();
  const samples: Sample[] = [];
  for (let run = 0; run < RUNS; run += 1) samples.push(await measureOnce());
  const result = {
    platform: process.platform,
    coldStartMs: median(samples.map((sample) => sample.coldStartMs)),
    idleMemoryMb: median(samples.map((sample) => sample.idleMemoryMb)),
    budget,
    samples,
  };
  await writeFile(testInfo.outputPath('benchmark.json'), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result));
  expect.soft(result.coldStartMs, 'median cold start (ms)').toBeLessThanOrEqual(budget.coldStartMs);
  expect
    .soft(result.idleMemoryMb, 'median idle memory (MB)')
    .toBeLessThanOrEqual(budget.idleMemoryMb);
});
