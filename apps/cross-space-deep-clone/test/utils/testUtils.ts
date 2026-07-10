import type { AssetProps, EntryProps, KeyValueMap } from 'contentful-management';

export const getMockContentType = (fields: KeyValueMap[], displayField: string = 'title') => ({
  sys: { id: 'testContentType' },
  fields,
  displayField,
});

export const getMockEntry = (id: string, fields: KeyValueMap): EntryProps => ({
  sys: {
    id,
    type: 'Entry',
    contentType: { sys: { id: 'testContentType', type: 'Link', linkType: 'ContentType' } },
    version: 1,
    createdAt: '2023-01-01T00:00:00Z',
    updatedAt: '2023-01-01T00:00:00Z',
    space: { sys: { id: 'space-id', type: 'Link', linkType: 'Space' } },
    environment: { sys: { id: 'environment-id', type: 'Link', linkType: 'Environment' } },
    automationTags: [],
  },
  fields,
});

export const getMockAsset = (id: string, title: string): AssetProps => ({
  sys: {
    id,
    type: 'Asset',
    version: 1,
    createdAt: '2023-01-01T00:00:00Z',
    updatedAt: '2023-01-01T00:00:00Z',
    space: { sys: { id: 'space-id', type: 'Link', linkType: 'Space' } },
    environment: { sys: { id: 'environment-id', type: 'Link', linkType: 'Environment' } },
  },
  fields: {
    title: { 'en-US': title },
    file: {
      'en-US': {
        url: '//images.ctfassets.net/example/asset.jpg',
        fileName: `${title}.jpg`,
        contentType: 'image/jpeg',
      },
    },
  },
});
