import { useEffect, useMemo, useState } from 'react';
import { DialogAppSDK } from '@contentful/app-sdk';
import { useAutoResizer, useSDK } from '@contentful/react-apps-toolkit';
import {
  Box,
  Button,
  Checkbox,
  EntityStatusBadge,
  Flex,
  FormControl,
  Heading,
  Note,
  Paragraph,
  Text,
} from '@contentful/f36-components';
import { css } from '@emotion/css';
import SpaceSelect from '../components/SpaceSelect';
import {
  collectEntryIdsFromTree,
  fetchEntryContentTypes,
  formatContentTypeLabel,
  parseContentTypeFromLabel,
} from '../utils/entryContentTypes';
import {
  CloneReferenceNode,
  collectUniqueNodeIds,
  EntryContentTypeInfo,
} from '../utils/ReferenceGraph';
import { CopyDialogResult, LocaleOption, SpaceOption } from '@/vite-env';
import packageJson from '../../package.json';

type DialogInvocationParameters = {
  referenceTree: CloneReferenceNode;
  spaces: SpaceOption[];
  entryContentTypes?: Record<string, EntryContentTypeInfo>;
  sourceLocales: LocaleOption[];
  initialSelectedLocales: string[];
};

const styles = {
  root: css({
    display: 'flex',
    flexDirection: 'column',
    width: '100%',
    minHeight: '100%',
    backgroundColor: '#ffffff',
  }),
  header: css({
    padding: '20px 32px 16px',
    borderBottom: '1px solid #e5ebf1',
  }),
  content: css({
    flex: 1,
    padding: '20px 32px',
    overflowY: 'auto',
    width: '100%',
  }),
  controls: css({
    padding: '16px 32px 24px',
    borderTop: '1px solid #e5ebf1',
    backgroundColor: '#ffffff',
  }),
  targetRow: css({
    display: 'grid',
    gridTemplateColumns: 'minmax(280px, 420px) minmax(280px, 1fr)',
    gap: '24px',
    alignItems: 'start',
    marginBottom: '20px',
    '@media (max-width: 900px)': {
      gridTemplateColumns: '1fr',
    },
  }),
  localeList: css({
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    maxHeight: '160px',
    overflowY: 'auto',
    padding: '8px 0',
  }),
  treePanel: css({
    border: '1px solid #e5ebf1',
    borderRadius: '6px',
    padding: '16px',
    overflow: 'auto',
    maxHeight: 'min(62vh, 680px)',
    backgroundColor: '#ffffff',
  }),
  treeChildren: css({
    marginLeft: '20px',
    paddingLeft: '12px',
    borderLeft: '1px solid #d3dce6',
  }),
  treeNode: css({
    marginBottom: '8px',
  }),
};

function toggleNodeSelection(
  node: CloneReferenceNode,
  nextChecked: boolean,
  selectedEntryIds: Set<string>,
  selectedAssetIds: Set<string>
): { entries: Set<string>; assets: Set<string> } {
  const nextSelectedEntryIds = new Set(selectedEntryIds);
  const nextSelectedAssetIds = new Set(selectedAssetIds);
  const { entryIds, assetIds } = collectUniqueNodeIds(node);

  for (const entryId of entryIds) {
    if (nextChecked) nextSelectedEntryIds.add(entryId);
    else nextSelectedEntryIds.delete(entryId);
  }

  for (const assetId of assetIds) {
    if (nextChecked) nextSelectedAssetIds.add(assetId);
    else nextSelectedAssetIds.delete(assetId);
  }

  return { entries: nextSelectedEntryIds, assets: nextSelectedAssetIds };
}

