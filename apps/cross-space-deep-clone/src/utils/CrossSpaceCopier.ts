import { EntryProps } from 'contentful-management';
import { AppParameters } from '@/vite-env';
import { AssetCopier } from './AssetCopier';
import { getTargetContext, SpaceContext } from './CmaClients';
import { EntryCopier } from './EntryCopier';
import { runPreflight } from './preflight';
import { ReferenceGraph, ReferenceGraphData } from './ReferenceGraph';

export type CrossSpaceCopyProgress = {
  referencesFound: number;
  assetsCopied: number;
  assetsTotal: number;
  entriesCreated: number;
  entriesTotal: number;
  linksUpdated: number;
};

export type CrossSpaceCopyResult = {
  rootEntry: EntryProps;
  targetSpaceId: string;
  failedUpdateIds: string[];
  warnings: string[];
};

export class CrossSpaceCopier {
  private graph?: ReferenceGraph;
  private graphData?: ReferenceGraphData;

  constructor(
    private readonly source: SpaceContext,
    private readonly parameters: AppParameters,
    private readonly rootEntryId: string,
    private readonly onProgress?: (progress: CrossSpaceCopyProgress) => void
  ) {}

  async getReferenceSelectionData(): Promise<{
    referenceTree: Awaited<ReturnType<ReferenceGraph['build']>>;
    entryContentTypes: ReturnType<ReferenceGraph['getEntryContentTypes']>;
  }> {
    this.graph = new ReferenceGraph(this.source, this.rootEntryId, (count) => {
      this.onProgress?.({
        referencesFound: count,
        assetsCopied: 0,
        assetsTotal: 0,
        entriesCreated: 0,
        entriesTotal: 0,
        linksUpdated: 0,
      });
    });
    const referenceTree = await this.graph.build();
    return {
      referenceTree,
      entryContentTypes: this.graph.getEntryContentTypes(),
    };
  }

  async getReferenceTree() {
    const { referenceTree } = await this.getReferenceSelectionData();
    return referenceTree;
  }

  async copyToSpace(
    targetSpaceId: string,
    selectedEntryIds: string[],
    selectedAssetIds: string[],
    selectedLocales: string[]
  ): Promise<CrossSpaceCopyResult> {
    if (!this.graph) {
      await this.getReferenceTree();
    }

    if (!this.graph) {
      throw new Error('Reference graph could not be built.');
    }

    this.graphData = this.graph.filter(selectedEntryIds, selectedAssetIds);
    const target = getTargetContext(this.source.client, targetSpaceId);
    const concurrency = this.parameters.maxConcurrentRequests ?? 5;
    const existingResourceBehavior = this.parameters.existingResourceBehavior ?? 'overwrite';

    const preflight = await runPreflight(target, this.graphData, selectedLocales);
    if (!preflight.ok) {
      const message = preflight.issues
        .filter((issue) => issue.level === 'error')
        .map((issue) => issue.message)
        .join(' ');
      throw new Error(message || 'Preflight checks failed.');
    }

    const warnings = preflight.issues
      .filter((issue) => issue.level === 'warning')
      .map((issue) => issue.message);

    const assetCopier = new AssetCopier(
      target,
      concurrency,
      existingResourceBehavior,
      selectedLocales,
      ({ completed, total }) => {
        this.onProgress?.({
          referencesFound: this.graph?.getReferenceCount() ?? 0,
          assetsCopied: completed,
          assetsTotal: total,
          entriesCreated: 0,
          entriesTotal: Object.keys(this.graphData!.entries).length,
          linksUpdated: 0,
        });
      }
    );

    const assetIdMap = await assetCopier.copyAssets(this.graphData.assets);

    for (const assetId of assetCopier.getSkippedAssetIds()) {
      warnings.push(`Asset "${assetId}" already exists in target; skipped.`);
    }

    const entryCopier = new EntryCopier(
      target,
      this.parameters.cloneText,
      this.parameters.cloneTextBefore,
      concurrency,
      existingResourceBehavior,
      selectedLocales,
      ({ created, updated, total }) => {
        this.onProgress?.({
          referencesFound: this.graph?.getReferenceCount() ?? 0,
          assetsCopied: Object.keys(this.graphData!.assets).length,
          assetsTotal: Object.keys(this.graphData!.assets).length,
          entriesCreated: created,
          entriesTotal: total,
          linksUpdated: updated,
        });
      }
    );

    const { rootEntry } = await entryCopier.copyEntries(
      this.graphData.entries,
      this.rootEntryId,
      {},
      assetIdMap
    );

    for (const embedId of entryCopier.getUnmappedRichTextEmbeds()) {
      warnings.push(
        `Rich text embed target "${embedId}" was not copied; left as a broken reference in the target entry.`
      );
    }

    for (const entryId of entryCopier.getSkippedEntryIds()) {
      warnings.push(`Entry "${entryId}" already exists in target; skipped.`);
    }

    return {
      rootEntry,
      targetSpaceId,
      failedUpdateIds: entryCopier.getFailedUpdateIds(),
      warnings,
    };
  }
}
