'use client';
import { Text } from '@talivia/react-zen';

export function TextBlock({ text }: { text?: string }) {
  if (!text) {
    return null;
  }

  return <Text style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{text}</Text>;
}
