/**
 * Local spike helper for cross-space CMA permissions.
 *
 * Usage:
 *   CONTENTFUL_MANAGEMENT_TOKEN=... \
 *   SOURCE_SPACE_ID=... \
 *   TARGET_SPACE_ID=... \
 *   CONTENT_TYPE_ID=page \
 *   npm run spike
 */

import { createClient } from 'contentful-management';

const token = process.env.CONTENTFUL_MANAGEMENT_TOKEN;
const sourceSpaceId = process.env.SOURCE_SPACE_ID;
const targetSpaceId = process.env.TARGET_SPACE_ID;
const contentTypeId = process.env.CONTENT_TYPE_ID;
const organizationId = process.env.CONTENTFUL_ORGANIZATION_ID;

async function main() {
  if (!token || !sourceSpaceId || !targetSpaceId || !contentTypeId) {
    console.error(
      'Missing env vars. Required: CONTENTFUL_MANAGEMENT_TOKEN, SOURCE_SPACE_ID, TARGET_SPACE_ID, CONTENT_TYPE_ID'
    );
    process.exit(1);
  }

  const client = createClient({ accessToken: token }, { type: 'plain' });

  if (organizationId) {
    const spaces = await client.space.getMany({ organizationId });
    console.log(
      'Organization spaces:',
      spaces.items.map((space) => `${space.name} (${space.sys.id})`).join(', ')
    );
  }

  const probe = await client.entry.create(
    {
      spaceId: targetSpaceId,
      environmentId: 'master',
      contentTypeId,
    },
    {
      fields: {
        title: { 'en-US': `Cross-space spike ${new Date().toISOString()}` },
      },
    }
  );

  console.log('Cross-space write probe succeeded:', probe.sys.id);
  console.log('Source space (read context):', sourceSpaceId);
}

main().catch((error) => {
  console.error('Spike failed:', error);
  process.exit(1);
});
