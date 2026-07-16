import React, { useCallback, useEffect, useState } from 'react';
import { FieldAppSDK } from '@contentful/app-sdk';
import {
  Button,
  Flex,
  Note,
  Paragraph,
  Stack,
  Subheading,
  Tabs,
} from '@contentful/f36-components';
import { useAutoResizer, useSDK } from '@contentful/react-apps-toolkit';
import EffectiveTree from '../components/EffectiveTree';
import EnvelopeInspect from '../components/EnvelopeInspect';
import ReadOnlyJsonTree from '../components/ReadOnlyJsonTree';
import {
  FieldEnvelope,
  JsonObject,
  OverrideNode,
  adoptPlainJsonAsEnvelope,
  buildEnvelope,
  classifyFieldValue,
  unwrapEnvelope,
} from '../lib/envelope';
import { DialogResult } from '../types';

type ViewState =
  | { status: 'empty' }
  | { status: 'envelope'; envelope: FieldEnvelope }
  | { status: 'plain'; value: JsonObject }
  | { status: 'unsupported' };

function viewFromValue(value: unknown): ViewState {
  const classified = classifyFieldValue(value);
  switch (classified.kind) {
    case 'empty':
      return { status: 'empty' };
    case 'envelope':
      return { status: 'envelope', envelope: classified.envelope };
    case 'plainObject':
      return { status: 'plain', value: classified.value };
    default:
      return { status: 'unsupported' };
  }
}

