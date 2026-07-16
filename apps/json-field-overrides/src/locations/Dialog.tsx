import React, { useCallback, useEffect } from 'react';
import { DialogAppSDK } from '@contentful/app-sdk';
import { useSDK } from '@contentful/react-apps-toolkit';
import JsonPasteForm from '../components/JsonPasteForm';
import { JsonObject } from '../lib/envelope';
import { DialogInvocationParameters, DialogResult } from '../types';

const Dialog = () => {
  const sdk = useSDK<DialogAppSDK>();
  const invocation = (sdk.parameters.invocation || {}) as DialogInvocationParameters;
  const hasExistingSource = Boolean(invocation.currentSourceJson);

  useEffect(() => {
    sdk.window.startAutoResizer();
  }, [sdk]);

  const closeWithResult = useCallback(
    (source: JsonObject, resetOverrides: boolean) => {
      const result: DialogResult = { source, resetOverrides };
      sdk.close(result);
    },
    [sdk]
  );

  return (
    <JsonPasteForm
      initialText={invocation.currentSourceJson || ''}
      showOverrideChoices={hasExistingSource}
      onSave={closeWithResult}
      onCancel={() => sdk.close()}
    />
  );
};

export default Dialog;
