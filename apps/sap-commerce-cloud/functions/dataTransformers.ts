import get from 'lodash/get';
import { Product, Hash, ConfigurationParameters } from './types';

export const productTransformer =
  (
    { baseUrl, apiVersion }: ConfigurationParameters,
    skuIdsToSkusMap: { [key: string]: string },
    baseSite?: string
  ) =>
  (item: Hash): Product => {
    const id = get(item, ['id'], '');
    let imageUrl = get(item, ['images', 0, 'url'], '');
    if (imageUrl.length > 0 && baseUrl) {
      // Media URLs use the base URL without /occ or /rest
      imageUrl = baseUrl + imageUrl;
    }
    const sku = get(item, ['code'], '');
    const apiEndpoint = baseUrl && apiVersion ? `${baseUrl}/${apiVersion}` : '';
    const productUrl = skuIdsToSkusMap[sku]
      ? skuIdsToSkusMap[sku]
      : baseSite && apiEndpoint
      ? `${apiEndpoint}/v2/${baseSite}/products/${sku}`
      : '';

    return {
      id,
      image: imageUrl,
      name: get(item, ['name'], '')
        .replaceAll('<em class="search-results-highlight">', '')
        .replaceAll('</em>', ''),
      sku,
      productUrl: productUrl,
    };
  };

export const baseSiteTransformer =
  () =>
  (item: Hash): string => {
    return get(item, ['uid'], '');
  };

export const productDetailsTransformer =
  ({ baseUrl }: ConfigurationParameters) =>
  (item: Hash): Product => {
    const id = get(item, ['id'], '');
    let imageUrl = get(item, ['images', 0, 'url'], '');
    if (imageUrl.length > 0 && baseUrl) {
      // Media URLs use the base URL without /occ or /rest
      imageUrl = baseUrl + imageUrl;
    }
    return {
      id,
      image: imageUrl,
      name: get(item, ['name'], '')
        .replaceAll('<em class="search-results-highlight">', '')
        .replaceAll('</em>', ''),
      sku: get(item, ['code'], ''),
      productUrl: '',
    };
  };
