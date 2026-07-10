export type ParsedCmaError = {
  status?: number;
  name?: string;
  message: string;
  likelyCause: 'not_found' | 'access_denied' | 'wrong_environment' | 'unknown';
};

export function parseCmaError(error: unknown): ParsedCmaError {
  const err = error as {
    status?: number;
    statusCode?: number;
    name?: string;
    code?: string;
    message?: string;
    sys?: { id?: string };
  };

  const status = err.status ?? err.statusCode;
  const name = err.name ?? err.sys?.id;
  const message = err.message ?? (error instanceof Error ? error.message : 'Unknown API error');

  let likelyCause: ParsedCmaError['likelyCause'] = 'unknown';
  if (
    status === 404 ||
    name === 'NotFound' ||
    err.code === 'a' ||
    /could not be found/i.test(message)
  ) {
    likelyCause = 'not_found';
  } else if (status === 403 || status === 401 || name === 'AccessDenied') {
    likelyCause = 'access_denied';
  }

  return {
    ...(status !== undefined ? { status } : {}),
    ...(name !== undefined ? { name } : {}),
    message,
    likelyCause,
  };
}

export function isNotFoundError(error: unknown): boolean {
  return parseCmaError(error).likelyCause === 'not_found';
}

export function formatCopyResourceError(
  resourceType: 'entry' | 'asset',
  resourceId: string,
  phase: 'lookup' | 'create' | 'update',
  error: unknown
): string {
  const parsed = parseCmaError(error);
  const label = resourceType === 'entry' ? 'Entry' : 'Asset';

  if (parsed.likelyCause === 'not_found' && phase === 'lookup') {
    return `${label} "${resourceId}" was not found in target during ${phase}; treated as new.`;
  }

  return `${label} "${resourceId}" failed during ${phase}: ${parsed.message}`;
}

export function formatContentTypeCheckFailure(
  contentTypeId: string,
  targetSpaceId: string,
  environmentId: string,
  error: unknown
): string {
  const parsed = parseCmaError(error);

  if (parsed.likelyCause === 'access_denied') {
    return (
      `Cannot read content type "${contentTypeId}" in target space ${targetSpaceId} (${environmentId}). ` +
      `The app likely cannot access other spaces via cmaAdapter (${parsed.status ?? ''} ${parsed.name ?? ''}: ${parsed.message}). ` +
      `This usually means the content type exists but cross-space API access is blocked — not that it is missing.`
    );
  }

  if (parsed.likelyCause === 'not_found') {
    return (
      `Content type "${contentTypeId}" was not found in target space ${targetSpaceId}, environment "${environmentId}". ` +
      `Confirm the content type ID matches exactly and that this environment is the one you expect (the app always targets "master"). ` +
      `API: ${parsed.message}`
    );
  }

  return (
    `Could not verify content type "${contentTypeId}" in target space ${targetSpaceId} (${environmentId}): ` +
    `${parsed.status ? `HTTP ${parsed.status}` : parsed.name ?? 'Error'} — ${parsed.message}`
  );
}
