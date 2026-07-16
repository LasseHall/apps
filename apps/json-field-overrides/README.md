# JSON Field Overrides

Contentful app that simulates a third-party referencing integration on a **JSON Object** field.

Editors paste JSON in a dialog (standing in for an API response). The field stores an envelope:

```json
{
  "source": { "...": "original pasted payload" },
  "overrides": { "...": "value overrides and deletion tombstones" },
  "effective": { "...": "source merged with overrides" }
}
```

Edits never mutate `source`. Overrides and `{ "__deleted": true }` tombstones live in `overrides`; `effective` is recomputed on every change.

## Local development

```bash
cd apps/json-field-overrides
npm install
npm start
```

The Vite dev server runs at `http://localhost:3000`.

### Create an app definition in Contentful

1. In your Contentful organization, create a new app definition (or run `npm run create-app-definition`).
2. Enable locations: **App configuration screen**, **Entry field**, and **Dialog**.
3. Set the app URL to `http://localhost:3000` for local development.
4. Install the app into a space.
5. On the app configuration screen, select content types and JSON Object fields to assign the app
   (or set appearance manually on a field).

## Field UI

- **Effective** tab: tree of source keys with effective values; click to override; remove to tombstone; reset to clear an override.
- **Source / Overrides / Envelope**: read-only inspection of stored data.
- **Paste / replace source…**: opens the dialog. Primary save **keeps overrides** (orphan paths pruned). Secondary **Save & reset overrides** clears them.
- **Existing plain JSON**: shown in a read-only collapsible tree. Use **Convert to enveloped JSON** to wrap it as `source` and enable overrides.
- **Convert to plain JSON**: unwrap the envelope back to a normal JSON object using either `effective` or `source`.
- Arrays expand by index so nested fields (e.g. `vehicles[0].transmissionCode`) can be overridden
  or removed. Use the edit icon on an array to replace the whole array as JSON instead.

## Deploy (Contentful-hosted)

```bash
npm run build
npm run upload
```

## Scripts

| Script | Description |
|--------|-------------|
| `npm start` | Dev server |
| `npm run build` | Production bundle in `build/` |
| `npm test` | Unit tests (Vitest) |
| `npm run create-app-definition` | Create a Contentful app definition (interactive) |
| `npm run upload` | Upload `build/` to Contentful App Hosting (interactive) |
| `npm run upload:ci` | Non-interactive upload (`CONTENTFUL_ORG_ID`, `CONTENTFUL_APP_DEF_ID`, `CONTENTFUL_ACCESS_TOKEN`) |
