'use client';

import { Form, FormButtons, FormField, FormSubmitButton, TextField } from '@talivia/react-zen';
import { useState } from 'react';
import { useMessages, useUpdateQuery } from '@/components/hooks';

const CURRENT_PASSWORD_RULES = {
  required: 'Required',
  maxLength: {
    value: 72,
    message: 'Password must be at most 72 characters.',
  },
};

const NEW_PASSWORD_RULES = {
  required: 'Required',
  minLength: {
    value: 8,
    message: 'Password must be at least 8 characters.',
  },
  maxLength: {
    value: 72,
    message: 'Password must be at most 72 characters.',
  },
};

export function PasswordChangeForm() {
  const [formError, setFormError] = useState<string>();
  const { getErrorMessage, messages, t } = useMessages();
  const { mutateAsync, error, isPending, toast } = useUpdateQuery('/me/password');

  const handleSubmit = async (data: {
    currentPassword: string;
    newPassword: string;
    confirmPassword: string;
  }) => {
    setFormError(undefined);

    if (data.newPassword !== data.confirmPassword) {
      setFormError('New passwords do not match.');
      return;
    }

    await mutateAsync({
      currentPassword: data.currentPassword,
      newPassword: data.newPassword,
    });
    toast(t(messages.saved));
  };

  return (
    <Form onSubmit={handleSubmit} error={formError || getErrorMessage(error)}>
      <FormField name="currentPassword" rules={CURRENT_PASSWORD_RULES}>
        <TextField
          aria-label="Current password"
          autoComplete="current-password"
          placeholder="Current password"
          type="password"
        />
      </FormField>
      <FormField name="newPassword" rules={NEW_PASSWORD_RULES}>
        <TextField
          aria-label="New password"
          autoComplete="new-password"
          placeholder="New password"
          type="password"
        />
      </FormField>
      <FormField name="confirmPassword" rules={NEW_PASSWORD_RULES}>
        <TextField
          aria-label="Confirm new password"
          autoComplete="new-password"
          placeholder="Confirm new password"
          type="password"
        />
      </FormField>
      <FormButtons>
        <FormSubmitButton variant="primary" isDisabled={isPending}>
          Change password
        </FormSubmitButton>
      </FormButtons>
    </Form>
  );
}
