/// <reference types="vite/client" />

export type TargetSpaceAllowlistEntry = {
  id: string;
  name: string;
};

export type LocaleCopyMode = 'defaultOnly' | 'all' | 'custom';

export type AppParameters = {
  cloneText: string;
  cloneTextBefore: boolean;
  automaticRedirect: boolean;
  allowedTargetSpaceIds?: TargetSpaceAllowlistEntry[];
  maxConcurrentRequests?: number;
  existingResourceBehavior?: 'overwrite' | 'skip';
  localeCopyMode?: LocaleCopyMode;
  customLocales?: string[];
};

export type SpaceOption = {
  id: string;
  name: string;
};

export type LocaleOption = {
  code: string;
  name: string;
  default: boolean;
};

export type CopyDialogResult = {
  targetSpaceId: string;
  selectedEntryIds: string[];
  selectedAssetIds: string[];
  selectedLocales: string[];
};
