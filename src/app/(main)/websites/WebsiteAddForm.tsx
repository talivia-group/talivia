import { Button, Form, FormField, FormSubmitButton, Row, TextField } from '@talivia/react-zen';
import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import { useMessages, useUpdateQuery } from '@/components/hooks';
import { DOMAIN_REGEX } from '@/lib/constants';
import { getItem, removeItem } from '@/lib/storage';
import { normalizeWebsiteDomainInput, PENDING_WEBSITE_DOMAIN } from '@/lib/website-domain';

export function WebsiteAddForm({
  onSave,
  onClose,
  submitLabel,
}: {
  onSave?: (website?: any) => void;
  onClose?: () => void;
  submitLabel?: ReactNode;
}) {
  const { t, labels, messages } = useMessages();
  const { mutateAsync, error, isPending } = useUpdateQuery('/websites');
  const [initialDomain, setInitialDomain] = useState('');

  const handleSubmit = async (data: any) => {
    const website = await mutateAsync({
      ...data,
      domain: normalizeWebsiteDomainInput(data.domain),
    });

    removeItem(PENDING_WEBSITE_DOMAIN);
    onSave?.(website);
    onClose?.();
  };

  useEffect(() => {
    const pendingDomain = getItem(PENDING_WEBSITE_DOMAIN);

    if (typeof pendingDomain === 'string') {
      setInitialDomain(normalizeWebsiteDomainInput(pendingDomain));
    }
  }, []);

  return (
    <Form
      key={initialDomain || 'empty-domain'}
      onSubmit={handleSubmit}
      error={error?.message}
      defaultValues={{ domain: initialDomain }}
    >
      <FormField
        label={t(labels.domain)}
        data-test="input-domain"
        name="domain"
        rules={{
          required: t(labels.required),
          pattern: { value: DOMAIN_REGEX, message: t(messages.invalidDomain) },
        }}
      >
        <TextField autoComplete="off" placeholder="yourwebsite.com" />
      </FormField>
      <Row justifyContent="flex-end" paddingTop="3" gap="3">
        {onClose && (
          <Button isDisabled={isPending} onPress={onClose}>
            {t(labels.cancel)}
          </Button>
        )}
        <FormSubmitButton data-test="button-submit" isDisabled={false}>
          {submitLabel || t(labels.save)}
        </FormSubmitButton>
      </Row>
    </Form>
  );
}
