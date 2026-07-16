import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
  Badge,
  Box,
  Button,
  Flex,
  IconButton,
  Stack,
  Text,
  TextInput,
  Textarea,
} from '@contentful/f36-components';
import {
  ChevronDownIcon,
  ChevronRightIcon,
  CloseIcon,
  CycleIcon,
  EditIcon,
} from '@contentful/f36-icons';
import { css } from '@emotion/css';
import tokens from '@contentful/f36-tokens';
import {
  DELETED,
  FieldEnvelope,
  JsonObject,
  JsonValue,
  OverrideNode,
  applyOverrides,
  clearOverrideAtPath,
  getOverrideAtPath,
  hasOverrideAtPath,
  isIndexSegment,
  isPlainObject,
  isTombstonedAtPath,
  setOverrideAtPath,
} from '../lib/envelope';

const styles = {
  toolbar: css({
    marginBottom: tokens.spacingS,
    paddingBottom: tokens.spacingXs,
    borderBottom: `1px solid ${tokens.gray200}`,
  }),
  row: css({
    borderBottom: `1px solid ${tokens.gray200}`,
    paddingTop: tokens.spacingXs,
    paddingBottom: tokens.spacingXs,
    gap: tokens.spacingS,
  }),
  key: css({
    fontFamily: tokens.fontStackMonospace,
    fontSize: tokens.fontSizeS,
    fontWeight: tokens.fontWeightMedium,
    minWidth: '140px',
    maxWidth: '220px',
    flexShrink: 0,
    wordBreak: 'break-all',
  }),
  nested: css({
    marginLeft: tokens.spacingS,
    borderLeft: `2px solid ${tokens.gray200}`,
    paddingLeft: tokens.spacingS,
  }),
  removed: css({
    color: tokens.gray500,
    textDecoration: 'line-through',
  }),
  mono: css({
    fontFamily: tokens.fontStackMonospace,
    fontSize: tokens.fontSizeS,
  }),
  editableValue: css({
    fontFamily: tokens.fontStackMonospace,
    fontSize: tokens.fontSizeS,
    width: '100%',
    minHeight: '32px',
    padding: `${tokens.spacing2Xs} ${tokens.spacingXs}`,
    border: `1px solid ${tokens.gray300}`,
    borderRadius: tokens.borderRadiusSmall,
    backgroundColor: tokens.colorWhite,
    color: tokens.gray800,
    cursor: 'text',
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
    boxSizing: 'border-box' as const,
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacing2Xs,
    '&:hover': {
      borderColor: tokens.blue500,
      backgroundColor: tokens.gray100,
    },
  }),
  editableValueOverridden: css({
    borderColor: tokens.orange400,
    backgroundColor: tokens.orange100,
    '&:hover': {
      borderColor: tokens.orange500,
      backgroundColor: tokens.orange100,
    },
  }),
  sourceValue: css({
    fontFamily: tokens.fontStackMonospace,
    fontSize: tokens.fontSizeS,
    width: '100%',
    minHeight: '32px',
    padding: `${tokens.spacing2Xs} ${tokens.spacingXs}`,
    border: `1px dashed ${tokens.gray300}`,
    borderRadius: tokens.borderRadiusSmall,
    backgroundColor: tokens.gray100,
    color: tokens.gray600,
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
    boxSizing: 'border-box' as const,
    display: 'flex',
    alignItems: 'center',
  }),
  column: css({
    flex: 1,
    minWidth: 0,
  }),
  columnLabel: css({
    fontSize: tokens.fontSizeS,
    color: tokens.gray500,
    marginBottom: tokens.spacing2Xs,
  }),
  toggle: css({
    flexShrink: 0,
    width: '24px',
  }),
  summary: css({
    fontFamily: tokens.fontStackMonospace,
    fontSize: tokens.fontSizeS,
    color: tokens.gray500,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    maxWidth: '360px',
  }),
  hint: css({
    fontSize: tokens.fontSizeS,
    color: tokens.gray500,
  }),
};

type Props = {
  envelope: FieldEnvelope;
  onOverridesChange: (overrides: OverrideNode) => void;
};

function pathKey(path: string[]): string {
  return path.join('\u0001');
}

function isExpandable(value: JsonValue): boolean {
  return isPlainObject(value) || Array.isArray(value);
}

