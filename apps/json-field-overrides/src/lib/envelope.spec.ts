import { describe, expect, it } from 'vitest';
import {
  DELETED,
  adoptPlainJsonAsEnvelope,
  applyOverrides,
  buildEnvelope,
  classifyFieldValue,
  clearOverrideAtPath,
  getValueAtPath,
  hasOverrideAtPath,
  isTombstonedAtPath,
  pruneOverrides,
  setOverrideAtPath,
  unwrapEnvelope,
} from './envelope';

describe('applyOverrides', () => {
  it('returns source when overrides are empty', () => {
    const source = { a: 1, b: { c: 2 } };
    expect(applyOverrides(source, {})).toEqual(source);
  });

  it('replaces primitives and omits tombstones', () => {
    const source = { title: 'hello', count: 1, nested: { city: 'Berlin' } };
    const overrides = {
      title: 'world',
      count: DELETED,
      nested: { city: 'Paris' },
    };
    expect(applyOverrides(source, overrides)).toEqual({
      title: 'world',
      nested: { city: 'Paris' },
    });
  });

  it('replaces arrays wholesale when override is an array', () => {
    const source = { items: [{ id: 1 }, { id: 2 }], name: 'x' };
    const overrides = { items: [{ id: 9 }] };
    expect(applyOverrides(source, overrides)).toEqual({
      items: [{ id: 9 }],
      name: 'x',
    });
  });

  it('applies nested overrides inside array elements by index', () => {
    const source = {
      vehicles: [
        { transmissionCode: 'S02TE', hybridCode: 'PHEV' },
        { transmissionCode: 'OTHER', hybridCode: 'ICE' },
      ],
    };
    const overrides = {
      vehicles: {
        '0': { transmissionCode: 'CUSTOM' },
      },
    };
    expect(applyOverrides(source, overrides)).toEqual({
      vehicles: [
        { transmissionCode: 'CUSTOM', hybridCode: 'PHEV' },
        { transmissionCode: 'OTHER', hybridCode: 'ICE' },
      ],
    });
  });

  it('omits tombstoned array elements', () => {
    const source = { items: ['a', 'b', 'c'] };
    const overrides = { items: { '1': DELETED } };
    expect(applyOverrides(source, overrides)).toEqual({ items: ['a', 'c'] });
  });

  it('ignores override keys that are not in source', () => {
    const source = { a: 1 };
    const overrides = { a: 2, extra: 3 };
    expect(applyOverrides(source, overrides)).toEqual({ a: 2 });
  });
});

describe('pruneOverrides', () => {
  it('drops orphan keys after source refresh', () => {
    const source = { a: 1 };
    const overrides = { a: 2, gone: DELETED, nested: { x: 1 } };
    expect(pruneOverrides(source, overrides)).toEqual({ a: 2 });
  });

  it('keeps tombstones for keys that still exist', () => {
    const source = { a: 1, b: 2 };
    expect(pruneOverrides(source, { a: DELETED })).toEqual({ a: DELETED });
  });

  it('drops array index overrides that are out of range', () => {
    const source = { items: [{ id: 1 }] };
    const overrides = {
      items: {
        '0': { id: 9 },
        '5': { id: 1 },
      },
    };
    expect(pruneOverrides(source, overrides)).toEqual({ items: { '0': { id: 9 } } });
  });

  it('returns undefined when nothing remains', () => {
    expect(pruneOverrides({ a: 1 }, { b: 2 })).toBeUndefined();
  });
});

describe('setOverrideAtPath / clearOverrideAtPath', () => {
  it('sets nested overrides and clears them', () => {
    let overrides = setOverrideAtPath({}, ['address', 'city'], 'Oslo');
    expect(overrides).toEqual({ address: { city: 'Oslo' } });
    expect(hasOverrideAtPath(overrides, ['address', 'city'])).toBe(true);

    overrides = setOverrideAtPath(overrides, ['title'], DELETED);
    expect(isTombstonedAtPath(overrides, ['title'])).toBe(true);

    overrides = clearOverrideAtPath(overrides, ['address', 'city']);
    expect(overrides).toEqual({ title: DELETED });
  });

  it('sets overrides inside array indices', () => {
    const overrides = setOverrideAtPath({}, ['vehicles', '0', 'transmissionCode'], 'X');
    expect(overrides).toEqual({ vehicles: { '0': { transmissionCode: 'X' } } });
    expect(getValueAtPath({ vehicles: [{ transmissionCode: 'S02TE' }] }, ['vehicles', '0', 'transmissionCode'])).toBe(
      'S02TE'
    );
  });
});

describe('buildEnvelope', () => {
  it('persists source, pruned overrides, and effective', () => {
    const envelope = buildEnvelope(
      { title: 'A', tags: ['x'], meta: { n: 1 } },
      { title: 'B', tags: ['y', 'z'], gone: 1, meta: { n: DELETED } }
    );

    expect(envelope.source).toEqual({ title: 'A', tags: ['x'], meta: { n: 1 } });
    expect(envelope.overrides).toEqual({
      title: 'B',
      tags: ['y', 'z'],
      meta: { n: DELETED },
    });
    expect(envelope.effective).toEqual({ title: 'B', tags: ['y', 'z'], meta: {} });
  });

  it('builds effective vehicle overrides for BMW-like payloads', () => {
    const source = {
      code: '71FJ',
      vehicles: [
        {
          transmissionCode: 'S02TE',
          technicalData: { performance: { topSpeed: '230' } },
          footnotes: { powerTrain: ['f1', 'f2'] },
        },
      ],
    };

    const overrides = setOverrideAtPath(
      setOverrideAtPath({}, ['vehicles', '0', 'transmissionCode'], 'CUSTOM'),
      ['vehicles', '0', 'footnotes', 'powerTrain', '1'],
      'f99'
    );

    const envelope = buildEnvelope(source, overrides);
    expect(envelope.effective).toEqual({
      code: '71FJ',
      vehicles: [
        {
          transmissionCode: 'CUSTOM',
          technicalData: { performance: { topSpeed: '230' } },
          footnotes: { powerTrain: ['f1', 'f99'] },
        },
      ],
    });
  });
});

describe('classifyFieldValue / adopt / unwrap', () => {
  it('classifies plain JSON vs envelope', () => {
    expect(classifyFieldValue(null)).toEqual({ kind: 'empty' });
    expect(classifyFieldValue({ code: '71FJ' })).toEqual({
      kind: 'plainObject',
      value: { code: '71FJ' },
    });
    expect(classifyFieldValue(['a'])).toEqual({ kind: 'unsupported' });

    const envelope = buildEnvelope({ code: '71FJ' }, {});
    expect(classifyFieldValue(envelope).kind).toBe('envelope');
  });

  it('adopts plain JSON into an envelope and unwraps back', () => {
    const plain = { code: '71FJ', name: 'BMW' };
    const adopted = adoptPlainJsonAsEnvelope(plain);
    expect(adopted).toEqual({
      source: plain,
      overrides: {},
      effective: plain,
    });

    const withOverride = buildEnvelope(plain, { name: 'Custom' });
    expect(unwrapEnvelope(withOverride, 'effective')).toEqual({ code: '71FJ', name: 'Custom' });
    expect(unwrapEnvelope(withOverride, 'source')).toEqual(plain);
  });
});
