import { describe, expect, it } from 'vitest';
import { formatContentTypeCheckFailure, isNotFoundError, parseCmaError } from '../../src/utils/cmaErrors';

describe('cmaErrors', () => {
  it('treats Contentful app adapter not-found code "a" as not found', () => {
    const error = {
      code: 'a',
      message: 'The resource could not be found.',
    };

    expect(isNotFoundError(error)).toBe(true);
    expect(parseCmaError(error).likelyCause).toBe('not_found');
  });

  it('describes access denied as a cross-space scoping issue', () => {
    const message = formatContentTypeCheckFailure('landingPage', 'target123', 'master', {
      status: 403,
      name: 'AccessDenied',
      message: 'Forbidden',
    });

    expect(message).toContain('cross-space API access is blocked');
    expect(message).not.toContain('missing content types');
  });

  it('describes not found with environment hint', () => {
    const message = formatContentTypeCheckFailure('landingPage', 'target123', 'master', {
      status: 404,
      name: 'NotFound',
      message: 'The resource could not be found.',
    });

    expect(message).toContain('was not found');
    expect(message).toContain('master');
  });
});
