import { Form, FormButtons, FormField, FormSubmitButton, TextField } from '@talivia/react-zen';
import type { ReactNode } from 'react';
import { useMessages, useUpdateQuery, useWebsite } from '@/components/hooks';
import { DOMAIN_REGEX } from '@/lib/constants';
import { normalizeWebsiteDomainInput } from '@/lib/website-domain';

export function WebsiteEditForm({
  websiteId,
  onSave,
  showId = true,
  showName = true,
  submitLabel,
}: {
  websiteId: string;
  onSave?: () => void;
  showId?: boolean;
  showName?: boolean;
  submitLabel?: ReactNode;
}) {
  const website = useWebsite();
  const { t, labels, messages, getErrorMessage } = useMessages();
  const { mutateAsync, error, touch, toast } = useUpdateQuery(`/websites/${websiteId}`);

  const handleSubmit = async (data: any) => {
    await mutateAsync(
      {
        name: data.name,
        domain: normalizeWebsiteDomainInput(data.domain),
      },
      {
        onSuccess: async () => {
          toast(t(messages.saved));
          touch('websites');
          touch(`website:${website.id}`);
          onSave?.();
        },
      },
    );
  };

  return (
    <Form onSubmit={handleSubmit} error={getErrorMessage(error)} values={website}>
      {showId && (
        <FormField name="id" label={t(labels.websiteId)}>
          <TextField data-test="text-field-websiteId" value={website?.id} isReadOnly allowCopy />
        </FormField>
      )}
      {showName && (
        <FormField label={`${t(labels.name)} (optional)`} data-test="input-name" name="name">
          <TextField />
        </FormField>
      )}
      <FormField
        label={t(labels.domain)}
        data-test="input-domain"
        name="domain"
        rules={{
          required: t(labels.required),
          pattern: {
            value: DOMAIN_REGEX,
            message: t(messages.invalidDomain),
          },
        }}
      >
        <TextField />
      </FormField>
      <FormButtons>
        <FormSubmitButton data-test="button-submit" variant="primary">
          {submitLabel || t(labels.save)}
        </FormSubmitButton>
      </FormButtons>
    </Form>
  );
}
