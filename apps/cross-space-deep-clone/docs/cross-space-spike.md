# Cross-Space CMA Spike

This document records the go/no-go decision for using Contentful App SDK `cmaAdapter` to perform cross-space writes from a sidebar app.

## Hypothesis

A custom app installed in a **source space** can:

1. List other spaces in the same organization via `client.space.getMany({ organizationId })`
2. Create entries and assets in a **target space** (`master`) by passing explicit `spaceId` / `environmentId` on CMA calls made through `cmaAdapter`

## Why this matters

Contentful documents that app-scoped CMA access is limited to the installed space/environment. If cross-space writes fail, the UI can remain in-app but copy execution must move to an **App Action + hosted backend** using an org-scoped management token.

## Spike steps

Run these checks from inside the app iframe (or use `scripts/spike-cross-space.ts` locally with a management token):

```ts
import { createClient } from 'contentful-management';

const client = createClient({ apiAdapter: sdk.cmaAdapter }, { type: 'plain' });

// A) Organization space listing
const spaces = await client.space.getMany({ organizationId: sdk.ids.organization });

// B) Cross-space write probe (use a disposable test content type + clean up after)
await client.entry.create(
  {
    spaceId: TARGET_SPACE_ID,
    environmentId: 'master',
    contentTypeId: 'yourContentTypeId',
  },
  {
    fields: {
      title: { 'en-US': 'Cross-space spike probe' },
    },
  }
);
```

## Expected outcomes

| Result | Decision |
|---|---|
| A + B succeed | **GO** — ship pure in-app `CrossSpaceCopier` |
| A succeeds, B fails | **PARTIAL** — keep UI in-app, add backend/App Action for writes |
| A fails | Configure target space allowlist in app settings; likely still need backend for writes |

## Implementation status

The app is implemented against the **GO** path:

- Source reads use the current installation context
- Target writes pass explicit `spaceId: targetSpaceId` and `environmentId: 'master'` on every create/update/upload call
- Config supports a manual target-space allowlist when org listing is unavailable

## Manual validation checklist

Before production use, verify in your org:

- [ ] Organization space listing works for your editors **or** allowlist is configured
- [ ] Cross-space `entry.create` succeeds from the sidebar app
- [ ] Cross-space `asset.create` + `processForAllLocales` succeeds
- [ ] Asset file download via `fetch(assetUrl)` works from the app iframe (no CORS block)
- [ ] Editor role has create/update permissions in the target space

## Troubleshooting misleading "missing content type" errors

If the sidebar reports a missing content type (e.g. `landingPage`) but you can see it in the target space UI, the preflight CMA call failed for another reason. Common causes:

| Symptom in browser console / network | Likely cause |
|---|---|
| HTTP **403** or **401** on `.../spaces/{target}/environments/master/content_types/landingPage` | **cmaAdapter is scoped to the source space** — the app cannot read or write the target space. This is the most common case. |
| HTTP **404** on the same URL | Content type ID or **environment mismatch**. The app always uses environment ID `master`, not aliases like `production` or `staging`. |
| No request to the target space at all | Target space ID in the picker may be wrong; check allowlist config. |

### Steps

1. Open **DevTools → Console** in Contentful while running copy. Look for `[cross-space-deep-clone] contentType.get failed` with the full error object.
2. Open **DevTools → Network**, filter by `content_types`, and inspect the failed request to the **target** space ID.
3. Confirm the target content type ID is exactly `landingPage` (case-sensitive) in **master**, not only under another environment.
4. Run the local spike script against the same target space:

```bash
CONTENTFUL_MANAGEMENT_TOKEN=... \
SOURCE_SPACE_ID=... \
TARGET_SPACE_ID=... \
CONTENT_TYPE_ID=landingPage \
npm run spike
```

If the spike succeeds with a PAT but the app fails, the issue is **in-app cross-space scoping** → use the backend fallback below.

## Fallback if spike fails

1. Add App Action `copyToSpace`
2. Host a small signed HTTP endpoint with an org CMA token
3. Reuse the same copier modules from `src/utils/` on the backend
4. Keep the existing dialog + sidebar UX unchanged
