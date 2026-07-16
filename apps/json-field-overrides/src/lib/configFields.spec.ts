import { describe, expect, it } from 'vitest';
import {
  contentTypesWithJsonFields,
  restoreSelectedFields,
  selectedFieldsToTargetState,
  toggleFieldSelection,
} from './configFields';

const sampleContentTypes = [
  {
    sys: { id: 'product' },
    name: 'Product',
    fields: [
      { id: 'title', name: 'Title', type: 'Symbol' },
      { id: 'vehicleData', name: 'Vehicle data', type: 'Object' },
      { id: 'specs', name: 'Specs', type: 'Object' },
    ],
  },
  {
    sys: { id: 'page' },
    name: 'Page',
    fields: [{ id: 'slug', name: 'Slug', type: 'Symbol' }],
  },
];

describe('configFields', () => {
  it('keeps only content types that have JSON Object fields', () => {
    const compatible = contentTypesWithJsonFields(sampleContentTypes);
    expect(compatible.map((ct) => ct.sys.id)).toEqual(['product']);
  });

  it('toggles field selection and builds EditorInterface target state', () => {
    let selected = toggleFieldSelection({}, 'product', 'vehicleData', true);
    selected = toggleFieldSelection(selected, 'product', 'specs', true);
    selected = toggleFieldSelection(selected, 'product', 'specs', false);

    expect(selected).toEqual({ product: ['vehicleData'] });

    const target = selectedFieldsToTargetState(sampleContentTypes, selected);
    expect(target.EditorInterface).toEqual({
      product: { controls: [{ fieldId: 'vehicleData' }] },
      page: {},
    });
  });

  it('restores selection from current app state', () => {
    const available = [
      {
        fieldUniqueId: 'product.vehicleData',
        displayName: 'Product > Vehicle data',
        contentTypeId: 'product',
        contentTypeName: 'Product',
        fieldId: 'vehicleData',
        fieldName: 'Vehicle data',
      },
      {
        fieldUniqueId: 'product.specs',
        displayName: 'Product > Specs',
        contentTypeId: 'product',
        contentTypeName: 'Product',
        fieldId: 'specs',
        fieldName: 'Specs',
      },
    ];

    const restored = restoreSelectedFields(available, {
      EditorInterface: {
        product: { controls: [{ fieldId: 'specs' }] },
      },
    });

    expect(restored).toEqual({ product: ['specs'] });
  });
});
