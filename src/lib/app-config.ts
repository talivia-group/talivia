export const APP_SECRET_CONFIGURATION_ERROR_CODE = 'app-secret-invalid';
export const APP_SECRET_CONFIGURATION_ERROR_MESSAGE =
  'Talivia setup is incomplete: set APP_SECRET in .env to a random value of at least 32 bytes, then restart Talivia.';

export class AppConfigurationError extends Error {
  code = APP_SECRET_CONFIGURATION_ERROR_CODE;

  constructor() {
    super(APP_SECRET_CONFIGURATION_ERROR_MESSAGE);
    this.name = 'AppConfigurationError';
  }
}

export function isAppConfigurationError(error: unknown): error is AppConfigurationError {
  return (
    error instanceof AppConfigurationError ||
    (error instanceof Error &&
      (error as AppConfigurationError).code === APP_SECRET_CONFIGURATION_ERROR_CODE)
  );
}
