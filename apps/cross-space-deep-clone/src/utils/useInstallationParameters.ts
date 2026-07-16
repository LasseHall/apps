import { BaseAppSDK } from '@contentful/app-sdk';
import { AppParameters } from '@/vite-env';

export const DEFAULT_INSTALLATION_PARAMETERS = {
  cloneText: '',
  cloneTextBefore: true,
  automaticRedirect: false,
  maxConcurrentRequests: 5,
  existingResourceBehavior: 'overwrite',
  localeCopyMode: 'defaultOnly',
  customLocales: [],
} satisfies AppParameters;

export const useInstallationParameters = (sdk: BaseAppSDK): AppParameters => {
  const params = sdk.parameters.installation as Partial<AppParameters> | undefined;
  if (!params || Object.keys(params).length === 0) {
    return DEFAULT_INSTALLATION_PARAMETERS;
  }

  return {
    cloneText: params.cloneText ?? DEFAULT_INSTALLATION_PARAMETERS.cloneText,
    cloneTextBefore: params.cloneTextBefore ?? DEFAULT_INSTALLATION_PARAMETERS.cloneTextBefore,
    automaticRedirect:
      params.automaticRedirect ?? DEFAULT_INSTALLATION_PARAMETERS.automaticRedirect,
    maxConcurrentRequests:
      params.maxConcurrentRequests ?? DEFAULT_INSTALLATION_PARAMETERS.maxConcurrentRequests,
    existingResourceBehavior:
      params.existingResourceBehavior ?? DEFAULT_INSTALLATION_PARAMETERS.existingResourceBehavior,
    localeCopyMode: params.localeCopyMode ?? DEFAULT_INSTALLATION_PARAMETERS.localeCopyMode,
    customLocales: params.customLocales ?? DEFAULT_INSTALLATION_PARAMETERS.customLocales,
    ...(params.allowedTargetSpaceIds ? { allowedTargetSpaceIds: params.allowedTargetSpaceIds } : {}),
  };
};
