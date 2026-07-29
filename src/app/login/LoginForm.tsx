'use client';

import {
  Column,
  Form,
  FormButtons,
  FormField,
  FormSubmitButton,
  Heading,
  Icon,
  TextField,
} from '@talivia/react-zen';
import { useRouter } from 'next/navigation';
import { useMessages, useUpdateQuery } from '@/components/hooks';
import { Logo } from '@/components/svg';
import { sanitizeAuthReturnUrl } from '@/lib/auth-return-url';
import { setClientAuthToken } from '@/lib/client';

interface LoginFormProps {
  returnUrl?: string;
  initialError?: unknown;
}

export function LoginForm({ returnUrl, initialError }: LoginFormProps) {
  const router = useRouter();
  const { labels, t, getErrorMessage } = useMessages();
  const { mutateAsync, error: submitError, isPending } = useUpdateQuery('/auth/login');

  const handleSubmit = async (data: { username: string; password: string }) => {
    const safeReturnUrl = sanitizeAuthReturnUrl(returnUrl || '/app');
    let result;

    try {
      result = await mutateAsync(data);
    } catch {
      // React Query exposes the API error through `submitError`, which the form
      // renders below. Consume the rejected mutation to avoid a browser-level
      // unhandledRejection overlay.
      return;
    }

    setClientAuthToken(result.token);
    router.push(safeReturnUrl);
  };

  return (
    <Column className="talivia-auth-form" justifyContent="center" alignItems="center" gap="5">
      <Icon size="lg">
        <Logo />
      </Icon>
      <Heading>Talivia</Heading>
      <Form
        className="talivia-auth-email-form"
        onSubmit={handleSubmit}
        error={getErrorMessage(submitError || initialError)}
      >
        <FormField name="username" rules={{ required: t(labels.required) }}>
          <TextField aria-label="Username" autoComplete="username" placeholder="Username" />
        </FormField>
        <FormField name="password" rules={{ required: t(labels.required) }}>
          <TextField
            aria-label="Password"
            autoComplete="current-password"
            placeholder="Password"
            type="password"
          />
        </FormField>
        <FormButtons>
          <FormSubmitButton
            data-test="button-submit"
            variant="primary"
            style={{ flex: 1 }}
            isDisabled={isPending}
          >
            Sign in
          </FormSubmitButton>
        </FormButtons>
      </Form>
    </Column>
  );
}
