import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Badge, Box, Button, Flex, IconButton, Text } from '@contentful/f36-components';
import { ChevronDownIcon, ChevronRightIcon } from '@contentful/f36-icons';
import { css } from '@emotion/css';
import tokens from '@contentful/f36-tokens';
import { JsonObject, JsonValue, isIndexSegment, isPlainObject } from '../lib/envelope';

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
  value: css({
    fontFamily: tokens.fontStackMonospace,
    fontSize: tokens.fontSizeS,
    flex: 1,
    minWidth: 0,
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
    color: tokens.gray800,
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
  data: JsonObject;
};

function pathKey(path: string[]): string {
  return path.join('\u0001');
}

function isExpandable(value: JsonValue): boolean {
  return isPlainObject(value) || Array.isArray(value);
}

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
  const expanded = new Set<string>();
  for (const key of Object.keys(source)) {
    if (isExpandable(source[key])) {
      expanded.add(pathKey([key]));
    }
  }
  return expanded;
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

function pathLabel(path: string[]): string {
  if (path.length === 0) {
    return 'root';
  }
  const segment = path[path.length - 1];
  return isIndexSegment(segment) ? `[${segment}]` : segment;
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
      aria-label={expanded ? 'Collapse' : 'Expand'}
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

const TreeNode = ({ node, path }: { node: JsonValue; path: string[] }) => {
  const { isExpanded, toggle, expandSubtree } = useExpansion();
  const expanded = path.length === 0 || isExpanded(path);
  const keyLabel = pathLabel(path);

  if (isPlainObject(node)) {
    const keys = Object.keys(node);
    if (path.length === 0) {
      return (
        <Box>
          {keys.map((key) => (
            <TreeNode key={key} node={node[key]} path={[key]} />
          ))}
        </Box>
      );
    }

    return (
      <Box>
        <Flex className={styles.row} alignItems="center">
          <CollapseToggle path={path} sourceNode={node} expanded={expanded} />
          <Text
            className={styles.key}
            style={{ cursor: 'pointer' }}
            onClick={() => toggle(path)}
            onDoubleClick={(event: React.MouseEvent) => {
              event.preventDefault();
              expandSubtree(path, node);
            }}>
            {keyLabel}
          </Text>
          <Badge variant="secondary">object</Badge>
          {!expanded && <Text className={styles.summary}>{formatSummary(node)}</Text>}
        </Flex>
        {expanded && (
          <Box className={styles.nested}>
            {keys.map((key) => (
              <TreeNode key={[...path, key].join('.')} node={node[key]} path={[...path, key]} />
            ))}
          </Box>
        )}
      </Box>
    );
  }

  if (Array.isArray(node) && path.length > 0) {
    return (
      <Box>
        <Flex className={styles.row} alignItems="center">
          <CollapseToggle path={path} sourceNode={node} expanded={expanded} />
          <Text
            className={styles.key}
            style={{ cursor: 'pointer' }}
            onClick={() => toggle(path)}
            onDoubleClick={(event: React.MouseEvent) => {
              event.preventDefault();
              expandSubtree(path, node);
            }}>
            {keyLabel}
          </Text>
          <Badge variant="secondary">array[{node.length}]</Badge>
          {!expanded && <Text className={styles.summary}>{formatSummary(node)}</Text>}
        </Flex>
        {expanded && (
          <Box className={styles.nested}>
            {node.map((item, index) => (
              <TreeNode
                key={[...path, String(index)].join('.')}
                node={item}
                path={[...path, String(index)]}
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
    <Flex className={styles.row} alignItems="flex-start">
      <Box className={styles.toggle} />
      <Text className={styles.key}>{keyLabel}</Text>
      <Text className={styles.value}>{formatDisplay(node)}</Text>
    </Flex>
  );
};

/**
 * Read-only collapsible JSON tree for plain (non-envelope) field values.
 */
const ReadOnlyJsonTree = ({ data }: Props) => {
  const allPaths = useMemo(() => collectExpandablePaths(data), [data]);
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(() => initialExpandedSet(data));

  const dataFingerprint = useMemo(() => JSON.stringify(data), [data]);
  useEffect(() => {
    setExpandedPaths(initialExpandedSet(JSON.parse(dataFingerprint) as JsonObject));
  }, [dataFingerprint]);

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

  const expansion = useMemo(
    () => ({ isExpanded, toggle, expandSubtree, collapseSubtree }),
    [isExpanded, toggle, expandSubtree, collapseSubtree]
  );

  return (
    <ExpansionContext.Provider value={expansion}>
      <Box>
        <Flex className={styles.toolbar} alignItems="center" gap="spacingXs">
          <Button size="small" variant="secondary" onClick={() => setExpandedPaths(new Set(allPaths))}>
            Expand all
          </Button>
          <Button size="small" variant="secondary" onClick={() => setExpandedPaths(new Set())}>
            Collapse all
          </Button>
          <Text className={styles.hint}>Read-only view · convert to envelope to edit overrides</Text>
        </Flex>
        <TreeNode node={data} path={[]} />
      </Box>
    </ExpansionContext.Provider>
  );
};

export default ReadOnlyJsonTree;
