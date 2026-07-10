import { useEffect, useState } from 'react';
import { Text, Button, Stack, Note } from '@contentful/f36-components';
import { useAutoResizer, useSDK } from '@contentful/react-apps-toolkit';
import { SidebarAppSDK } from '@contentful/app-sdk';
import { CopyDialogResult } from '@/vite-env';
import { CrossSpaceCopier } from '../utils/CrossSpaceCopier';
import { getSourceContext, listOrganizationSpaces } from '../utils/CmaClients';
import { useInstallationParameters } from '../utils/useInstallationParameters';

function Sidebar() {
  const sdk = useSDK<SidebarAppSDK>();
  useAutoResizer();

  const parameters = useInstallationParameters(sdk);

  const [referencesCount, setReferencesCount] = useState(0);
  const [assetsCopied, setAssetsCopied] = useState(0);
  const [assetsTotal, setAssetsTotal] = useState(0);
  const [entriesCreated, setEntriesCreated] = useState(0);
  const [entriesTotal, setEntriesTotal] = useState(0);
  const [linksUpdated, setLinksUpdated] = useState(0);

  const [isPreparing, setIsPreparing] = useState(false);
  const [isCopying, setIsCopying] = useState(false);
  const [isFinished, setIsFinished] = useState(false);
  const [copyError, setCopyError] = useState<string | null>(null);
  const [copyWarning, setCopyWarning] = useState<string | null>(null);
  const [resultSummary, setResultSummary] = useState<string | null>(null);

  useEffect(() => {
    if (!isFinished || !parameters.automaticRedirect || !resultSummary) return;

    const timeout = window.setTimeout(() => {
      sdk.notifier.success('Copy completed. Open the target space to review the new entry.');
    }, 3000);

    return () => window.clearTimeout(timeout);
  }, [isFinished, parameters.automaticRedirect, resultSummary, sdk.notifier]);

  const resetState = () => {
    setIsPreparing(false);
    setIsCopying(false);
    setIsFinished(false);
    setReferencesCount(0);
    setAssetsCopied(0);
    setAssetsTotal(0);
    setEntriesCreated(0);
    setEntriesTotal(0);
    setLinksUpdated(0);
    setCopyError(null);
    setCopyWarning(null);
    setResultSummary(null);
  };

  const copyToSpace = async (): Promise<void> => {
    resetState();
    setIsPreparing(true);

    await sdk.entry.save();

    const source = getSourceContext(sdk);
    const copier = new CrossSpaceCopier(source, parameters, sdk.ids.entry, (progress) => {
      setReferencesCount(progress.referencesFound);
      setAssetsCopied(progress.assetsCopied);
      setAssetsTotal(progress.assetsTotal);
      setEntriesCreated(progress.entriesCreated);
      setEntriesTotal(progress.entriesTotal);
      setLinksUpdated(progress.linksUpdated);
    });

    const referenceTree = await copier.getReferenceTree();
    const spaces = await listOrganizationSpaces(
      source.client,
      sdk.ids.organization,
      sdk.ids.space,
      parameters.allowedTargetSpaceIds
    );

    if (spaces.length === 0) {
      setIsPreparing(false);
      setCopyError(
        'No target spaces are available. Add an allowlist in the app configuration or verify organization space listing permissions.'
      );
      return;
    }

    const dialogResult = (await sdk.dialogs.openCurrentApp({
      title: 'Copy to another space',
      width: 'large',
      shouldCloseOnEscapePress: true,
      shouldCloseOnOverlayClick: false,
      parameters: {
        referenceTree,
        spaces,
      },
    })) as CopyDialogResult | null;

    if (!dialogResult?.targetSpaceId) {
      resetState();
      return;
    }

    setIsPreparing(false);
    setIsCopying(true);

    try {
      const result = await copier.copyToSpace(
        dialogResult.targetSpaceId,
        dialogResult.selectedEntryIds,
        dialogResult.selectedAssetIds
      );

      const targetSpaceName =
        spaces.find((space) => space.id === result.targetSpaceId)?.name ?? result.targetSpaceId;

      const warnings: string[] = [...result.warnings];
      if (result.strippedLinkCount > 0) {
        warnings.push(
          `${result.strippedLinkCount} deselected reference link(s) were removed in the target copy.`
        );
      }
      if (result.failedUpdateIds.length > 0) {
        warnings.push(
          `${result.failedUpdateIds.length} copied ${result.failedUpdateIds.length === 1 ? 'entry' : 'entries'} could not have all links updated.`
        );
      }

      if (warnings.length > 0) {
        setCopyWarning(warnings.join(' '));
      }

      setResultSummary(
        `Created entry ${result.rootEntry.sys.id} in ${targetSpaceName} (master).`
      );
      setIsCopying(false);
      setIsFinished(true);
      sdk.notifier.success('Cross-space copy successful');
    } catch (error) {
      setIsCopying(false);
      setCopyError(error instanceof Error ? error.message : 'An unexpected error occurred during copying.');
      sdk.notifier.error('Cross-space copy failed.');
    }
  };

  return (
    <Stack spacing="spacingM" flexDirection="column" alignItems="stretch">
      <Text fontColor="gray600">
        Copy this entry and selected linked entries and assets to another space.
      </Text>

      <Button variant="positive" isDisabled={isPreparing || isCopying} onClick={copyToSpace}>
        Copy to another space
      </Button>

      {copyError && (
        <Note variant="negative" title="Copy failed">
          {copyError}
        </Note>
      )}

      {copyWarning && (
        <Note variant="warning" title="Copy completed with warnings">
          {copyWarning}
        </Note>
      )}

      {(isPreparing || isCopying || isFinished) && (
        <Text fontColor="gray700">
          {`Found ${referencesCount} ${referencesCount === 1 ? 'reference' : 'references'}.`}
        </Text>
      )}

      {(isCopying || isFinished) && (
        <>
          <Text fontColor="gray700">
            {`Copied ${assetsCopied} of ${assetsTotal} ${assetsTotal === 1 ? 'asset' : 'assets'}.`}
          </Text>
          <Text fontColor="gray700">
            {`Created ${entriesCreated} of ${entriesTotal} ${entriesTotal === 1 ? 'entry' : 'entries'}.`}
          </Text>
          <Text fontColor="gray700">
            {`Updated ${linksUpdated} ${linksUpdated === 1 ? 'entry link set' : 'entry link sets'}.`}
          </Text>
        </>
      )}

      {isFinished && resultSummary && (
        <Note variant="positive" title="Copy complete">
          {resultSummary}
        </Note>
      )}
    </Stack>
  );
}

export default Sidebar;
