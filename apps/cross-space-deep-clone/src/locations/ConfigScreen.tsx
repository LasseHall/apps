import { useCallback, useEffect, useState } from 'react';
import {
  Heading,
  Stack,
  FormControl,
  TextInput,
  Radio,
  Paragraph,
  Flex,
  Box,
  Subheading,
  Switch,
  Button,
  Text,
  Checkbox,
} from '@contentful/f36-components';
import { useSDK } from '@contentful/react-apps-toolkit';
import { AppParameters, LocaleCopyMode, LocaleOption, TargetSpaceAllowlistEntry } from '@/vite-env';
import { ConfigAppSDK } from '@contentful/app-sdk';
import { styles } from './ConfigScreen.styles';
import ContentTypeMultiSelect, { ContentType } from '../components/ContentTypeMultiSelect';
import { createPlainClient } from '../utils/CmaClients';
import { DEFAULT_INSTALLATION_PARAMETERS } from '../utils/useInstallationParameters';

function ConfigScreen() {
  const [parameters, setParameters] = useState<AppParameters>({
    ...DEFAULT_INSTALLATION_PARAMETERS,
    allowedTargetSpaceIds: [],
  });
  const [selectedContentTypes, setSelectedContentTypes] = useState<ContentType[]>([]);
  const [newSpaceId, setNewSpaceId] = useState('');
  const [newSpaceName, setNewSpaceName] = useState('');
  const [sourceLocales, setSourceLocales] = useState<LocaleOption[]>([]);
  const sdk = useSDK<ConfigAppSDK>();

  useEffect(() => {
    (async () => {
      const currentParameters = (await sdk.app.getParameters()) as AppParameters | null;
      if (currentParameters) {
        setParameters({ ...DEFAULT_INSTALLATION_PARAMETERS, ...currentParameters });
      }

      try {
        const client = createPlainClient(sdk);
        const response = await client.locale.getMany({
          spaceId: sdk.ids.space,
          environmentId: sdk.ids.environmentAlias ?? sdk.ids.environment,
        });
        setSourceLocales(
          response.items
            .map((locale) => ({
              code: locale.code,
              name: locale.name,
              default: Boolean(locale.default),
            }))
            .sort((a, b) => {
              if (a.default === b.default) return a.code.localeCompare(b.code);
              return a.default ? -1 : 1;
            })
        );
      } catch (error) {
        console.warn('Could not load source locales for config', error);
      }

      sdk.app.setReady();
    })();
  }, [sdk]);

  const onConfigure = useCallback(async () => {
    if (parameters.localeCopyMode === 'custom' && (parameters.customLocales ?? []).length === 0) {
      sdk.notifier.error('Select at least one locale for custom locale copy defaults.');
      return false;
    }

    const editorInterface = selectedContentTypes.reduce(
      (acc, contentType) => ({
        ...acc,
        [contentType.id]: {
          sidebar: { position: 0 },
        },
      }),
      {}
    );

    return {
      parameters: {
        ...parameters,
        cloneText: parameters.cloneText?.trim() ?? '',
      },
      targetState: { EditorInterface: { ...editorInterface } },
    };
  }, [parameters, selectedContentTypes, sdk]);

  useEffect(() => {
    sdk.app.onConfigure(onConfigure);
  }, [sdk, onConfigure]);

  const addAllowlistEntry = () => {
    if (!newSpaceId.trim() || !newSpaceName.trim()) return;
    const nextEntry: TargetSpaceAllowlistEntry = {
      id: newSpaceId.trim(),
      name: newSpaceName.trim(),
    };
    setParameters({
      ...parameters,
      allowedTargetSpaceIds: [...(parameters.allowedTargetSpaceIds ?? []), nextEntry],
    });
    setNewSpaceId('');
    setNewSpaceName('');
  };

  const removeAllowlistEntry = (spaceId: string) => {
    setParameters({
      ...parameters,
      allowedTargetSpaceIds: (parameters.allowedTargetSpaceIds ?? []).filter(
        (entry) => entry.id !== spaceId
      ),
    });
  };

  const toggleCustomLocale = (code: string, checked: boolean) => {
    const current = new Set(parameters.customLocales ?? []);
    if (checked) current.add(code);
    else current.delete(code);
    setParameters({
      ...parameters,
      customLocales: [...current],
    });
  };

  return (
    <Box className={styles.page}>
      <Flex className={styles.content} flexDirection="column" gap="spacing2Xl">
      <Box>
        <Heading>Set up Cross-Space Deep Clone</Heading>
        <Paragraph marginTop="spacingS">
          Copy a page entry and selected linked entries and assets from this space to another
          space in the same organization.
        </Paragraph>
      </Box>

      <Box>
        <Subheading marginBottom="spacingM">Assign content types</Subheading>
        <ContentTypeMultiSelect
          selectedContentTypes={selectedContentTypes}
          setSelectedContentTypes={setSelectedContentTypes}
          sdk={sdk}
          cma={sdk.cma}
        />
      </Box>

      <Box>
        <Subheading marginBottom="spacingM">Naming</Subheading>
        <FormControl>
          <FormControl.Label className={styles.textInputLabel}>Clone text (optional)</FormControl.Label>
          <TextInput
            value={parameters.cloneText}
            onChange={(event) => setParameters({ ...parameters, cloneText: event.target.value })}
            placeholder="Leave empty to keep original titles"
          />
          <FormControl.HelpText>
            Optional prefix or suffix for copied entry titles. Leave blank to keep titles unchanged.
          </FormControl.HelpText>
        </FormControl>
        <FormControl marginTop="spacingM">
          <FormControl.Label className={styles.textInputLabel}>
            If clone text is set, display it before or after the entry name?
          </FormControl.Label>
          <Radio.Group
            name="cloneTextBefore"
            value={parameters.cloneTextBefore ? 'before' : 'after'}
            onChange={(event) =>
              setParameters({ ...parameters, cloneTextBefore: event.target.value === 'before' })
            }>
            <Radio value="before">Before</Radio>
            <Radio value="after">After</Radio>
          </Radio.Group>
        </FormControl>
      </Box>

      <Box>
        <Subheading marginBottom="spacingM">Locales</Subheading>
        <FormControl>
          <FormControl.Label>
            Default locales to copy (editors can change this in the copy dialog)
          </FormControl.Label>
          <Radio.Group
            name="localeCopyMode"
            value={parameters.localeCopyMode ?? 'defaultOnly'}
            onChange={(event) =>
              setParameters({
                ...parameters,
                localeCopyMode: event.target.value as LocaleCopyMode,
              })
            }>
            <Radio value="defaultOnly">Source default locale only</Radio>
            <Radio value="all">All source locales</Radio>
            <Radio value="custom">Custom locale set</Radio>
          </Radio.Group>
          <FormControl.HelpText>
            For HQ → market pushes, default locale only keeps market localization intact.
          </FormControl.HelpText>
        </FormControl>
        {parameters.localeCopyMode === 'custom' && (
          <Stack spacing="spacingXs" marginTop="spacingM">
            {sourceLocales.length === 0 ? (
              <Text fontColor="gray600">
                Could not load locales. Save custom locale codes after they appear, or switch mode.
              </Text>
            ) : (
              sourceLocales.map((locale) => (
                <Checkbox
                  key={locale.code}
                  isChecked={(parameters.customLocales ?? []).includes(locale.code)}
                  onChange={(event) => toggleCustomLocale(locale.code, event.target.checked)}>
                  {locale.name} ({locale.code})
                  {locale.default ? ' — default' : ''}
                </Checkbox>
              ))
            )}
          </Stack>
        )}
      </Box>

      <Box>
        <Subheading marginBottom="spacingM">Target spaces</Subheading>
        <Paragraph marginBottom="spacingS">
          Optional allowlist used when organization space listing is unavailable from the app
          runtime. Leave empty to attempt org-wide space listing automatically.
        </Paragraph>
        <Stack spacing="spacingS" marginBottom="spacingM">
          {(parameters.allowedTargetSpaceIds ?? []).map((entry) => (
            <Flex key={entry.id} justifyContent="space-between" alignItems="center">
              <Text>
                {entry.name} ({entry.id})
              </Text>
              <Button variant="secondary" size="small" onClick={() => removeAllowlistEntry(entry.id)}>
                Remove
              </Button>
            </Flex>
          ))}
        </Stack>
        <Flex gap="spacingS" alignItems="flex-end">
          <FormControl>
            <FormControl.Label>Space ID</FormControl.Label>
            <TextInput value={newSpaceId} onChange={(event) => setNewSpaceId(event.target.value)} />
          </FormControl>
          <FormControl>
            <FormControl.Label>Display name</FormControl.Label>
            <TextInput value={newSpaceName} onChange={(event) => setNewSpaceName(event.target.value)} />
          </FormControl>
          <Button variant="secondary" onClick={addAllowlistEntry}>
            Add space
          </Button>
        </Flex>
      </Box>

      <Box>
        <Subheading marginBottom="spacingM">Existing content in target</Subheading>
        <FormControl>
          <FormControl.Label>
            When an entry or asset with the same ID already exists in the target space
          </FormControl.Label>
          <Radio.Group
            name="existingResourceBehavior"
            value={parameters.existingResourceBehavior ?? 'overwrite'}
            onChange={(event) =>
              setParameters({
                ...parameters,
                existingResourceBehavior: event.target.value as 'overwrite' | 'skip',
              })
            }>
            <Radio value="overwrite">
              Overwrite — update the existing entry or asset with source content
            </Radio>
            <Radio value="skip">Skip — leave existing content unchanged</Radio>
          </Radio.Group>
          <FormControl.HelpText>
            Overwrite merges selected locales into existing entries and preserves other locales.
          </FormControl.HelpText>
        </FormControl>
      </Box>

      <Box>
        <Subheading marginBottom="spacingM">Performance</Subheading>
        <FormControl>
          <FormControl.Label>Max concurrent API requests</FormControl.Label>
          <TextInput
            type="number"
            value={String(parameters.maxConcurrentRequests ?? 5)}
            onChange={(event) =>
              setParameters({
                ...parameters,
                maxConcurrentRequests: Number(event.target.value) || 5,
              })
            }
          />
          <FormControl.HelpText>
            Lower this value if you hit Contentful rate limits during large copies.
          </FormControl.HelpText>
        </FormControl>
      </Box>

      <Box>
        <Subheading marginBottom="spacingM">Notifications</Subheading>
        <FormControl>
          <Switch
            isChecked={parameters.automaticRedirect}
            onChange={(event) =>
              setParameters({ ...parameters, automaticRedirect: event.target.checked })
            }>
            Show delayed completion reminder
          </Switch>
        </FormControl>
      </Box>
      </Flex>
    </Box>
  );
}

export default ConfigScreen;
