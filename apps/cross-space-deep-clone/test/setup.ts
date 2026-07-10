import '@testing-library/jest-dom';
import { configure } from '@testing-library/react';

configure({
  testIdAttribute: 'data-test-id',
} as Parameters<typeof configure>[0]);
