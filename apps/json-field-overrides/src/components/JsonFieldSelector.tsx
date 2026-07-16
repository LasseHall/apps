import React from 'react';
import { Box, Checkbox, Flex, Paragraph, Subheading, Text } from '@contentful/f36-components';
import { css } from '@emotion/css';
import tokens from '@contentful/f36-tokens';
import {
  ContentTypeLike,
  SelectedFields,
  getJsonObjectFields,
  isFieldSelected,
  toggleFieldSelection,
} from '../lib/configFields';

const styles = {
  contentTypeBlock: css({
    marginBottom: tokens.spacingL,
    paddingBottom: tokens.spacingM,
    borderBottom: `1px solid ${tokens.gray200}`,
  }),
  fieldRow: css({
    marginTop: tokens.spacingXs,
    marginLeft: tokens.spacingS,
  }),
  fieldMeta: css({
    color: tokens.gray600,
    fontSize: tokens.fontSizeS,
    marginLeft: tokens.spacingXs,
  }),
};

type Props = {
  contentTypes: ContentTypeLike[];
  selectedFields: SelectedFields;
  onChange: (next: SelectedFields) => void;
};

const JsonFieldSelector = ({ contentTypes, selectedFields, onChange }: Props) => {
  if (contentTypes.length === 0) {
    return null;
  }

  return (
    <Box>
      {contentTypes.map((contentType) => {
        const fields = getJsonObjectFields(contentType);
        return (
          <Box key={contentType.sys.id} className={styles.contentTypeBlock}>
            <Subheading marginBottom="spacingXs">{contentType.name}</Subheading>
            <Paragraph marginBottom="spacingXs">
              <Text fontColor="gray600" fontSize="fontSizeS">
                Content type ID: {contentType.sys.id}
              </Text>
            </Paragraph>
            {fields.map((field) => {
              const checked = isFieldSelected(selectedFields, contentType.sys.id, field.id);
              return (
                <Flex key={field.id} className={styles.fieldRow} alignItems="center">
                  <Checkbox
                    id={`${contentType.sys.id}.${field.id}`}
                    isChecked={checked}
                    onChange={(e) =>
                      onChange(
                        toggleFieldSelection(
                          selectedFields,
                          contentType.sys.id,
                          field.id,
                          e.target.checked
                        )
                      )
                    }>
                    {field.name}
                  </Checkbox>
                  <span className={styles.fieldMeta}>
                    ({field.id} · JSON Object)
                  </span>
                </Flex>
              );
            })}
          </Box>
        );
      })}
    </Box>
  );
};

export default JsonFieldSelector;