const Field = () => {
  const sdk = useSDK<FieldAppSDK>();
  useAutoResizer();

  const [view, setView] = useState<ViewState>(() => viewFromValue(sdk.field.getValue()));
  const [inspectTab, setInspectTab] = useState<'source' | 'overrides' | 'envelope'>('source');

  useEffect(() => {
    const detach = sdk.field.onValueChanged((value) => {
      setView(viewFromValue(value));
    });
    return detach;
  }, [sdk.field]);

  const persistEnvelope = useCallback(
    async (next: FieldEnvelope | null) => {
      if (!next) {
        await sdk.field.removeValue();
        setView({ status: 'empty' });
        return;
      }
      const built = buildEnvelope(next.source, next.overrides);
      await sdk.field.setValue(built);
      setView({ status: 'envelope', envelope: built });
    },
    [sdk.field]
  );

  const persistPlain = useCallback(
    async (value: JsonObject) => {
      await sdk.field.setValue(value);
      setView({ status: 'plain', value });
    },
    [sdk.field]
  );

  const convertToEnvelope = useCallback(async () => {
    if (view.status !== 'plain') {
      return;
    }

    const confirmed = await sdk.dialogs.openConfirm({
      title: 'Convert to enveloped JSON?',
      message:
        'This wraps the current plain JSON as source data with empty overrides, so you can edit effective values in the app. You can convert back to plain JSON later.',
      intent: 'primary',
      confirmLabel: 'Convert to envelope',
      cancelLabel: 'Cancel',
    });

    if (!confirmed) {
      return;
    }

    const adopted = adoptPlainJsonAsEnvelope(view.value);
    await persistEnvelope(adopted);
    sdk.notifier.success('Converted to enveloped JSON (plain value is now source).');
  }, [view, sdk.dialogs, sdk.notifier, persistEnvelope]);

  const convertToPlainJson = useCallback(
    async (which: 'effective' | 'source') => {
      if (view.status !== 'envelope') {
        return;
      }

      const label = which === 'effective' ? 'effective (with overrides applied)' : 'original source';
      const confirmed = await sdk.dialogs.openConfirm({
        title: 'Convert to plain JSON?',
        message: `This replaces the envelope with plain JSON using the ${label} data. Overrides will no longer be stored separately. You can convert back to an envelope later.`,
        intent: 'negative',
        confirmLabel: 'Convert to plain JSON',
        cancelLabel: 'Cancel',
      });

      if (!confirmed) {
        return;
      }

      const plain = unwrapEnvelope(view.envelope, which);
      await persistPlain(plain);
      sdk.notifier.success(`Converted to plain JSON (${which}).`);
    },
    [view, sdk.dialogs, sdk.notifier, persistPlain]
  );

  const openPasteDialog = useCallback(async () => {
    const currentEnvelope = view.status === 'envelope' ? view.envelope : null;
    const plainSeed =
      view.status === 'plain' ? JSON.stringify(view.value, null, 2) : '';

    const result = (await sdk.dialogs.openCurrentApp({
      title: currentEnvelope ? 'Paste / replace JSON source' : 'Paste JSON',
      width: 'large',
      minHeight: '560px',
      shouldCloseOnEscapePress: true,
      shouldCloseOnOverlayClick: false,
      parameters: {
        currentSourceJson: currentEnvelope
          ? JSON.stringify(currentEnvelope.source, null, 2)
          : plainSeed,
      },
    })) as DialogResult | undefined;

    if (!result?.source) {
      return;
    }

    const source = result.source as JsonObject;

    if (view.status === 'envelope') {
      const overrides: OverrideNode = result.resetOverrides
        ? {}
        : currentEnvelope?.overrides ?? {};
      await persistEnvelope(buildEnvelope(source, overrides));
      return;
    }

    if (view.status === 'plain') {
      await persistPlain(source);
      return;
    }

    // Empty / unsupported → start as envelope (full app features)
    await persistEnvelope(buildEnvelope(source, {}));
  }, [sdk.dialogs, view, persistEnvelope, persistPlain]);

  const onOverridesChange = useCallback(
    async (overrides: OverrideNode) => {
      if (view.status !== 'envelope') {
        return;
      }
      await persistEnvelope(buildEnvelope(view.envelope.source, overrides));
    },
    [view, persistEnvelope]
  );

  if (sdk.field.type !== 'Object') {
    return (
      <Note variant="negative">
        This app only works on JSON Object fields. Current field type: {sdk.field.type}.
      </Note>
    );
  }

  if (view.status === 'unsupported') {
    return (
      <Stack spacing="spacingM">
        <Note variant="warning" title="Unsupported field value">
          This field must contain a JSON object. Arrays or primitives at the root are not supported.
        </Note>
        <Flex gap="spacingS">
          <Button variant="primary" onClick={openPasteDialog}>
            Paste JSON…
          </Button>
          <Button variant="negative" onClick={() => persistEnvelope(null)}>
            Clear field
          </Button>
        </Flex>
      </Stack>
    );
  }

  if (view.status === 'plain') {
    return (
      <Flex flexDirection="column" gap="spacingM">
        <Flex flexDirection="column" gap="spacingS">
          <Flex justifyContent="space-between" alignItems="center" gap="spacingS">
            <Subheading marginBottom="none">Plain JSON</Subheading>
            <Flex gap="spacingXs">
              <Button size="small" variant="secondary" onClick={openPasteDialog}>
                Paste / replace JSON…
              </Button>
              <Button size="small" variant="negative" onClick={() => persistEnvelope(null)}>
                Clear
              </Button>
            </Flex>
          </Flex>
          <Paragraph marginBottom="none">
            This field stores plain JSON (not the app envelope). Browse the tree below, or convert
            to envelope format to override values while keeping the original source.
          </Paragraph>
          <Flex gap="spacingXs" flexWrap="wrap">
            <Button size="small" variant="primary" onClick={convertToEnvelope}>
              Convert to enveloped JSON
            </Button>
          </Flex>
        </Flex>

        <Note variant="neutral">
          Read-only in plain mode — convert to envelope to enable overrides and removals.
        </Note>

        <ReadOnlyJsonTree data={view.value} />
      </Flex>
    );
  }

  if (view.status === 'empty') {
    return (
      <Stack spacing="spacingM">
        <Paragraph>
          No JSON yet. Paste JSON to simulate a third-party reference payload (stored as an
          envelope).
        </Paragraph>
        <Button variant="primary" onClick={openPasteDialog}>
          Paste JSON…
        </Button>
      </Stack>
    );
  }

  const { envelope } = view;

  return (
    <Flex flexDirection="column" gap="spacingM">
      <Flex flexDirection="column" gap="spacingS">
        <Flex justifyContent="space-between" alignItems="center" gap="spacingS">
          <Subheading marginBottom="none">Effective JSON</Subheading>
          <Flex gap="spacingXs">
            <Button size="small" variant="secondary" onClick={openPasteDialog}>
              Paste / replace source…
            </Button>
            <Button size="small" variant="negative" onClick={() => persistEnvelope(null)}>
              Clear
            </Button>
          </Flex>
        </Flex>
        <Paragraph marginBottom="none">
          Expand objects and arrays to navigate. Values in bordered fields are editable — click to
          override. When overridden, source and effective are shown side by side.
        </Paragraph>
        <Flex gap="spacingXs" flexWrap="wrap">
          <Button
            size="small"
            variant="transparent"
            onClick={() => persistEnvelope(buildEnvelope(envelope.source, {}))}>
            Reset all overrides
          </Button>
          <Button size="small" variant="secondary" onClick={() => convertToPlainJson('effective')}>
            Convert to plain JSON (effective)
          </Button>
          <Button size="small" variant="transparent" onClick={() => convertToPlainJson('source')}>
            Convert to plain JSON (source)
          </Button>
        </Flex>
      </Flex>

      <EffectiveTree envelope={envelope} onOverridesChange={onOverridesChange} />

      <Tabs
        currentTab={inspectTab}
        onTabChange={(id) => setInspectTab(id as 'source' | 'overrides' | 'envelope')}>
        <Tabs.List variant="horizontal-divider">
          <Tabs.Tab panelId="source">Source</Tabs.Tab>
          <Tabs.Tab panelId="overrides">Overrides</Tabs.Tab>
          <Tabs.Tab panelId="envelope">Envelope</Tabs.Tab>
        </Tabs.List>
        <Tabs.Panel id="source">
          <EnvelopeInspect envelope={envelope} tab="source" />
        </Tabs.Panel>
        <Tabs.Panel id="overrides">
          <EnvelopeInspect envelope={envelope} tab="overrides" />
        </Tabs.Panel>
        <Tabs.Panel id="envelope">
          <EnvelopeInspect envelope={envelope} tab="envelope" />
        </Tabs.Panel>
      </Tabs>
    </Flex>
  );
};

export default Field;