/** Collect every expandable path under a JSON value (including `basePath`). */
function collectExpandablePaths(value: JsonValue, basePath: string[] = []): string[] {
  const keys: string[] = [];

  const walk = (node: JsonValue, path: string[]) => {
    if (isPlainObject(node)) {
      if (path.length > 0) {
        keys.push(pathKey(path));
      }
      for (const key of Object.keys(node)) {
        walk(node[key], [...path, key]);
      }
      return;
    }
    if (Array.isArray(node)) {
      if (path.length > 0) {
        keys.push(pathKey(path));
      }
      node.forEach((item, index) => walk(item, [...path, String(index)]));
    }
  };

  walk(value, basePath);
  return keys;
}

function initialExpandedSet(source: JsonObject): Set<string> {
  // First level open (common JSON viewer default); deeper nodes collapsed.
  const expanded = new Set<string>();
  for (const key of Object.keys(source)) {
    if (isExpandable(source[key])) {
      expanded.add(pathKey([key]));
    }
  }
  return expanded;
}

type ExpansionContextValue = {
  isExpanded: (path: string[]) => boolean;
  toggle: (path: string[]) => void;
  expandSubtree: (path: string[], sourceNode: JsonValue) => void;
  collapseSubtree: (path: string[], sourceNode: JsonValue) => void;
};

const ExpansionContext = createContext<ExpansionContextValue | null>(null);

function useExpansion(): ExpansionContextValue {
  const ctx = useContext(ExpansionContext);
  if (!ctx) {
    throw new Error('useExpansion must be used within ExpansionContext');
  }
  return ctx;
}

function formatDisplay(value: JsonValue): string {
  if (typeof value === 'string') {
    return value;
  }
  return JSON.stringify(value);
}

function formatSummary(value: JsonValue): string {
  if (Array.isArray(value)) {
    return `${value.length} item${value.length === 1 ? '' : 's'}`;
  }
  if (isPlainObject(value)) {
    const keys = Object.keys(value);
    return `${keys.length} key${keys.length === 1 ? '' : 's'}`;
  }
  const text = formatDisplay(value);
  return text.length > 48 ? `${text.slice(0, 45)}…` : text;
}

function effectiveAtPath(
  sourceNode: JsonValue,
  overrides: OverrideNode | undefined,
  path: string[]
): JsonValue | undefined {
  if (isTombstonedAtPath(overrides, path)) {
    return undefined;
  }
  const local = getOverrideAtPath(overrides, path);
  return applyOverrides(sourceNode, local);
}

function pathLabel(path: string[]): string {
  if (path.length === 0) {
    return 'root';
  }
  const segment = path[path.length - 1];
  return isIndexSegment(segment) ? `[${segment}]` : segment;
}

type ParseFailure = { readonly __failure: true; error: string };

function parseEditedValue(raw: string, original: JsonValue): JsonValue | ParseFailure {
  if (typeof original === 'string') {
    return raw;
  }
  if (typeof original === 'number') {
    const n = Number(raw);
    if (Number.isNaN(n)) {
      return { __failure: true, error: 'Expected a number' };
    }
    return n;
  }
  if (typeof original === 'boolean') {
    if (raw === 'true') return true;
    if (raw === 'false') return false;
    return { __failure: true, error: 'Expected true or false' };
  }
  if (original === null) {
    if (raw === 'null') return null;
    return { __failure: true, error: 'Expected null' };
  }
  try {
    return JSON.parse(raw) as JsonValue;
  } catch {
    return { __failure: true, error: 'Invalid JSON' };
  }
}

function isParseFailure(value: JsonValue | ParseFailure): value is ParseFailure {
  return typeof value === 'object' && value !== null && (value as ParseFailure).__failure === true;
}

type NodeProps = {
  sourceNode: JsonValue;
  path: string[];
  envelope: FieldEnvelope;
  onOverridesChange: (overrides: OverrideNode) => void;
};

