import { baseSiteTransformer } from './dataTransformers';
import { SAPParameters } from '../interfaces';
import { BaseAppSDK, CMAClient } from '@contentful/app-sdk';
import { toHAAParams } from '../helpers/toHAAParams';
import { buildApiEndpoint } from '../utils';

export async function fetchBaseSitesHAA(ids: BaseAppSDK['ids'], cma: CMAClient): Promise<string[]> {
  const { response } = await cma.appActionCall.createWithResponse(
    toHAAParams('fetchBaseSites', ids),
    { parameters: {} }
  );
  const responseJson = JSON.parse(response.body);
  if (!responseJson.ok) {
    throw new Error(response.statusCode.toString());
  }
  return responseJson.data;
}

export async function fetchBaseSites(parameters: SAPParameters): Promise<string[]> {
  try {
    const { baseUrl, apiVersion } = parameters.installation;
    const apiEndpoint = buildApiEndpoint(baseUrl, apiVersion);
    const url = `${apiEndpoint}/v2/basesites`;
    const response = await fetch(url);
    if (response.ok) {
      const responseJson = await response.json();
      const baseSites = responseJson['baseSites'].map(baseSiteTransformer());
      return baseSites;
    }
    throw new Error(response.statusText);
  } catch (error) {
    throw error;
  }
}
