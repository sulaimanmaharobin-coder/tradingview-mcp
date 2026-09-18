/**
 * Tests for computeUpdateStatus() in src/core/health.js.
 * The update flag must reflect whether the remote HEAD is already in local
 * history, not merely whether the shas differ (a fork or feature branch that
 * is ahead of origin/main has nothing to pull).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { computeUpdateStatus } from '../src/core/health.js';

const A = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const B = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';

describe('computeUpdateStatus', () => {
  it('reports up to date when local and remote shas are equal', () => {
    const r = computeUpdateStatus(A, A, () => { throw new Error('should not be called'); });
    assert.equal(r.update_available, false);
    assert.equal(r.local_commit, A.slice(0, 8));
    assert.equal(r.latest_commit, A.slice(0, 8));
    assert.equal(r.hint, undefined);
  });

  it('reports up to date when local is ahead of remote (remote is an ancestor)', () => {
    const calls = [];
    const r = computeUpdateStatus(B, A, (sha) => { calls.push(sha); return true; });
    assert.equal(r.update_available, false);
    assert.equal(r.hint, undefined);
    assert.deepEqual(calls, [A]);
  });

  it('reports an update when remote is not in local history', () => {
    const r = computeUpdateStatus(A, B, () => false);
    assert.equal(r.update_available, true);
    assert.equal(r.local_commit, A.slice(0, 8));
    assert.equal(r.latest_commit, B.slice(0, 8));
    assert.match(r.hint, /tv_update/);
  });
});