const LeafEditor = ({
  sourceNode,
  path,
  envelope,
  onOverridesChange,
  isArrayLeaf,
  onCancelEdit,
}: NodeProps & { isArrayLeaf?: boolean; onCancelEdit?: () => void }) => {
  const effectiveValue = effectiveAtPath(sourceNode, envelope.overrides, path);
  const isArray = Array.isArray(sourceNode) || Boolean(isArrayLeaf);

  const initialDraft = (() => {
    if (!isArrayLeaf) return null;
    const current = (effectiveValue ?? sourceNode) as JsonValue;
    return JSON.stringify(current, null, 2);
  })();

  const [draft, setDraft] = useState<string | null>(initialDraft);
  const [error, setError] = useState<string | null>(null);

  const overridden = hasOverrideAtPath(envelope.overrides, path);
  const removed = isTombstonedAtPath(envelope.overrides, path);
  const keyLabel = pathLabel(path);
  const applyOverrides = (overrides: OverrideNode) => onOverridesChange(overrides);

  const editing = draft !== null;
  const shown = removed
    ? ''
    : effectiveValue !== undefined
      ? isArray || isPlainObject(effectiveValue)
        ? JSON.stringify(effectiveValue, null, 2)
        : formatDisplay(effectiveValue)
      : formatDisplay(sourceNode);

  const sourceShown =
    isArray || isPlainObject(sourceNode)
      ? JSON.stringify(sourceNode, null, 2)
      : formatDisplay(sourceNode);

  const startEdit = () => {
    const current = (effectiveValue ?? sourceNode) as JsonValue;
    setDraft(
      isArray || isPlainObject(current) ? JSON.stringify(current, null, 2) : formatDisplay(current)
    );
  };

  const commitValue = (raw: string) => {
    const parsed = parseEditedValue(raw, sourceNode);
    if (isParseFailure(parsed)) {
      setError(parsed.error);
      return;
    }
    setError(null);
    setDraft(null);

    if (JSON.stringify(parsed) === JSON.stringify(sourceNode)) {
      applyOverrides(clearOverrideAtPath(envelope.overrides, path));
      return;
    }

    applyOverrides(setOverrideAtPath(envelope.overrides, path, parsed));
  };

  const cancelEdit = () => {
    setDraft(null);
    setError(null);
    onCancelEdit?.();
  };

  const valueBoxClass = `${styles.editableValue} ${
    overridden && !removed ? styles.editableValueOverridden : ''
  }`;

  return (
    <Flex className={styles.row} alignItems="flex-start">
      <Box className={styles.toggle} />
      <Text className={`${styles.key} ${removed ? styles.removed : ''}`}>{keyLabel}</Text>

      {removed ? (
        <Flex className={styles.column} gap="spacingS" alignItems="flex-start">
          <Box className={styles.column} style={{ flex: 1 }}>
            <div className={styles.columnLabel}>Source</div>
            <div className={styles.sourceValue}>{sourceShown}</div>
          </Box>
          <Box className={styles.column} style={{ flex: 1 }}>
            <div className={styles.columnLabel}>Effective</div>
            <Badge variant="negative">removed</Badge>
          </Box>
        </Flex>
      ) : editing ? (
        <Stack flexDirection="column" spacing="spacingXs" style={{ flex: 1, minWidth: 0 }}>
          {overridden && (
            <Box>
              <div className={styles.columnLabel}>Source</div>
              <div className={styles.sourceValue}>{sourceShown}</div>
            </Box>
          )}
          <Box>
            <div className={styles.columnLabel}>{overridden ? 'Effective (editing)' : 'Value'}</div>
            {isArray || (typeof sourceNode === 'object' && sourceNode !== null) ? (
              <Textarea
                className={styles.mono}
                value={draft ?? ''}
                rows={Math.min(8, (draft ?? '').split('\n').length + 1)}
                onChange={(e) => setDraft(e.target.value)}
              />
            ) : (
              <TextInput value={draft ?? ''} onChange={(e) => setDraft(e.target.value)} />
            )}
          </Box>
          {error && (
            <Text fontColor="red600" fontSize="fontSizeS">
              {error}
            </Text>
          )}
          <Flex gap="spacingXs">
            <Button size="small" variant="primary" onClick={() => commitValue(draft ?? '')}>
              Apply
            </Button>
            <Button size="small" variant="transparent" onClick={cancelEdit}>
              Cancel
            </Button>
          </Flex>
        </Stack>
      ) : overridden ? (
        <Flex className={styles.column} gap="spacingS" alignItems="flex-start">
          <Box className={styles.column}>
            <div className={styles.columnLabel}>Source</div>
            <div className={styles.sourceValue}>{sourceShown}</div>
          </Box>
          <Box className={styles.column}>
            <div className={styles.columnLabel}>Effective</div>
            <button type="button" className={valueBoxClass} onClick={startEdit}>
              <EditIcon size="tiny" />
              <span>{shown}</span>
            </button>
          </Box>
        </Flex>
      ) : (
        <Box className={styles.column}>
          <button type="button" className={valueBoxClass} onClick={startEdit}>
            <EditIcon size="tiny" />
            <span>{shown}</span>
          </button>
        </Box>
      )}

      <Flex gap="spacing2Xs" style={{ flexShrink: 0 }}>
        {overridden && (
          <IconButton
            variant="transparent"
            size="small"
            aria-label="Reset override"
            icon={<CycleIcon />}
            onClick={() => applyOverrides(clearOverrideAtPath(envelope.overrides, path))}
          />
        )}
        {!removed && (
          <IconButton
            variant="transparent"
            size="small"
            aria-label="Remove"
            icon={<CloseIcon />}
            onClick={() => applyOverrides(setOverrideAtPath(envelope.overrides, path, DELETED))}
          />
        )}
      </Flex>
    </Flex>
  );
};

