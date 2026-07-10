import { useMemo, useState } from 'react';
import { DialogAppSDK } from '@contentful/app-sdk';
import { useAutoResizer, useSDK } from '@contentful/react-apps-toolkit';
import {
  Box,
  Button,
  Checkbox,
  Flex,
  FormControl,
  Heading,
  Note,
  Paragraph,
  Stack,
  Text,
} from '@contentful/f36-components';
import { css } from '@emotion/css';
import SpaceSelect from '../components/SpaceSelect';
import { CloneReferenceNode } from '../utils/ReferenceGraph';
import { CopyDialogResult, SpaceOption } from '@/vite-env';

type DialogInvocationParameters = {
  referenceTree: CloneReferenceNode;
  spaces: SpaceOption[];
};

const styles = {
  root: css({
    display: 'flex',
    flexDirection: 'column',
    minHeight: '100vh',
    backgroundColor: '#ffffff',
  }),
  header: css({
    padding: '24px 24px 16px',
    borderBottom: '1px solid #e5ebf1',
  }),
  content: css({
    flex: 1,
    padding: '20px 24px',
    overflowY: 'auto',
  }),
  controls: css({
    padding: '16px 24px 24px',
    borderTop: '1px solid #e5ebf1',
    backgroundColor: '#ffffff',
  }),
  treeChildren: css({
    marginLeft: '20px',
    paddingLeft: '12px',
    borderLeft: '1px solid #d3dce6',
  }),
};

function collectNodeIds(node: CloneReferenceNode): { entryIds: string[]; assetIds: string[] } {
  const entryIds = node.type === 'entry' ? [node.id] : [];
  const assetIds = node.type === 'asset' ? [node.id] : [];

  for (const child of node.children) {
    const childIds = collectNodeIds(child);
    entryIds.push(...childIds.entryIds);
    assetIds.push(...childIds.assetIds);
  }

  return { entryIds, assetIds };
}

function toggleNodeSelection(
  node: CloneReferenceNode,
  nextChecked: boolean,
  selectedEntryIds: Set<string>,
  selectedAssetIds: Set<string>
): { entries: Set<string>; assets: Set<string> } {
  const nextSelectedEntryIds = new Set(selectedEntryIds);
  const nextSelectedAssetIds = new Set(selectedAssetIds);
  const { entryIds, assetIds } = collectNodeIds(node);

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
  onToggle,
}: {
  node: CloneReferenceNode;
  selectedEntryIds: Set<string>;
  selectedAssetIds: Set<string>;
  rootEntryId: string;
  onToggle: (node: CloneReferenceNode, checked: boolean) => void;
}) {
  const isRoot = node.type === 'entry' && node.id === rootEntryId;
  const isChecked =
    node.type === 'entry' ? selectedEntryIds.has(node.id) : selectedAssetIds.has(node.id);

  return (
    <Box marginBottom="spacingS">
      <Flex alignItems="flex-start" gap="spacingS">
        <Checkbox
          isChecked={isChecked}
          isDisabled={isRoot}
          onChange={(event) => onToggle(node, event.target.checked)}
        />
        <Box>
          <Text fontWeight="fontWeightMedium">{node.label}</Text>
          <Text fontColor="gray600" fontSize="fontSizeS">
            {isRoot ? 'Root entry' : `${node.type === 'asset' ? 'Asset' : 'Entry'} · ${node.id}`}
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
  useAutoResizer();

  const allIds = useMemo(() => collectNodeIds(referenceTree), [referenceTree]);
  const rootEntryId = referenceTree.id;

  const [step, setStep] = useState<1 | 2>(1);
  const [targetSpaceId, setTargetSpaceId] = useState('');
  const [selectedEntryIds, setSelectedEntryIds] = useState<Set<string>>(new Set(allIds.entryIds));
  const [selectedAssetIds, setSelectedAssetIds] = useState<Set<string>>(new Set(allIds.assetIds));

  const selectedReferenceCount =
    [...selectedEntryIds].filter((id) => id !== rootEntryId).length + selectedAssetIds.size;
  const totalReferenceCount =
    allIds.entryIds.filter((id) => id !== rootEntryId).length + allIds.assetIds.length;
  const allReferencesSelected =
    selectedReferenceCount === totalReferenceCount && selectedAssetIds.size === allIds.assetIds.length;

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
    setSelectedEntryIds(new Set(allIds.entryIds));
    setSelectedAssetIds(new Set(allIds.assetIds));
  };

  const handleCancel = () => {
    sdk.close(null);
  };

  const handleContinue = () => {
    if (!targetSpaceId) return;
    setStep(2);
  };

  const handleConfirm = () => {
    const result: CopyDialogResult = {
      targetSpaceId,
      selectedEntryIds: Array.from(selectedEntryIds),
      selectedAssetIds: Array.from(selectedAssetIds),
    };
    sdk.close(result);
  };

  return (
    <Box className={styles.root}>
      <Box className={styles.header}>
        <Heading>{step === 1 ? 'Choose target space' : 'Select content to copy'}</Heading>
        <Paragraph marginTop="spacingS">
          {step === 1
            ? 'Pick the destination space. Entries and assets will be copied into its master environment.'
            : 'Review the reference tree and deselect any linked entries or assets you do not want copied.'}
        </Paragraph>
      </Box>

      <Box className={styles.content}>
        {step === 1 ? (
          <Stack spacing="spacingM">
            <SpaceSelect spaces={spaces} selectedSpaceId={targetSpaceId} onChange={setTargetSpaceId} />
            <FormControl>
              <FormControl.Label>Target environment</FormControl.Label>
              <FormControl.HelpText>Fixed to master for v1.</FormControl.HelpText>
            </FormControl>
          </Stack>
        ) : (
          <Stack spacing="spacingM">
            <Note variant="primary">
              Target space: {spaces.find((space) => space.id === targetSpaceId)?.name ?? targetSpaceId}{' '}
              · master
            </Note>
            <Note>
              Deselected references will be removed from the copied entries in the target space.
            </Note>
            <Flex justifyContent="space-between" alignItems="center">
              <Text fontColor="gray700">
                {`Selected ${selectedReferenceCount} of ${totalReferenceCount} referenced item(s)`}
              </Text>
              <Button size="small" variant="transparent" onClick={handleToggleAllReferences}>
                {allReferencesSelected ? 'Deselect all references' : 'Select all references'}
              </Button>
            </Flex>
            <TreeNode
              node={referenceTree}
              selectedEntryIds={selectedEntryIds}
              selectedAssetIds={selectedAssetIds}
              rootEntryId={rootEntryId}
              onToggle={handleToggleNode}
            />
          </Stack>
        )}
      </Box>

      <Box className={styles.controls}>
        <Flex justifyContent="space-between">
          <Button variant="secondary" onClick={handleCancel}>
            Cancel
          </Button>
          {step === 1 ? (
            <Button variant="positive" isDisabled={!targetSpaceId} onClick={handleContinue}>
              Continue
            </Button>
          ) : (
            <Flex gap="spacingS">
              <Button variant="secondary" onClick={() => setStep(1)}>
                Back
              </Button>
              <Button variant="positive" onClick={handleConfirm}>
                Copy selected content
              </Button>
            </Flex>
          )}
        </Flex>
      </Box>
    </Box>
  );
}

export default ReferenceSelectionDialog;
