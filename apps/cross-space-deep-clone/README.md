# Cross-Space Deep Clone

A custom Contentful app forked from the [Deep Clone marketplace app](https://www.contentful.com/marketplace/deep-clone/) that copies a page entry and selected linked entries and assets from one space to another space in the same organization.

## Features

- Copy from the entry sidebar to another org space (`master` only in v1)
- Review a nested reference tree of linked entries **and** assets before copying
- Show source Draft / Changed / Published status on each tree node
- Selectively include or exclude linked content (deselected references **keep** their links by ID)
- Preserve entry and asset IDs across spaces (`createWithId`)
- Skip or overwrite when a resource already exists in the target (configurable; default overwrite)
- Choose which locales to copy (config default + per-run dialog picker)
  - Create: selected locales only
  - Update/overwrite: merge selected locales onto existing target fields (other locales left intact)
- Clone assets into the target space (re-upload files and rewrite asset links)
- Keep rich text embed shells; rewrite mapped IDs, leave unmapped as source IDs
- Optional title clone text (prefix/suffix); leave empty to keep original titles
- Preflight checks for missing content types, locales, and deselected dangling links
- Optional target-space allowlist and configurable API concurrency

## Requirements

- Node.js 18+
- Contentful organization with identical content models in source and target spaces
- App installed in the **source** space(s) where editors copy from
- Editor permissions:
  - Read in source space
  - Create/update entries and create/process assets in target space `master`

## Setup

```bash
npm install
npm start
```

Install the app in Contentful:

1. Run `npm run create-app-definition` and follow the prompts
2. Assign the app to your source space
3. Open the app configuration screen and assign sidebar locations to your page content types
4. Optionally configure:
   - Target-space allowlist
   - Default locales to copy
   - Skip vs overwrite for existing resources
   - Optional clone-text prefix/suffix

Build and upload:

```bash
npm run build
npm run upload
```

## Usage

1. Open an entry in a configured content type
2. Click **Copy to another space** in the sidebar
3. Choose the destination space and locales to copy
4. Review the reference tree (status badges included) and deselect anything you do not want copied
5. Confirm the copy

Deselected entry/asset links are **kept by source ID** in the target copy (assumed to already exist there) and reported as warnings. Copies are created or updated as drafts (not auto-published).

## Cross-space permissions spike

Before relying on this app in production, complete the checklist in [docs/cross-space-spike.md](docs/cross-space-spike.md).

Quick local probe with a management token:

```bash
CONTENTFUL_MANAGEMENT_TOKEN=... \
SOURCE_SPACE_ID=... \
TARGET_SPACE_ID=... \
CONTENT_TYPE_ID=page \
CONTENTFUL_ORGANIZATION_ID=... \
npm run spike
```

If in-app cross-space writes fail in your org, use the fallback described in the spike doc: App Action + hosted backend with an org-scoped CMA token. The copier modules in `src/utils/` are structured to be reusable in that backend.

## Development

```bash
npm test
npm run lint
npm run build
```

## Architecture

- `src/utils/ReferenceGraph.ts` — source-space reference traversal (entries + assets)
- `src/utils/AssetCopier.ts` — asset download/upload/create/process in target space
- `src/utils/EntryCopier.ts` — entry create/update + link rewrite in target space
- `src/utils/CrossSpaceCopier.ts` — orchestration and preflight
- `src/utils/localeUtils.ts` — locale defaults, filtering, and merge-on-update
- `src/locations/Sidebar.tsx` — user flow entry point
- `src/locations/ReferenceSelectionDialog.tsx` — target space, locales, and selection tree
- `src/locations/ConfigScreen.tsx` — installation parameters and sidebar assignment

## Limitations (v1)

- Target environment is fixed to `master`
- No content-type/field mapping
- Copies remain drafts (not auto-published)
- No deduplication by slug or unique fields (identity is same ID across spaces)
- Cross-space `ResourceLink` fields are not copied (detected/ignored during traversal)

## License

Forked from Contentful's open-source Deep Clone app. See upstream license in the Contentful apps repository.