function TreeNode({
  node,
  selectedEntryIds,
  selectedAssetIds,
  rootEntryId,
  entryContentTypes,
  onToggle,
}: {
  node: CloneReferenceNode;
  selectedEntryIds: Set<string>;
  selectedAssetIds: Set<string>;
  rootEntryId: string;
  entryContentTypes: Record<string, EntryContentTypeInfo>;
  onToggle: (node: CloneReferenceNode, checked: boolean) => void;
}) {
  const isRoot = node.type === 'entry' && node.id === rootEntryId;
  const isChecked =
    node.type === 'entry' ? selectedEntryIds.has(node.id) : selectedAssetIds.has(node.id);
  const displayTitle =
    node.type === 'entry' ? parseContentTypeFromLabel(node.label).title : node.label;
  const contentTypeLabel = formatContentTypeLabel(node, entryContentTypes);

  const subtitleParts: string[] = [];
  if (isRoot) subtitleParts.push('Root entry');
  if (node.type === 'asset') subtitleParts.push('Asset');
  else if (contentTypeLabel !== '—') subtitleParts.push(contentTypeLabel);
  subtitleParts.push(node.id);

  return (
    <Box className={styles.treeNode}>
      <Flex alignItems="flex-start" gap="spacingS">
        <Checkbox
          isChecked={isChecked}
          isDisabled={isRoot}
          onChange={(event) => onToggle(node, event.target.checked)}
        />
        <Box minWidth={0}>
          <Flex alignItems="center" gap="spacingXs" flexWrap="wrap">
            <Text fontWeight="fontWeightMedium">{displayTitle}</Text>
            {node.status && <EntityStatusBadge entityStatus={node.status} />}
          </Flex>
          <Text fontColor="gray600" fontSize="fontSizeS">
            {subtitleParts.join(' · ')}
          </Text>
        </Box>
      </Flex>

      {node.children.length > 0 && (
        <Box className={styles.treeChildren} marginTop="spacingS">
          {node.children.map((child) => (
            <TreeNode
              key={`${child.type}-${child.id}`}
              node={child}
              selectedEntryIds={selectedEntryIds}
              selectedAssetIds={selectedAssetIds}
              rootEntryId={rootEntryId}
              entryContentTypes={entryContentTypes}
              onToggle={onToggle}
            />
          ))}
        </Box>
      )}
    </Box>
  );
}

