import { forbidden } from '@/lib/response';

export function legacyFeatureDisabled(feature: string) {
  return forbidden({
    message: `${feature} is disabled in the Talivia MVP.`,
    code: 'legacy-feature-disabled',
  });
}
