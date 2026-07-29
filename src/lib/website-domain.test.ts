import { describe, expect, test } from 'vitest';
import { getWebsiteNameFromDomain, normalizeWebsiteDomainInput } from './website-domain';

describe('normalizeWebsiteDomainInput', () => {
  test('normalizes plain domains and urls to hostnames', () => {
    expect(normalizeWebsiteDomainInput(' Example.com ')).toBe('example.com');
    expect(normalizeWebsiteDomainInput('https://www.example.com/pricing?ref=talivia')).toBe(
      'www.example.com',
    );
    expect(normalizeWebsiteDomainInput('localhost:3708/app')).toBe('localhost:3708');
  });

  test('uses the normalized domain as the default website name', () => {
    expect(getWebsiteNameFromDomain('https://example.com/docs')).toBe('example.com');
    expect(getWebsiteNameFromDomain('')).toBe('Website');
  });
});
