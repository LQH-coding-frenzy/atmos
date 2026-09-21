import assert from 'node:assert/strict';
import test from 'node:test';
import { queueConsumerRetirementAction } from './queue-consumer-retirement.mjs';

test('removes only the expected sole queue consumer', () => {
  assert.equal(
    queueConsumerRetirementAction([{ script: 'atmos-gateway' }], 'atmos-gateway'),
    'remove',
  );
  assert.equal(queueConsumerRetirementAction([], 'atmos-gateway'), 'absent');
});

test('fails closed for malformed or unexpected consumer inventories', () => {
  for (const consumers of [
    undefined,
    [{ script: 'atmos-gateway' }, { script: 'other-worker' }],
    [{ script: 'other-worker' }],
    [{}],
  ]) {
    assert.throws(() => queueConsumerRetirementAction(consumers, 'atmos-gateway'));
  }
});
