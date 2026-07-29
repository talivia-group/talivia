const SENSITIVE_KEY_PATTERN =
  /\b(api[_-]?key|authorization|bearer|client[_-]?secret|credential|password|secret|signature|token|webhook[_-]?secret)\b/gi;
const SECRET_ASSIGNMENT_PATTERN =
  /\b(api[_-]?key|authorization|bearer|client[_-]?secret|credential|password|secret|signature|token|webhook[_-]?secret)\b\s*[:=]\s*([^\s,;'"})]+)/gi;
const LONG_SECRET_PATTERN = /\b([A-Za-z0-9_-]{24,})\b/g;

export function redactSensitiveValue(value?: unknown) {
  if (value == null) {
    return value;
  }

  return String(value)
    .replace(SECRET_ASSIGNMENT_PATTERN, '$1=[redacted]')
    .replace(SENSITIVE_KEY_PATTERN, '[redacted-key]')
    .replace(LONG_SECRET_PATTERN, token => {
      if (/^[0-9a-f-]{32,}$/i.test(token)) {
        return token;
      }

      return '[redacted]';
    });
}
