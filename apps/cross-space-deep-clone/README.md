# Cross-Space Deep Clone

A custom Contentful app forked from the [Deep Clone marketplace app](https://www.contentful.com/marketplace/deep-clone/) that copies a page entry and selected linked entries and assets from one space to another space in the same organization.

## Features

- Copy from the entry sidebar to another org space (`master` only in v1)
- Review a reference tree containing linked entries **and** assets before copying
- Selectively include or exclude linked content
- Clone assets into the target space (re-upload files and rewrite asset links)
- Preflight checks for missing content types and locale mismatches
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
4. Optionally configure a target-space allowlist

Build and upload:

```bash
npm run build
npm run upload
```

## Usage

1. Open an entry in a configured content type
2. Click **Copy to another space** in the sidebar
3. Choose the destination space
4. Review the reference tree and deselect anything you do not want copied
5. Confirm the copy

Deselected entry/asset links are removed in the target copy and reported as warnings.

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
- `src/utils/EntryCopier.ts` — entry create + link rewrite in target space
- `src/utils/CrossSpaceCopier.ts` — orchestration and preflight
- `src/locations/Sidebar.tsx` — user flow entry point
- `src/locations/ReferenceSelectionDialog.tsx` — target space picker + selection tree

## Limitations (v1)

- Target environment is fixed to `master`
- No content-type/field mapping
- Copies are created as drafts (not auto-published)
- No deduplication by slug or unique fields
- Cross-space `ResourceLink` fields are not copied (detected/ignored during traversal)

## License

Forked from Contentful's open-source Deep Clone app. See upstream license in the Contentful apps repository.
