import { isNotFoundError } from './cmaErrors';

export type ExistingResourceBehavior = 'overwrite' | 'skip';

export async function getIfExists<T>(load: () => Promise<T>): Promise<T | null> {
  try {
    return await load();
  } catch (error) {
    if (isNotFoundError(error)) {
      return null;
    }
    throw error;
  }
}
