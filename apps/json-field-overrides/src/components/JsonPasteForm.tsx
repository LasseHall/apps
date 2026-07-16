import React, { useMemo, useState } from 'react';
import {
  Button,
  ButtonGroup,
  Flex,
  FormControl,
  Note,
  Paragraph,
  Textarea,
} from '@contentful/f36-components';
import { isJsonObjectRoot, JsonObject } from '../lib/envelope';

type Props = {
  initialText?: string;
  onSave: (source: JsonObject, resetOverrides: boolean) => void;
  onCancel: () => void;
  /** When true, show keep vs reset actions (field already has data). */
  showOverrideChoices: boolean;
};

function tryParseObject(text: string): { ok: true; value: JsonObject } | { ok: false; error: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, error: 'Invalid JSON. Fix the syntax and try again.' };
  }

  if (!isJsonObjectRoot(parsed)) {
    return { ok: false, error: 'Root value must be a JSON object (not an array or primitive).' };
  }

  return { ok: true, value: parsed };
}

const JsonPasteForm = ({ initialText = '', onSave, onCancel, showOverrideChoices }: Props) => {
  const [text, setText] = useState(initialText);
  const validation = useMemo(() => {
    if (!text.trim()) {
      return { ok: false as const, error: 'Paste a JSON object to continue.' };
    }
    return tryParseObject(text);
  }, [text]);

  const save = (resetOverrides: boolean) => {
    if (!validation.ok) {
      return;
    }
    onSave(validation.value, resetOverrides);
  };

  return (
    <Flex flexDirection="column" gap="spacingM" padding="spacingM">
      <Paragraph>
        Paste JSON that simulates data from a third-party system. It is stored as the immutable{' '}
        <code>source</code> in the field envelope.
      </Paragraph>

      <FormControl isInvalid={!validation.ok && text.trim().length > 0}>
        <FormControl.Label>JSON source</FormControl.Label>
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={18}
          placeholder={'{\n  "id": "123",\n  "title": "Example"\n}'}
        />
        {!validation.ok && text.trim().length > 0 ? (
          <FormControl.ValidationMessage>{validation.error}</FormControl.ValidationMessage>
        ) : (
          <FormControl.HelpText>Root must be an object. Arrays are supported as values.</FormControl.HelpText>
        )}
      </FormControl>

      {showOverrideChoices && (
        <Note variant="neutral">
          Saving keeps existing overrides by default (orphan paths are pruned). Use “Save &amp; reset
          overrides” to discard them.
        </Note>
      )}

      <Flex justifyContent="space-between" alignItems="center" gap="spacingS">
        <Button variant="transparent" onClick={onCancel}>
          Cancel
        </Button>
        {showOverrideChoices ? (
          <ButtonGroup>
            <Button variant="secondary" isDisabled={!validation.ok} onClick={() => save(true)}>
              Save &amp; reset overrides
            </Button>
            <Button variant="primary" isDisabled={!validation.ok} onClick={() => save(false)}>
              Save (keep overrides)
            </Button>
          </ButtonGroup>
        ) : (
          <Button variant="primary" isDisabled={!validation.ok} onClick={() => save(true)}>
            Save
          </Button>
        )}
      </Flex>
    </Flex>
  );
};

export default JsonPasteForm;
