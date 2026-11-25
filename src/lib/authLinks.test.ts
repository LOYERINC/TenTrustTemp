import assert from 'node:assert/strict';
import test from 'node:test';
import { safeDashboardReturnTo } from './authLinks';
test('email report deep links survive sign-in without permitting external redirects', () => {
  const origin = 'https://www.tentrust.com.ng';
  assert.equal(safeDashboardReturnTo('/dashboard?report=test&tab=verify-tenant', origin), '/dashboard?report=test&tab=verify-tenant');
  for (const value of ['//evil.example', '/\\evil.example', 'https://evil.example', '/admin', '/dashboard/else', null]) {
    assert.equal(safeDashboardReturnTo(value, origin), null);
  }
});
