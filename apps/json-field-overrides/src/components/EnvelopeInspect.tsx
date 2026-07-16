import React from 'react';
import { Box, Subheading, Textarea } from '@contentful/f36-components';
import { FieldEnvelope } from '../lib/envelope';
import { css } from '@emotion/css';
import tokens from '@contentful/f36-tokens';

const mono = css({
  fontFamily: tokens.fontStackMonospace,
  fontSize: tokens.fontSizeS,
});

type Props = {
  envelope: FieldEnvelope;
  tab: 'source' | 'overrides' | 'envelope';
};

const EnvelopeInspect = ({ envelope, tab }: Props) => {
  const value =
    tab === 'source'
      ? envelope.source
      : tab === 'overrides'
        ? envelope.overrides
        : envelope;

  const label =
    tab === 'source' ? 'Source (read-only)' : tab === 'overrides' ? 'Overrides (read-only)' : 'Full envelope (read-only)';

  return (
    <Box>
      <Subheading marginBottom="spacingXs">{label}</Subheading>
      <Textarea className={mono} isReadOnly value={JSON.stringify(value, null, 2)} rows={14} />
    </Box>
  );
};

export default EnvelopeInspect;
