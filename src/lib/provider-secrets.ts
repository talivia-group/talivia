import { decrypt, encrypt, secret } from './crypto';

const ENCRYPTED_PROVIDER_SECRET_PREFIX = 'enc:';

export function encryptProviderSecret(value: string) {
  return `${ENCRYPTED_PROVIDER_SECRET_PREFIX}${encrypt(value, secret())}`;
}

export function decryptProviderSecret(value?: string | null) {
  if (!value) {
    return null;
  }

  if (!value.startsWith(ENCRYPTED_PROVIDER_SECRET_PREFIX)) {
    return value;
  }

  return decrypt(value.slice(ENCRYPTED_PROVIDER_SECRET_PREFIX.length), secret());
}
