import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

export function queueConsumerRetirementAction(consumers, expectedScript) {
  if (!Array.isArray(consumers) || !/^[a-z0-9-]+$/.test(expectedScript)) {
    throw new Error('Queue consumer inventory is invalid.');
  }

  const scripts = [...new Set(consumers.map((consumer) => consumer?.script))];
  if (scripts.some((script) => typeof script !== 'string')) {
    throw new Error('Queue consumer inventory is invalid.');
  }
  if (scripts.length === 0) return 'absent';
  if (scripts.length === 1 && scripts[0] === expectedScript) return 'remove';

  throw new Error('Queue has an unexpected consumer configuration.');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const [expectedScript, inventoryPath] = process.argv.slice(2);
    const consumers = JSON.parse(readFileSync(inventoryPath, 'utf8'));
    process.stdout.write(queueConsumerRetirementAction(consumers, expectedScript));
  } catch (error) {
    process.stderr.write(
      `${error instanceof Error ? error.message : 'Queue consumer inventory is invalid.'}\n`,
    );
    process.exitCode = 1;
  }
}