const CollapseToggle = ({
  path,
  sourceNode,
  expanded,
}: {
  path: string[];
  sourceNode: JsonValue;
  expanded: boolean;
}) => {
  const { toggle, expandSubtree, collapseSubtree } = useExpansion();

  return (
    <IconButton
      className={styles.toggle}
      variant="transparent"
      size="small"
      aria-label={
        expanded
          ? 'Collapse (Alt/Option-click to collapse all children)'
          : 'Expand (Alt/Option-click to expand all children)'
      }
      title={
        expanded
          ? 'Collapse · Alt/Option-click collapses all children'
          : 'Expand · Alt/Option-click expands all children'
      }
      icon={expanded ? <ChevronDownIcon /> : <ChevronRightIcon />}
      onClick={(event: React.MouseEvent) => {
        if (event.altKey) {
          if (expanded) {
            collapseSubtree(path, sourceNode);
          } else {
            expandSubtree(path, sourceNode);
          }
          return;
        }
        toggle(path);
      }}
    />
  );
};

const TreeNode = ({ sourceNode, path, envelope, onOverridesChange }: NodeProps) => {
  const { isExpanded, toggle, expandSubtree } = useExpansion();
  const [editingWholeArray, setEditingWholeArray] = useState(false);

  const overridden = path.length > 0 && hasOverrideAtPath(envelope.overrides, path);
  const removed = path.length > 0 && isTombstonedAtPath(envelope.overrides, path);
  const keyLabel = pathLabel(path);
  const applyOverrides = (overrides: OverrideNode) => onOverridesChange(overrides);
  const expanded = path.length === 0 || isExpanded(path);

  const headerActions = (
    <Flex style={{ marginLeft: 'auto', flexShrink: 0 }} gap="spacing2Xs">
      {overridden && (
        <IconButton
          variant="transparent"
          size="small"
          aria-label="Reset override"
          icon={<CycleIcon />}
          onClick={() => applyOverrides(clearOverrideAtPath(envelope.overrides, path))}
        />
      )}
      <IconButton
        variant="transparent"
        size="small"
        aria-label="Remove"
        icon={<CloseIcon />}
        onClick={() => applyOverrides(setOverrideAtPath(envelope.overrides, path, DELETED))}
      />
    </Flex>
  );

  if (isPlainObject(sourceNode) && !removed) {
    const keys = Object.keys(sourceNode);
    if (path.length === 0) {
      return (
        <Box>
          {keys.map((key) => (
            <TreeNode
              key={key}
              sourceNode={sourceNode[key]}
              path={[key]}
              envelope={envelope}
              onOverridesChange={onOverridesChange}
            />
          ))}
        </Box>
      );
    }

    return (
      <Box>
        <Flex className={styles.row} alignItems="center">
          <CollapseToggle path={path} sourceNode={sourceNode} expanded={expanded} />
          <Text
            className={styles.key}
            style={{ cursor: 'pointer' }}
            onClick={() => toggle(path)}
            onDoubleClick={(event: React.MouseEvent) => {
              event.preventDefault();
              expandSubtree(path, sourceNode);
            }}>
            {keyLabel}
          </Text>
          <Badge variant="secondary">object</Badge>
          {overridden && <Badge variant="warning">overridden</Badge>}
          {!expanded && <Text className={styles.summary}>{formatSummary(sourceNode)}</Text>}
          {headerActions}
        </Flex>
        {expanded && (
          <Box className={styles.nested}>
            {keys.map((key) => (
              <TreeNode
                key={[...path, key].join('.')}
                sourceNode={sourceNode[key]}
                path={[...path, key]}
                envelope={envelope}
                onOverridesChange={onOverridesChange}
              />
            ))}
          </Box>
        )}
      </Box>
    );
  }

  if (Array.isArray(sourceNode) && !removed && path.length > 0) {
    if (editingWholeArray) {
      return (
        <LeafEditor
          sourceNode={sourceNode}
          path={path}
          envelope={envelope}
          onOverridesChange={(next) => {
            onOverridesChange(next);
            setEditingWholeArray(false);
          }}
          onCancelEdit={() => setEditingWholeArray(false)}
          isArrayLeaf
        />
      );
    }

    return (
      <Box>
        <Flex className={styles.row} alignItems="center">
          <CollapseToggle path={path} sourceNode={sourceNode} expanded={expanded} />
          <Text
            className={styles.key}
            style={{ cursor: 'pointer' }}
            onClick={() => toggle(path)}
            onDoubleClick={(event: React.MouseEvent) => {
              event.preventDefault();
              expandSubtree(path, sourceNode);
            }}>
            {keyLabel}
          </Text>
          <Badge variant="secondary">array[{sourceNode.length}]</Badge>
          {overridden && <Badge variant="warning">overridden</Badge>}
          {!expanded && <Text className={styles.summary}>{formatSummary(sourceNode)}</Text>}
          <Flex style={{ marginLeft: 'auto', flexShrink: 0 }} gap="spacing2Xs">
            <IconButton
              variant="transparent"
              size="small"
              aria-label="Edit array as JSON"
              icon={<EditIcon />}
              onClick={() => setEditingWholeArray(true)}
            />
            {overridden && (
              <IconButton
                variant="transparent"
                size="small"
                aria-label="Reset override"
                icon={<CycleIcon />}
                onClick={() => applyOverrides(clearOverrideAtPath(envelope.overrides, path))}
              />
            )}
            <IconButton
              variant="transparent"
              size="small"
              aria-label="Remove array"
              icon={<CloseIcon />}
              onClick={() => applyOverrides(setOverrideAtPath(envelope.overrides, path, DELETED))}
            />
          </Flex>
        </Flex>
        {expanded && (
          <Box className={styles.nested}>
            {sourceNode.map((item, index) => (
              <TreeNode
                key={[...path, String(index)].join('.')}
                sourceNode={item}
                path={[...path, String(index)]}
                envelope={envelope}
                onOverridesChange={onOverridesChange}
              />
            ))}
          </Box>
        )}
      </Box>
    );
  }

  if (path.length === 0) {
    return null;
  }

  return (
    <LeafEditor
      sourceNode={sourceNode}
      path={path}
      envelope={envelope}
      onOverridesChange={onOverridesChange}
    />
  );
};

