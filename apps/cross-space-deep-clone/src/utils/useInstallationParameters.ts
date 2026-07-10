import { BaseAppSDK } from '@contentful/app-sdk';
import { AppParameters } from '@/vite-env';

const DEFAULTS = {
  cloneText: 'Copy',
  cloneTextBefore: true,
  automaticRedirect: false,
  maxConcurrentRequests: 5,
  existingResourceBehavior: 'overwrite',
} satisfies AppParameters;

export const useInstallationParameters = (sdk: BaseAppSDK): AppParameters => {
  const params = sdk.parameters.installation as Partial<AppParameters> | undefined;
  if (!params || Object.keys(params).length === 0) {
    return DEFAULTS;
  }

  return {
    cloneText: params.cloneText ?? DEFAULTS.cloneText,
    cloneTextBefore: params.cloneTextBefore ?? DEFAULTS.cloneTextBefore,
    automaticRedirect: params.automaticRedirect ?? DEFAULTS.automaticRedirect,
    maxConcurrentRequests: params.maxConcurrentRequests ?? DEFAULTS.maxConcurrentRequests,
    existingResourceBehavior: params.existingResourceBehavior ?? DEFAULTS.existingResourceBehavior,
    ...(params.allowedTargetSpaceIds ? { allowedTargetSpaceIds: params.allowedTargetSpaceIds } : {}),
  };
};
