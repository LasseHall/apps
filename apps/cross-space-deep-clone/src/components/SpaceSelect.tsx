import { FormControl, Select } from '@contentful/f36-components';
import { SpaceOption } from '@/vite-env';

type SpaceSelectProps = {
  spaces: SpaceOption[];
  selectedSpaceId: string;
  onChange: (spaceId: string) => void;
};

function SpaceSelect({ spaces, selectedSpaceId, onChange }: SpaceSelectProps) {
  if (spaces.length === 0) {
    return (
      <FormControl>
        <FormControl.Label>Target space</FormControl.Label>
        <FormControl.HelpText>
          No target spaces are available. Configure an allowlist in the app settings or ensure your
          user can list organization spaces.
        </FormControl.HelpText>
      </FormControl>
    );
  }

  return (
    <FormControl>
      <FormControl.Label>Target space</FormControl.Label>
      <Select value={selectedSpaceId} onChange={(event) => onChange(event.target.value)}>
        <Select.Option value="" isDisabled>
          Select a space
        </Select.Option>
        {spaces.map((space) => (
          <Select.Option key={space.id} value={space.id}>
            {space.name} ({space.id})
          </Select.Option>
        ))}
      </Select>
      <FormControl.HelpText>Copies will be created in the target space master environment.</FormControl.HelpText>
    </FormControl>
  );
}

export default SpaceSelect;
