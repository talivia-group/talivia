import {
  Column,
  DataColumn,
  DataTable,
  Form,
  FormField,
  FormSubmitButton,
  Heading,
  ListItem,
  Row,
  Select,
  Text,
  TextField,
  useToast,
} from '@talivia/react-zen';
import { LoadingPanel } from '@/components/common/LoadingPanel';
import { ConfirmationForm } from '@/components/common/ConfirmationForm';
import {
  type WebsiteMemberRow,
  useDeleteQuery,
  useMessages,
  useModified,
  useUpdateQuery,
  useWebsite,
  useWebsiteMembersQuery,
} from '@/components/hooks';
import { Trash } from '@/components/icons';
import { DialogButton } from '@/components/input/DialogButton';
import { WEBSITE_MEMBER_ROLES } from '@/lib/constants';

type WebsiteAccess = {
  access?: {
    canManageMembers?: boolean;
  };
};

type TeamRow =
  | {
      id: string;
      username: string;
      role: 'owner';
      user?: { username: string } | null;
      invitedBy?: null;
      isOwner: true;
    }
  | (WebsiteMemberRow & { isOwner?: false });

const ROLE_LABELS = {
  owner: 'Owner',
  [WEBSITE_MEMBER_ROLES.viewer]: 'Viewer',
  [WEBSITE_MEMBER_ROLES.member]: 'Member',
} as const;

function isMemberRow(row: TeamRow): row is WebsiteMemberRow & { isOwner: false } {
  return !row.isOwner;
}

function WebsiteMemberRoleSelect({
  member,
  websiteId,
}: {
  member: WebsiteMemberRow;
  websiteId: string;
}) {
  const { mutateAsync, isPending } = useUpdateQuery(`/websites/${websiteId}/members/${member.id}`);
  const { touch } = useModified();
  const { toast } = useToast();

  const handleChange = async (role: string) => {
    if (!role || role === member.role) {
      return;
    }

    await mutateAsync(
      { role },
      {
        onSuccess: () => {
          touch('website-members');
          toast('Role updated.');
        },
      },
    );
  };

  return (
    <Select
      selectedKey={member.role}
      onSelectionChange={key => handleChange(String(key))}
      isDisabled={isPending}
      buttonProps={{ style: { minHeight: 34, width: 132 } }}
    >
      <ListItem id={WEBSITE_MEMBER_ROLES.viewer}>{ROLE_LABELS.viewer}</ListItem>
      <ListItem id={WEBSITE_MEMBER_ROLES.member}>{ROLE_LABELS.member}</ListItem>
    </Select>
  );
}

function WebsiteMemberRemoveButton({
  member,
  websiteId,
}: {
  member: WebsiteMemberRow;
  websiteId: string;
}) {
  const { t, labels } = useMessages();
  const { mutateAsync, isPending, error } = useDeleteQuery(
    `/websites/${websiteId}/members/${member.id}`,
  );
  const { touch } = useModified();

  const handleConfirm = async (close: () => void) => {
    await mutateAsync(null, {
      onSuccess: () => {
        touch('website-members');
        close();
      },
    });
  };

  return (
    <DialogButton icon={<Trash />} title={t(labels.confirm)} variant="quiet" width="400px">
      {({ close }) => (
        <ConfirmationForm
          message={`Remove ${member.username}?`}
          isLoading={isPending}
          error={error}
          onConfirm={handleConfirm.bind(null, close)}
          onClose={close}
          buttonLabel="Remove"
          buttonVariant="danger"
        />
      )}
    </DialogButton>
  );
}

function WebsiteTeamTable({
  rows,
  websiteId,
  canManageMembers,
}: {
  rows: TeamRow[];
  websiteId: string;
  canManageMembers: boolean;
}) {
  return (
    <DataTable data={rows}>
      <DataColumn id="username" label="Username">
        {(row: TeamRow) => row.user?.username || row.username}
      </DataColumn>
      <DataColumn id="role" label="Role" width="160px">
        {(row: TeamRow) => {
          if (!isMemberRow(row) || !canManageMembers) {
            return ROLE_LABELS[row.role];
          }

          return <WebsiteMemberRoleSelect member={row} websiteId={websiteId} />;
        }}
      </DataColumn>
      <DataColumn id="status" label="Status" width="120px">
        {(row: TeamRow) => (!isMemberRow(row) || row.userId ? 'Active' : 'Pending')}
      </DataColumn>
      {canManageMembers && (
        <DataColumn id="action" align="end" width="80px">
          {(row: TeamRow) => {
            if (!isMemberRow(row)) {
              return null;
            }

            return <WebsiteMemberRemoveButton member={row} websiteId={websiteId} />;
          }}
        </DataColumn>
      )}
    </DataTable>
  );
}

export function WebsiteTeamSettings({ websiteId }: { websiteId: string }) {
  const website = useWebsite() as ReturnType<typeof useWebsite> & WebsiteAccess;
  const canManageMembers = !!website?.access?.canManageMembers;
  const { data, isLoading, isFetching, error } = useWebsiteMembersQuery(websiteId);
  const { mutateAsync, error: inviteError, isPending, touch, toast } = useUpdateQuery(
    `/websites/${websiteId}/members`,
  );
  const { t, labels, getErrorMessage } = useMessages();
  const owner = data?.owner;
  const rows: TeamRow[] = [
    ...(owner
      ? [
          {
            id: owner.id,
            username: owner.username,
            role: owner.role,
            isOwner: true as const,
          },
        ]
      : []),
    ...((data?.data || []) as WebsiteMemberRow[]).map(row => ({
      ...row,
      isOwner: false as const,
    })),
  ];

  const handleInvite = async (values: { username: string; role: string }) => {
    await mutateAsync(values, {
      onSuccess: () => {
        touch('website-members');
        toast('Invite saved.');
      },
    });
  };

  return (
    <Column gap="5">
      <Row justifyContent="space-between" alignItems="flex-start" gap="4" wrap="wrap">
        <Heading size="lg">Team</Heading>
      </Row>

      {canManageMembers && (
        <Form
          onSubmit={handleInvite}
          error={getErrorMessage(inviteError)}
          defaultValues={{ username: '', role: WEBSITE_MEMBER_ROLES.viewer }}
        >
          <Row gap="3" alignItems="end" wrap="wrap">
            <FormField name="username" label="Username" rules={{ required: t(labels.required) }}>
              <TextField autoComplete="username" />
            </FormField>
            <FormField name="role" label="Role" rules={{ required: t(labels.required) }}>
              <Select buttonProps={{ style: { minHeight: 40, width: 140 } }}>
                <ListItem id={WEBSITE_MEMBER_ROLES.viewer}>{ROLE_LABELS.viewer}</ListItem>
                <ListItem id={WEBSITE_MEMBER_ROLES.member}>{ROLE_LABELS.member}</ListItem>
              </Select>
            </FormField>
            <FormSubmitButton variant="primary" isDisabled={isPending}>
              Add user
            </FormSubmitButton>
          </Row>
        </Form>
      )}

      <LoadingPanel
        data={data}
        isLoading={isLoading}
        isFetching={isFetching}
        error={error}
        minHeight="120px"
      >
        {rows.length > 0 ? (
          <WebsiteTeamTable
            rows={rows}
            websiteId={websiteId}
            canManageMembers={canManageMembers}
          />
        ) : (
          <Text color="muted">No team members yet.</Text>
        )}
      </LoadingPanel>
    </Column>
  );
}
