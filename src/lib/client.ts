import { getItem, removeItem, setItem } from '@/lib/storage';
import { AUTH_TOKEN } from './constants';

export function getClientAuthToken() {
  const token = getItem(AUTH_TOKEN);

  if (token) {
    return token;
  }

  return undefined;
}

export function setClientAuthToken(token: string) {
  setItem(AUTH_TOKEN, token);
}

export function removeClientAuthToken() {
  removeItem(AUTH_TOKEN);
}
