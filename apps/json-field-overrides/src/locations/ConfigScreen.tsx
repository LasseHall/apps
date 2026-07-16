import React, { useCallback, useEffect, useState } from 'react';
import { ConfigAppSDK } from '@contentful/app-sdk';
import {
  Box,
  Flex,
  Form,
  FormControl,
  Heading,
  Note,
  Paragraph,
  Spinner,
} from '@contentful/f36-components';
import { useSDK } from '@contentful/react-apps-toolkit';
import { css } from '@emotion/css';
import tokens from '@contentful/f36-tokens';
import JsonFieldSelector from '../components/JsonFieldSelector';
import {
  ContentTypeLike,
  SelectedFields,
  contentTypesWithJsonFields,
  processContentTypesToFields,
  restoreSelectedFields,
  selectedFieldsToTargetState,
} from '../lib/configFields';

const styles = {
  container: css({
    margin: tokens.spacing2Xl,
    maxWidth: '852px',
    width: '100%',
  }),
  warningNote: css({
    marginTop: tokens.spacingL,
  }),
};

const ConfigScreen = () => {
  const sdk = useSDK<ConfigAppSDK>();
  const [contentTypes, setContentTypes] = useState<ContentTypeLike[]>([]);
  const [selectedFields, setSelectedFields] = useState<SelectedFields>({});
  const [isLoading, setIsLoading] = useState(true);

  const fetchAllContentTypes = async (): Promise<ContentTypeLike[]> => {
    const allContentTypes: ContentTypeLike[] = [];
    let skip = 0;
    const limit = 100;
    let fetched = 0;

    do {
      const response = await sdk.cma.contentType.getMany({
        spaceId: sdk.ids.space,
        environmentId: sdk.ids.environment,
        query: { skip, limit },
      });
      const items = response.items as ContentTypeLike[];
      allContentTypes.push(...items);
      fetched = items.length;
      skip += limit;
    } while (fetched === limit);

    return allContentTypes;
  };

  const loadFieldsAndRestoreState = async () => {
    try {
      setIsLoading(true);
      const allContentTypes = await fetchAllContentTypes();
      const compatible = contentTypesWithJsonFields(allContentTypes);
      const fields = processContentTypesToFields(compatible);
      const currentState = (await sdk.app.getCurrentState()) || { EditorInterface: {} };
      const restored = restoreSelectedFields(fields, currentState);

      setContentTypes(compatible);
      setSelectedFields(restored);
    } catch (error) {
      console.error('Error loading content types:', error);
      sdk.notifier.error('Could not load content types. Check app permissions and try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const onConfigure = useCallback(async () => {
    return {
      parameters: {},
      targetState: selectedFieldsToTargetState(contentTypes, selectedFields),
    };
  }, [contentTypes, selectedFields]);

  useEffect(() => {
    sdk.app.onConfigure(() => onConfigure());
  }, [sdk, onConfigure]);

  useEffect(() => {
    (async () => {
      await loadFieldsAndRestoreState();
      sdk.app.setReady();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sdk]);

  if (isLoading) {
    return (
      <Flex justifyContent="center" alignItems="center" padding="spacing2Xl">
        <Spinner />
        <Paragraph marginLeft="spacingM" marginBottom="none">
          Loading content types…
        </Paragraph>
      </Flex>
    );
  }

  return (
    <Flex justifyContent="center">
      <Box className={styles.container}>
        <Form>
          <Heading>JSON Field Overrides</Heading>
          <Paragraph>
            Simulate a third-party referencing integration on JSON Object fields. Editors paste
            source JSON in a dialog, then override or remove keys while the original source is
            preserved in the field envelope.
          </Paragraph>

          <Heading as="h3" marginTop="spacingXl" marginBottom="spacingXs">
            Assign to JSON Object fields
          </Heading>
          <Paragraph marginBottom="spacingL">
            Select the content types and JSON Object fields where this app should appear. You can
            change this later here or under each field’s Appearance settings.
          </Paragraph>

          <FormControl id="jsonObjectFields">
            <FormControl.Label>Content types &amp; JSON Object fields</FormControl.Label>
            {contentTypes.length === 0 ? (
              <Note variant="warning" className={styles.warningNote}>
                No JSON Object fields found in this environment. Add a JSON Object field to a
                content type, then return here to assign the app.
              </Note>
            ) : (
              <JsonFieldSelector
                contentTypes={contentTypes}
                selectedFields={selectedFields}
                onChange={setSelectedFields}
              />
            )}
          </FormControl>

          <Note variant="neutral" title="Field value shape">
            Assigned fields store an envelope of <code>source</code>, <code>overrides</code>, and{' '}
            <code>effective</code> JSON.
          </Note>
        </Form>
      </Box>
    </Flex>
  );
};

export default ConfigScreen;
