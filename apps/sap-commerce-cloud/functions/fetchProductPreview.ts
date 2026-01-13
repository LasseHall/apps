import { FunctionEventHandler } from '@contentful/node-apps-toolkit';
import {
  AppActionRequest,
  FunctionEventContext,
  FunctionTypeEnum,
} from '@contentful/node-apps-toolkit/lib/requests/typings';
import { SapService } from './services/sapService';

interface AppActionCallParameters {
  skus: string;
}

export const handler: FunctionEventHandler<FunctionTypeEnum.AppActionCall> = async (
  event: AppActionRequest<'Custom', AppActionCallParameters>,
  context: FunctionEventContext
) => {
  try {
    const { skus } = event.body;

    // Access appInstallationParameters directly from context (new Functions API)
    const contextAny = context as any;
    const appInstallationParams = contextAny.appInstallationParameters;

    if (!appInstallationParams || typeof appInstallationParams !== 'object') {
      throw new Error('No app installation parameters found in context');
    }

    if (!('baseUrl' in appInstallationParams)) {
      throw new Error('No base URL was found in the installation parameters');
    }

    if (!('apiVersion' in appInstallationParams)) {
      throw new Error('No API version was found in the installation parameters');
    }

    // Construct the full API endpoint from baseUrl and apiVersion
    const { baseUrl, apiVersion } = appInstallationParams;
    const apiEndpoint = `${baseUrl}/${apiVersion}`;
    const sapService = new SapService(apiEndpoint, baseUrl, apiVersion);
    const productResponse = await sapService.getProductDetails(skus);

    return {
      ok: true,
      data: productResponse.products,
    };
  } catch (error) {
    return {
      ok: false,
      error: {
        type: error instanceof Error ? error.constructor.name : 'UnknownError',
        message: error instanceof Error ? error.message : JSON.stringify(error),
      },
    };
  }
};