const EffectiveTree = ({ envelope, onOverridesChange }: Props) => {
  const allPaths = useMemo(() => collectExpandablePaths(envelope.source), [envelope.source]);

  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(() =>
    initialExpandedSet(envelope.source)
  );

  // Reset expansion defaults only when source JSON content is replaced (not on overrides)
  const sourceFingerprint = useMemo(() => JSON.stringify(envelope.source), [envelope.source]);
  useEffect(() => {
    setExpandedPaths(initialExpandedSet(JSON.parse(sourceFingerprint) as JsonObject));
  }, [sourceFingerprint]);

  const isExpanded = useCallback(
    (path: string[]) => expandedPaths.has(pathKey(path)),
    [expandedPaths]
  );

  const toggle = useCallback((path: string[]) => {
    const key = pathKey(path);
    setExpandedPaths((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }, []);

  const expandSubtree = useCallback((path: string[], sourceNode: JsonValue) => {
    const keys = collectExpandablePaths(sourceNode, path);
    setExpandedPaths((prev) => {
      const next = new Set(prev);
      for (const key of keys) {
        next.add(key);
      }
      return next;
    });
  }, []);

  const collapseSubtree = useCallback((path: string[], sourceNode: JsonValue) => {
    const keys = collectExpandablePaths(sourceNode, path);
    setExpandedPaths((prev) => {
      const next = new Set(prev);
      for (const key of keys) {
        next.delete(key);
      }
      return next;
    });
  }, []);

  const expandAll = useCallback(() => {
    setExpandedPaths(new Set(allPaths));
  }, [allPaths]);

  const collapseAll = useCallback(() => {
    setExpandedPaths(new Set());
  }, []);

  const expansion = useMemo(
    () => ({ isExpanded, toggle, expandSubtree, collapseSubtree }),
    [isExpanded, toggle, expandSubtree, collapseSubtree]
  );

  return (
    <ExpansionContext.Provider value={expansion}>
      <Box>
        <Flex className={styles.toolbar} alignItems="center" gap="spacingXs">
          <Button size="small" variant="secondary" onClick={expandAll}>
            Expand all
          </Button>
          <Button size="small" variant="secondary" onClick={collapseAll}>
            Collapse all
          </Button>
          <Text className={styles.hint}>
            Alt/Option-click a chevron (or double-click a key) to expand/collapse that whole subtree
          </Text>
        </Flex>
        <TreeNode
          sourceNode={envelope.source}
          path={[]}
          envelope={envelope}
          onOverridesChange={onOverridesChange}
        />
      </Box>
    </ExpansionContext.Provider>
  );
};

export default EffectiveTree;
