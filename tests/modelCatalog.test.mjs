import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  loadModelCatalog,
  formatModelLabel,
  sessionModelContextBlock,
  clearModelCatalogCache,
} = require('../dist-test/modelCatalog.js');

describe('modelCatalog', () => {
  it('falls back when cache missing', () => {
    clearModelCatalogCache();
    const list = loadModelCatalog(path.join(os.tmpdir(), 'no-such-models.json'));
    assert.ok(list.some((m) => m.id === 'grok-4.5'));
    assert.ok(list.some((m) => m.id === 'grok-composer-2.5-fast'));
  });

  it('reads models_cache.json shape', () => {
    clearModelCatalogCache();
    const tmp = path.join(os.tmpdir(), `models_cache_${Date.now()}.json`);
    fs.writeFileSync(
      tmp,
      JSON.stringify({
        models: {
          'grok-composer-2.5-fast': {
            info: {
              id: 'grok-composer-2.5-fast',
              name: 'Composer 2.5',
              description: 'Cursor coding',
              agent_type: 'cursor',
            },
          },
        },
      }),
      'utf8'
    );
    try {
      const list = loadModelCatalog(tmp);
      assert.equal(list.length, 1);
      assert.equal(list[0].name, 'Composer 2.5');
      assert.equal(
        formatModelLabel('grok-composer-2.5-fast', tmp),
        'Composer 2.5 (`grok-composer-2.5-fast`)'
      );
    } finally {
      fs.unlinkSync(tmp);
    }
  });

  it('sessionModelContextBlock names the id clearly', () => {
    const block = sessionModelContextBlock('grok-composer-2.5-fast');
    assert.match(block, /Active model id: grok-composer-2\.5-fast/);
    assert.match(block, /Do not claim you are a different model/i);
  });

  it('empty model yields empty block', () => {
    assert.equal(sessionModelContextBlock(''), '');
    assert.equal(sessionModelContextBlock(undefined), '');
  });
});
