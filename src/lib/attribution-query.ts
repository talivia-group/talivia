const SENSITIVE_QUERY_PARAMS = new Set([
  '_tlv',
  'access_token',
  'auth',
  'authorization',
  'code',
  'id_token',
  'password',
  'refresh_token',
  'secret',
  'session_id',
  'session_state',
  'state',
  'token',
]);

export function getFilteredAttributionQuery(url: URL, ignoredQueryParams: string[] = []) {
  const ignored = new Set([
    ...SENSITIVE_QUERY_PARAMS,
    ...ignoredQueryParams.map(param => param.toLowerCase()),
  ]);
  const params = new URLSearchParams(url.search);

  for (const key of [...params.keys()]) {
    if (ignored.has(key.toLowerCase())) {
      params.delete(key);
    }
  }

  return params.toString();
}
