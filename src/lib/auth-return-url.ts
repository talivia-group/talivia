export function sanitizeAuthReturnUrl(returnUrl?: string | null) {
  if (!returnUrl?.startsWith('/')) {
    return '/app';
  }

  return returnUrl.startsWith('/app') ? returnUrl : '/app';
}
