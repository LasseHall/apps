import { Paragraph, TextLink, Note, Flex } from '@contentful/f36-components';

const LocalhostWarning = () => {
  return (
    <Flex marginTop="spacing2Xl" justifyContent="center">
      <Note variant="warning" title="Cross-Space Deep Clone">
        <Paragraph>
          Contentful Apps need to run inside the Contentful web app to function properly. Install
          the app into a space and render your app into one of the{' '}
          <TextLink href="https://www.contentful.com/developers/docs/extensibility/app-framework/locations/">
            available locations
          </TextLink>
          .
        </Paragraph>
        <Paragraph marginTop="spacingS">
          Follow{' '}
          <TextLink href="https://www.contentful.com/developers/docs/extensibility/app-framework/tutorial/">
            our guide
          </TextLink>{' '}
          to get started or{' '}
          <TextLink href="https://app.contentful.com/" target="_blank" rel="noopener noreferrer">
            open Contentful
          </TextLink>{' '}
          to manage your app.
        </Paragraph>
      </Note>
    </Flex>
  );
};

export default LocalhostWarning;
