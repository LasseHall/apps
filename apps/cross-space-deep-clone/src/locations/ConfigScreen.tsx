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
} from '@contentful/f36-components';
import { useSDK } from '@contentful/react-apps-toolkit';
import { AppParameters, TargetSpaceAllowlistEntry } from '@/vite-env';
import { ConfigAppSDK } from '@contentful/app-sdk';
import { styles } from './ConfigScreen.styles';
import ContentTypeMultiSelect, { ContentType } from '../components/ContentTypeMultiSelect';

function ConfigScreen() {
  const [parameters, setParameters] = useState<AppParameters>({
    cloneText: 'Copy',
    cloneTextBefore: true,
    automaticRedirect: false,
    maxConcurrentRequests: 5,
    existingResourceBehavior: 'overwrite',
    allowedTargetSpaceIds: [],
  });
  const [selectedContentTypes, setSelectedContentTypes] = useState<ContentType[]>([]);
  const [newSpaceId, setNewSpaceId] = useState('');
  const [newSpaceName, setNewSpaceName] = useState('');
  const sdk = useSDK<ConfigAppSDK>();

  useEffect(() => {
    (async () => {
      const currentParameters = (await sdk.app.getParameters()) as AppParameters | null;
      if (currentParameters) {
        setParameters({ ...parameters, ...currentParameters });
      }
      sdk.app.setReady();
    })();
  }, [sdk]);

  const onConfigure = useCallback(async () => {
    if (!parameters.cloneText?.trim()) {
      sdk.notifier.error('The app configuration was not saved. Please provide clone text.');
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
      parameters,
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
      allowedTargetSpaceIds: (parameters.allowedTargetSpaceIds ?? []).filter((entry) => entry.id !== spaceId),
    });
  };

  return (
    <Flex flexDirection="column" gap="spacing2Xl">
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
          <FormControl.Label className={styles.textInputLabel}>Clone text</FormControl.Label>
          <TextInput
            value={parameters.cloneText}
            onChange={(event) => setParameters({ ...parameters, cloneText: event.target.value })}
          />
          <FormControl.HelpText>
            This text is added before or after the copied entry title in the target space.
          </FormControl.HelpText>
        </FormControl>
        <FormControl marginTop="spacingM">
          <FormControl.Label className={styles.textInputLabel}>
            Display clone text before or after the copied entry name?
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
            Overwrite is recommended while testing repeated copies with stable IDs.
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
  );
}

export default ConfigScreen;
