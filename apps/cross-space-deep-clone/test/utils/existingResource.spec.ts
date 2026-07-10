import { describe, expect, it, vi } from 'vitest';
import { getIfExists } from '../../src/utils/existingResource';
import { isNotFoundError } from '../../src/utils/cmaErrors';

describe('existingResource', () => {
  it('returns null for not found errors', async () => {
    const result = await getIfExists(async () => {
      throw { code: 'a', message: 'The resource could not be found.' };
    });

    expect(result).toBeNull();
  });

  it('returns null for classic CMA not found errors', async () => {
    const result = await getIfExists(async () => {
      throw { status: 404, name: 'NotFound', message: 'Not found' };
    });

    expect(result).toBeNull();
    expect(isNotFoundError({ status: 404, name: 'NotFound' })).toBe(true);
  });

  it('rethrows non-not-found errors', async () => {
    await expect(
      getIfExists(async () => {
        throw { status: 500, name: 'ServerError', message: 'Boom' };
      })
    ).rejects.toMatchObject({ status: 500 });
  });

  it('returns the loaded resource when present', async () => {
    const result = await getIfExists(async () => ({ id: 'entry-1' }));
    expect(result).toEqual({ id: 'entry-1' });
  });
});
