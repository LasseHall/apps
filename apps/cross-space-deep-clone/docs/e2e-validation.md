# Manual E2E Validation Checklist

Run this checklist in a real Contentful org after installing the custom app in a **source space**.

## Prerequisites

- [ ] App uploaded via `npm run build && npm run upload`
- [ ] App installed in source space
- [ ] Config screen assigns sidebar to your page content type
- [ ] Target space has identical content types
- [ ] Your user can create entries/assets in target space `master`
- [ ] Optional: target space allowlist configured if org listing fails

## Spike verification

- [ ] Complete [cross-space-spike.md](./cross-space-spike.md) checklist
- [ ] Confirm cross-space `entry.create` works from the app iframe

## Happy path

1. Open a page entry with nested entries and at least one linked asset
2. Click **Copy to another space**
3. Select a target space and continue
4. Confirm the tree shows both entries and assets
5. Deselect one non-critical child entry or asset
6. Run the copy

Expected:

- [ ] Copy completes without errors
- [ ] Warning mentions removed deselected links (if applicable)
- [ ] Target space contains new draft root entry with clone text applied
- [ ] Selected child entries exist in target space
- [ ] Selected assets were re-uploaded and linked from target entries
- [ ] Deselected links are absent in the target copy

## Failure cases

- [ ] Missing content type in target shows blocking preflight error
- [ ] Large tree respects configured concurrency without persistent 429 errors
- [ ] Partial asset failure aborts with a clear error (no half-linked tree)

## Notes

Record your org-specific spike result here:

| Check | Pass/Fail | Notes |
|---|---|---|
| Org space listing | | |
| Cross-space entry write | | |
| Cross-space asset write | | |
| Asset URL fetch from iframe | | |
