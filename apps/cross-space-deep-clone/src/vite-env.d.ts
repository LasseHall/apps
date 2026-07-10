/// <reference types="vite/client" />

export type TargetSpaceAllowlistEntry = {
  id: string;
  name: string;
};

export type AppParameters = {
  cloneText: string;
  cloneTextBefore: boolean;
  automaticRedirect: boolean;
  allowedTargetSpaceIds?: TargetSpaceAllowlistEntry[];
  maxConcurrentRequests?: number;
  existingResourceBehavior?: 'overwrite' | 'skip';
};

export type SpaceOption = {
  id: string;
  name: string;
};

export type CopyDialogResult = {
  targetSpaceId: string;
  selectedEntryIds: string[];
  selectedAssetIds: string[];
};
