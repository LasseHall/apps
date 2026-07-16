import { AppState } from '@contentful/app-sdk';

export type ContentTypeFieldLike = {
  id: string;
  name: string;
  type: string;
};

export type ContentTypeLike = {
  sys: { id: string };
  name: string;
  fields?: ContentTypeFieldLike[];
};

export type JsonFieldInfo = {
  fieldUniqueId: string;
  displayName: string;
  contentTypeId: string;
  contentTypeName: string;
  fieldId: string;
  fieldName: string;
};

export type TargetState = {
  EditorInterface: AppState['EditorInterface'];
};

/** Selected JSON Object fields keyed by content type id. */
export type SelectedFields = Record<string, string[]>;

export function getJsonObjectFields(contentType: ContentTypeLike): ContentTypeFieldLike[] {
  return (contentType.fields || []).filter((field) => field.type === 'Object');
}

export function contentTypesWithJsonFields(contentTypes: ContentTypeLike[]): ContentTypeLike[] {
  return contentTypes
    .filter((ct) => getJsonObjectFields(ct).length > 0)
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function processContentTypesToFields(contentTypes: ContentTypeLike[]): JsonFieldInfo[] {
  return contentTypes
    .flatMap((contentType) =>
      getJsonObjectFields(contentType).map((field) => ({
        fieldUniqueId: `${contentType.sys.id}.${field.id}`,
        displayName: `${contentType.name} > ${field.name}`,
        contentTypeId: contentType.sys.id,
        contentTypeName: contentType.name,
        fieldId: field.id,
        fieldName: field.name,
      }))
    )
    .sort((a, b) => a.displayName.localeCompare(b.displayName));
}

export function restoreSelectedFields(
  availableFields: JsonFieldInfo[],
  currentState: TargetState | null | undefined
): SelectedFields {
  const editorInterface = currentState?.EditorInterface || {};
  const selected: SelectedFields = {};

  for (const field of availableFields) {
    const config = editorInterface[field.contentTypeId];
    const isAssigned = config?.controls?.some((control) => control.fieldId === field.fieldId);
    if (!isAssigned) {
      continue;
    }
    if (!selected[field.contentTypeId]) {
      selected[field.contentTypeId] = [];
    }
    selected[field.contentTypeId].push(field.fieldId);
  }

  return selected;
}

export function selectedFieldsToTargetState(
  contentTypes: ContentTypeLike[],
  selectedFields: SelectedFields
): TargetState {
  return {
    EditorInterface: contentTypes.reduce<AppState['EditorInterface']>((acc, ct) => {
      const fields = selectedFields[ct.sys.id] || [];
      acc[ct.sys.id] =
        fields.length > 0 ? { controls: fields.map((fieldId) => ({ fieldId })) } : {};
      return acc;
    }, {}),
  };
}

export function isFieldSelected(
  selectedFields: SelectedFields,
  contentTypeId: string,
  fieldId: string
): boolean {
  return (selectedFields[contentTypeId] || []).includes(fieldId);
}

export function toggleFieldSelection(
  selectedFields: SelectedFields,
  contentTypeId: string,
  fieldId: string,
  enabled: boolean
): SelectedFields {
  const current = selectedFields[contentTypeId] || [];
  let nextForCt: string[];

  if (enabled) {
    nextForCt = current.includes(fieldId) ? current : [...current, fieldId];
  } else {
    nextForCt = current.filter((id) => id !== fieldId);
  }

  const next = { ...selectedFields };
  if (nextForCt.length === 0) {
    delete next[contentTypeId];
  } else {
    next[contentTypeId] = nextForCt;
  }
  return next;
}
