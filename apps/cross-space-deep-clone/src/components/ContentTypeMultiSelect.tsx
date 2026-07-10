import React, { useEffect, useState } from 'react';
import { Box, Stack, Pill } from '@contentful/f36-components';
import { Multiselect } from '@contentful/f36-multiselect';
import { ContentTypeProps } from 'contentful-management';
import { CMAClient, ConfigAppSDK } from '@contentful/app-sdk';

export interface ContentType {
  id: string;
  name: string;
}

interface ContentTypeMultiSelectProps {
  selectedContentTypes: ContentType[];
  setSelectedContentTypes: (contentTypes: ContentType[]) => void;
  sdk: ConfigAppSDK;
  cma: CMAClient;
}

const ContentTypeMultiSelect: React.FC<ContentTypeMultiSelectProps> = ({
  selectedContentTypes,
  setSelectedContentTypes,
  sdk,
  cma,
}) => {
  const [availableContentTypes, setAvailableContentTypes] = useState<ContentType[]>([]);
  const [filteredItems, setFilteredItems] = useState<ContentType[]>([]);

  const handleSearchValueChange = (event: { target: { value: string } }) => {
    const value = event.target.value;
    const newFilteredItems = availableContentTypes.filter((contentType) =>
      contentType.name.toLowerCase().includes(value.toLowerCase())
    );
    setFilteredItems(newFilteredItems);
  };

  const fetchAllContentTypes = async (): Promise<ContentTypeProps[]> => {
    let allContentTypes: ContentTypeProps[] = [];
    let skip = 0;
    const limit = 1000;
    let areMoreContentTypes = true;

    while (areMoreContentTypes) {
      const response = await cma.contentType.getMany({
        query: { skip, limit },
      });
      if (response.items) {
        allContentTypes = allContentTypes.concat(response.items as ContentTypeProps[]);
        areMoreContentTypes = response.items.length === limit;
      } else {
        areMoreContentTypes = false;
      }
      skip += limit;
    }

    return allContentTypes;
  };

  useEffect(() => {
    (async () => {
      const currentState = await sdk.app.getCurrentState();
      const currentContentTypesIds = Object.keys(currentState?.EditorInterface || {});

      const allContentTypes = await fetchAllContentTypes();

      const newAvailableContentTypes = allContentTypes
        .map((ct) => ({
          id: ct.sys.id,
          name: ct.name,
        }))
        .sort((a, b) => a.name.localeCompare(b.name));

      setAvailableContentTypes(newAvailableContentTypes);
      setFilteredItems(newAvailableContentTypes);

      if (currentContentTypesIds.length > 0) {
        const currentContentTypes = allContentTypes
          .filter((ct) => currentContentTypesIds.includes(ct.sys.id))
          .map((ct) => ({ id: ct.sys.id, name: ct.name }));
        setSelectedContentTypes(currentContentTypes);
      }
    })();
  }, []);

  return (
    <>
      <Multiselect
        currentSelection={selectedContentTypes.map((contentType) => contentType.name)}
        popoverProps={{ isFullWidth: true }}
        onSearchValueChange={handleSearchValueChange}>
        {filteredItems.map((item) => (
          <Multiselect.Option
            key={item.id}
            value={item.id}
            itemId={item.id}
            isChecked={selectedContentTypes.some((ct) => ct.id === item.id)}
            onSelectItem={(event: React.ChangeEvent<HTMLInputElement>) => {
              const checked = event.target.checked;
              if (checked) {
                setSelectedContentTypes([...selectedContentTypes, item]);
              } else {
                setSelectedContentTypes(selectedContentTypes.filter((ct) => ct.id !== item.id));
              }
            }}>
            {item.name}
          </Multiselect.Option>
        ))}
      </Multiselect>

      {selectedContentTypes.length > 0 && (
        <Box marginTop="spacingS">
          <Stack flexDirection="row" flexWrap="wrap" spacing="spacingXs">
            {selectedContentTypes.map((contentType) => (
              <Pill
                key={contentType.id}
                label={contentType.name}
                onClose={() =>
                  setSelectedContentTypes(selectedContentTypes.filter((ct) => ct.id !== contentType.id))
                }
              />
            ))}
          </Stack>
        </Box>
      )}
    </>
  );
};

export default ContentTypeMultiSelect;
