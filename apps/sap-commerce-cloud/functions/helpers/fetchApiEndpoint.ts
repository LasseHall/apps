import { type PlainClientAPI } from 'contentful-management';

export async function fetchApiEndpoint(
  cma: PlainClientAPI,
  appInstallationId: string
): Promise<string> {
  const appInstallation = await cma.appInstallation.get({ appDefinitionId: appInstallationId });
  const appInstallationParams = appInstallation.parameters;
  if (typeof appInstallationParams === 'object' && 'apiEndpoint' in appInstallationParams) {
    return appInstallationParams['apiEndpoint'];
  } else {
    throw new Error('No API Endpoint was found in the installation parameters');
  }
}
