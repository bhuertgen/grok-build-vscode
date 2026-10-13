import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  parseElicitationCreateParams,
  isFormElicitation,
  isUrlElicitation,
  validateFormContent,
  collectSchemaDefaults,
  extractUrlHost,
  isSuspiciousUrl,
  acceptForm,
  acceptUrl,
  declineElicitation,
  cancelElicitation,
} = require('../dist-test/elicitation.js');

describe('parseElicitationCreateParams', () => {
  it('parses form mode', () => {
    const p = parseElicitationCreateParams({
      sessionId: 's1',
      mode: 'form',
      message: 'Pick a strategy',
      requestedSchema: {
        type: 'object',
        properties: {
          strategy: { type: 'string', enum: ['a', 'b'] },
        },
        required: ['strategy'],
      },
    });
    assert.ok(p);
    assert.equal(p.mode, 'form');
    assert.equal(isFormElicitation(p), true);
    assert.equal(isUrlElicitation(p), false);
  });

  it('parses url mode', () => {
    const p = parseElicitationCreateParams({
      sessionId: 's1',
      mode: 'url',
      message: 'Authorize',
      elicitationId: 'e1',
      url: 'https://example.com/oauth',
    });
    assert.ok(p);
    assert.equal(isUrlElicitation(p), true);
    assert.equal(p.elicitationId, 'e1');
  });

  it('rejects missing mode/message', () => {
    assert.equal(parseElicitationCreateParams({ mode: 'form' }), null);
    assert.equal(parseElicitationCreateParams(null), null);
  });
});

describe('validateFormContent', () => {
  const schema = {
    type: 'object',
    properties: {
      name: { type: 'string', minLength: 1 },
      age: { type: 'integer', minimum: 0, maximum: 120 },
      ok: { type: 'boolean' },
    },
    required: ['name'],
  };

  it('requires fields', () => {
    const v = validateFormContent(schema, {});
    assert.equal(v.ok, false);
    assert.ok(v.errors.some((e) => /name/i.test(e)));
  });

  it('accepts valid content', () => {
    const v = validateFormContent(schema, { name: 'Ada', age: 30, ok: true });
    assert.equal(v.ok, true);
    assert.equal(v.content.name, 'Ada');
    assert.equal(v.content.age, 30);
    assert.equal(v.content.ok, true);
  });

  it('collects defaults', () => {
    const d = collectSchemaDefaults({
      properties: { x: { type: 'string', default: 'hi' } },
    });
    assert.equal(d.x, 'hi');
  });
});

describe('url helpers + responses', () => {
  it('extracts host and flags suspicious', () => {
    assert.equal(extractUrlHost('https://agent.example.com/path'), 'agent.example.com');
    assert.equal(isSuspiciousUrl('https://example.com'), false);
    assert.equal(isSuspiciousUrl('javascript:alert(1)'), true);
  });

  it('builds response actions', () => {
    assert.deepEqual(acceptForm({ a: 1 }), { action: 'accept', content: { a: 1 } });
    assert.deepEqual(acceptUrl(), { action: 'accept' });
    assert.deepEqual(declineElicitation(), { action: 'decline' });
    assert.deepEqual(cancelElicitation(), { action: 'cancel' });
  });
});

describe('multi-select (CLI >= 1.0.51)', () => {
  const { arrayItemOptions, isSupportedFieldType } = require('../dist-test/elicitation.js');
  const schema = {
    type: 'object',
    properties: {
      langs: { type: 'array', items: { enum: ['ts', 'py', 'go'] }, minItems: 1, maxItems: 2 },
      picks: { type: 'array', items: { anyOf: [{ const: 'a', title: 'Alpha' }, { const: 'b' }] } },
      blob: { type: 'object' },
    },
  };
  it('extracts options from items.enum and items.anyOf', () => {
    assert.deepEqual(arrayItemOptions(schema.properties.langs).map((o) => o.value), ['ts', 'py', 'go']);
    assert.deepEqual(arrayItemOptions(schema.properties.picks), [
      { value: 'a', title: 'Alpha' },
      { value: 'b', title: 'b' },
    ]);
    assert.equal(arrayItemOptions({ type: 'array' }), null);
  });
  it('accepts valid selections', () => {
    const r = validateFormContent(schema, { langs: ['ts', 'go'], picks: ['a'] });
    assert.equal(r.ok, true);
    assert.deepEqual(r.content.langs, ['ts', 'go']);
  });
  it('rejects invalid option and min/max violations', () => {
    assert.equal(validateFormContent(schema, { langs: ['rust'] }).ok, false);
    assert.equal(validateFormContent(schema, { langs: [] }).ok, false);
    assert.equal(validateFormContent(schema, { langs: ['ts', 'py', 'go'] }).ok, false);
  });
  it('skips unknown field types without crashing', () => {
    assert.equal(isSupportedFieldType('object'), false);
    const r = validateFormContent(schema, { blob: { x: 1 }, picks: ['b'] });
    assert.equal(r.ok, true);
    assert.equal('blob' in r.content, false);
  });
  it('unknown mode parses without throwing', () => {
    const p = parseElicitationCreateParams({ mode: 'future', message: 'hi' });
    assert.equal(p.mode, 'future');
  });
});
