import { describe, expect, it } from 'vitest';
import {
  filterFieldsToLocales,
  mergeLocalizedFields,
  resolveDefaultSelectedLocales,
} from '../../src/utils/localeUtils';
import { AppParameters } from '../../src/vite-env';

describe('localeUtils', () => {
  const locales = [
    { code: 'en-US', name: 'English', default: true },
    { code: 'sv-SE', name: 'Swedish', default: false },
  ];

  it('resolves defaultOnly to the source default locale', () => {
    const parameters = { localeCopyMode: 'defaultOnly' } as AppParameters;
    expect(resolveDefaultSelectedLocales(parameters, locales)).toEqual(['en-US']);
  });

  it('resolves all locales', () => {
    const parameters = { localeCopyMode: 'all' } as AppParameters;
    expect(resolveDefaultSelectedLocales(parameters, locales)).toEqual(['en-US', 'sv-SE']);
  });

  it('filters fields to selected locales', () => {
    const fields = {
      title: {
        'en-US': 'Hello',
        'sv-SE': 'Hej',
      },
    };

    expect(filterFieldsToLocales(fields, ['en-US'])).toEqual({
      title: { 'en-US': 'Hello' },
    });
  });

  it('merges selected locales into existing target fields', () => {
    const target = {
      title: {
        'en-US': 'Old EN',
        'sv-SE': 'Market SV',
      },
    };
    const source = {
      title: {
        'en-US': 'New EN',
        'sv-SE': 'HQ SV',
      },
    };

    expect(mergeLocalizedFields(target, source, ['en-US'])).toEqual({
      title: {
        'en-US': 'New EN',
        'sv-SE': 'Market SV',
      },
    });
  });
});
