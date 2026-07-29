import { legacyFeatureDisabled } from '@/lib/legacy-features';

export async function POST() {
  return legacyFeatureDisabled('Share');
}

