import { BaseAppSDK } from '@contentful/app-sdk';
import { PlainClientAPI } from 'contentful-management';
import { createClient } from 'contentful-management';
import { SpaceOption } from '@/vite-env';

export type SpaceContext = {
  spaceId: string;
  environmentId: string;
  client: PlainClientAPI;
};

export const TARGET_ENVIRONMENT_ID = 'master';

export function createPlainClient(sdk: BaseAppSDK): PlainClientAPI {
  return createClient({ apiAdapter: sdk.cmaAdapter as never }, { type: 'plain' });
}

export function getSourceContext(sdk: BaseAppSDK): SpaceContext {
  return {
    spaceId: sdk.ids.space,
    environmentId: sdk.ids.environmentAlias ?? sdk.ids.environment,
    client: createPlainClient(sdk),
  };
}

export function getTargetContext(client: PlainClientAPI, targetSpaceId: string): SpaceContext {
  return {
    spaceId: targetSpaceId,
    environmentId: TARGET_ENVIRONMENT_ID,
    client,
  };
}

export async function listOrganizationSpaces(
  client: PlainClientAPI,
  organizationId: string,
  currentSpaceId: string,
  allowlist?: { id: string; name: string }[]
): Promise<SpaceOption[]> {
  if (allowlist && allowlist.length > 0) {
    return allowlist
      .filter((space) => space.id !== currentSpaceId)
      .map((space) => ({ id: space.id, name: space.name }));
  }

  try {
    const response = await client.space.getManyForOrganization({ organizationId });
    return response.items
      .filter((space) => space.sys.id !== currentSpaceId)
      .map((space) => ({ id: space.sys.id, name: space.name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  } catch (error) {
    console.warn('Failed to list organization spaces', error);
    return [];
  }
}
