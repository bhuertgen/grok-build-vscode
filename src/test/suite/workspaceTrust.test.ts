import * as assert from 'node:assert/strict';
import {
  assertWorkspaceTrustedForWrite,
  getTrustBannerMessage,
  isWorkspaceTrusted,
} from '../../util/workspaceTrust';

suite('workspaceTrust helpers', () => {
  test('isWorkspaceTrusted returns boolean', () => {
    assert.equal(typeof isWorkspaceTrusted(), 'boolean');
  });

  test('getTrustBannerMessage is non-empty German/English guidance', () => {
    const msg = getTrustBannerMessage();
    assert.ok(msg.length > 20);
    assert.match(msg, /trust|Trust|Restricted|vertrauen/i);
  });

  test('assertWorkspaceTrustedForWrite does not throw when trusted', () => {
    // Integration host launches with --disable-workspace-trust → typically trusted
    if (!isWorkspaceTrusted()) {
      assert.throws(() => assertWorkspaceTrustedForWrite('test.txt'));
      return;
    }
    assert.doesNotThrow(() => assertWorkspaceTrustedForWrite('sandbox/x.txt'));
  });
});