function ReferenceSelectionDialog() {
  const sdk = useSDK<DialogAppSDK>();
  const invocationParameters = sdk.parameters.invocation as DialogInvocationParameters;
  const referenceTree = invocationParameters.referenceTree;
  const spaces = invocationParameters.spaces;
  const sourceLocales = invocationParameters.sourceLocales ?? [];
  const passedEntryContentTypes = invocationParameters.entryContentTypes ?? {};
  useAutoResizer();

  const [entryContentTypes, setEntryContentTypes] =
    useState<Record<string, EntryContentTypeInfo>>(passedEntryContentTypes);
  const [isLoadingContentTypes, setIsLoadingContentTypes] = useState(true);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      setIsLoadingContentTypes(true);
      const fetched = await fetchEntryContentTypes(sdk, collectEntryIdsFromTree(referenceTree));
      if (cancelled) return;

      setEntryContentTypes({ ...passedEntryContentTypes, ...fetched });
      setIsLoadingContentTypes(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [referenceTree, sdk]);

  const { entryIds: uniqueEntryIds, assetIds: uniqueAssetIds } = useMemo(
    () => collectUniqueNodeIds(referenceTree),
    [referenceTree]
  );
  const rootEntryId = referenceTree.id;

  const [targetSpaceId, setTargetSpaceId] = useState(spaces.length === 1 ? (spaces[0]?.id ?? '') : '');
  const [selectedEntryIds, setSelectedEntryIds] = useState<Set<string>>(() => new Set(uniqueEntryIds));
  const [selectedAssetIds, setSelectedAssetIds] = useState<Set<string>>(() => new Set(uniqueAssetIds));
  const [selectedLocales, setSelectedLocales] = useState<Set<string>>(
    () => new Set(invocationParameters.initialSelectedLocales ?? [])
  );

  const selectableEntryCount = [...uniqueEntryIds].filter((id) => id !== rootEntryId).length;
  const totalReferenceCount = selectableEntryCount + uniqueAssetIds.size;
  const selectedReferenceCount =
    [...selectedEntryIds].filter((id) => id !== rootEntryId).length + selectedAssetIds.size;
  const allReferencesSelected = selectedReferenceCount === totalReferenceCount;

  const handleToggleNode = (node: CloneReferenceNode, checked: boolean) => {
    const nextSelection = toggleNodeSelection(node, checked, selectedEntryIds, selectedAssetIds);
    setSelectedEntryIds(nextSelection.entries);
    setSelectedAssetIds(nextSelection.assets);
  };

  const handleToggleAllReferences = () => {
    if (allReferencesSelected) {
      setSelectedEntryIds(new Set([rootEntryId]));
      setSelectedAssetIds(new Set());
      return;
    }
    setSelectedEntryIds(new Set(uniqueEntryIds));
    setSelectedAssetIds(new Set(uniqueAssetIds));
  };

  const toggleLocale = (code: string, checked: boolean) => {
    const next = new Set(selectedLocales);
    if (checked) next.add(code);
    else next.delete(code);
    setSelectedLocales(next);
  };

  const handleCancel = () => {
    sdk.close(null);
  };

  const handleConfirm = () => {
    if (!targetSpaceId || selectedLocales.size === 0) return;

    const result: CopyDialogResult = {
      targetSpaceId,
      selectedEntryIds: Array.from(selectedEntryIds),
      selectedAssetIds: Array.from(selectedAssetIds),
      selectedLocales: Array.from(selectedLocales),
    };
    sdk.close(result);
  };

  return (
    <Box className={styles.root}>
      <Box className={styles.header}>
        <Flex justifyContent="space-between" alignItems="flex-start" gap="spacingM">
          <Box>
            <Heading>Select content to copy</Heading>
            <Paragraph marginTop="spacingS">
              Choose target space and locales, review linked entries and assets, and deselect
              anything you do not want copied. Deselected references keep their links by ID.
            </Paragraph>
          </Box>
          <Text fontColor="gray500" fontSize="fontSizeS">
            Cross-Space Deep Clone v{packageJson.version}
          </Text>
        </Flex>
      </Box>

      <Box className={styles.content}>
        <Box className={styles.targetRow}>
          <SpaceSelect spaces={spaces} selectedSpaceId={targetSpaceId} onChange={setTargetSpaceId} />
          <FormControl>
            <FormControl.Label>Locales to copy</FormControl.Label>
            <Box className={styles.localeList}>
              {sourceLocales.map((locale) => (
                <Checkbox
                  key={locale.code}
                  isChecked={selectedLocales.has(locale.code)}
                  onChange={(event) => toggleLocale(locale.code, event.target.checked)}>
                  {locale.name} ({locale.code})
                  {locale.default ? ' — default' : ''}
                </Checkbox>
              ))}
            </Box>
            <FormControl.HelpText>
              Only selected locales are written. Other locales already on the target stay unchanged.
              Target environment is always master.
            </FormControl.HelpText>
          </FormControl>
        </Box>

        <Box marginBottom="spacingM">
          <Note>
            Deselected references are not copied, but their links are kept by ID so existing target
            entries remain linked.
          </Note>
        </Box>

        <Flex justifyContent="space-between" alignItems="center" marginBottom="spacingM" gap="spacingM">
          <Box>
            <Text fontColor="gray700">
              {allReferencesSelected
                ? `All ${totalReferenceCount} linked reference${totalReferenceCount === 1 ? '' : 's'} selected`
                : `${selectedReferenceCount} of ${totalReferenceCount} linked reference${
                    totalReferenceCount === 1 ? '' : 's'
                  } selected`}
            </Text>
            {isLoadingContentTypes && (
              <Text fontColor="gray600" fontSize="fontSizeS">
                Loading content types…
              </Text>
            )}
          </Box>
          <Button size="small" variant="secondary" onClick={handleToggleAllReferences}>
            {allReferencesSelected ? 'Deselect all references' : 'Select all references'}
          </Button>
        </Flex>

        <Box className={styles.treePanel}>
          <TreeNode
            node={referenceTree}
            selectedEntryIds={selectedEntryIds}
            selectedAssetIds={selectedAssetIds}
            rootEntryId={rootEntryId}
            entryContentTypes={entryContentTypes}
            onToggle={handleToggleNode}
          />
        </Box>
      </Box>

      <Box className={styles.controls}>
        <Flex justifyContent="space-between" alignItems="center">
          <Button variant="secondary" onClick={handleCancel}>
            Cancel
          </Button>
          <Button
            variant="positive"
            isDisabled={!targetSpaceId || selectedLocales.size === 0}
            onClick={handleConfirm}>
            Copy selected content
          </Button>
        </Flex>
      </Box>
    </Box>
  );
}

export default ReferenceSelectionDialog;
