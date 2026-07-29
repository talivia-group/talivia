'use client';

import {
  Button,
  Column,
  DataColumn,
  DataTable,
  Form,
  FormButtons,
  FormField,
  FormSubmitButton,
  Heading,
  Icon,
  ListItem,
  Row,
  Select,
  type SelectProps,
  Text,
  TextField,
} from '@talivia/react-zen';
import { DataGrid } from '@/components/common/DataGrid';
import {
  type LocalUser,
  useGridState,
  useMessages,
  useUpdateQuery,
  useUsersQuery,
} from '@/components/hooks';
import { Edit, Plus } from '@/components/icons';
import { DialogButton } from '@/components/input/DialogButton';
import { ROLES } from '@/lib/constants';

const ROLE_LABELS = {
  [ROLES.admin]: 'Admin',
  [ROLES.user]: 'User',
  [ROLES.viewOnly]: 'View only',
} as const;

const USERNAME_RULES = {
  required: 'Required',
  maxLength: {
    value: 255,
    message: 'Username must be at most 255 characters.',
  },
  pattern: {
    value: /^\S+$/,
    message: 'Username cannot contain whitespace.',
  },
};

const PASSWORD_RULES = {
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

function RoleSelect({ buttonProps, ...props }: SelectProps) {
  return (
    <Select
      {...props}
      buttonProps={{
        ...buttonProps,
        style: { minHeight: 40, width: '100%', ...buttonProps?.style },
      }}
    >
      <ListItem id={ROLES.user}>{ROLE_LABELS[ROLES.user]}</ListItem>
      <ListItem id={ROLES.viewOnly}>{ROLE_LABELS[ROLES.viewOnly]}</ListItem>
      <ListItem id={ROLES.admin}>{ROLE_LABELS[ROLES.admin]}</ListItem>
    </Select>
  );
}

function UserCreateForm({ onClose }: { onClose: () => void }) {
  const { getErrorMessage } = useMessages();
  const { mutateAsync, error, isPending, touch, toast } = useUpdateQuery('/users');

  const handleSubmit = async (data: { username: string; password: string; role: string }) => {
    await mutateAsync(data, {
      onSuccess: () => {
        touch('users');
        toast('User created.');
        onClose();
      },
    });
  };

  return (
    <Form
      onSubmit={handleSubmit}
      error={getErrorMessage(error)}
      defaultValues={{ username: '', password: '', role: ROLES.user }}
    >
      <FormField name="username" label="Username" rules={USERNAME_RULES}>
        <TextField autoComplete="username" autoFocus />
      </FormField>
      <FormField name="password" label="Initial password" rules={PASSWORD_RULES}>
        <TextField autoComplete="new-password" type="password" />
      </FormField>
      <FormField name="role" label="Role" rules={{ required: 'Required' }}>
        <RoleSelect />
      </FormField>
      <FormButtons>
        <Button isDisabled={isPending} onPress={onClose}>
          Cancel
        </Button>
        <FormSubmitButton variant="primary" isDisabled={isPending}>
          Create user
        </FormSubmitButton>
      </FormButtons>
    </Form>
  );
}

function UserEditForm({ user, onClose }: { user: LocalUser; onClose: () => void }) {
  const { getErrorMessage } = useMessages();
  const { mutateAsync, error, isPending, touch, toast } = useUpdateQuery(`/users/${user.id}`);

  const handleSubmit = async (data: { username: string; role: string }) => {
    await mutateAsync(data, {
      onSuccess: () => {
        touch('users');
        toast('User updated.');
        onClose();
      },
    });
  };

  return (
    <Form
      onSubmit={handleSubmit}
      error={getErrorMessage(error)}
      defaultValues={{ username: user.username, role: user.role }}
    >
      <FormField name="username" label="Username" rules={USERNAME_RULES}>
        <TextField autoComplete="username" autoFocus />
      </FormField>
      <FormField name="role" label="Role" rules={{ required: 'Required' }}>
        <RoleSelect />
      </FormField>
      <Text color="muted">
        Passwords are never displayed here. Each user changes their own password.
      </Text>
      <FormButtons>
        <Button isDisabled={isPending} onPress={onClose}>
          Cancel
        </Button>
        <FormSubmitButton variant="primary" isDisabled={isPending}>
          Save
        </FormSubmitButton>
      </FormButtons>
    </Form>
  );
}

function UsersTable({ data }: { data: LocalUser[] }) {
  return (
    <DataTable data={data}>
      <DataColumn id="username" label="Username" />
      <DataColumn id="role" label="Role" width="160px">
        {(user: LocalUser) => ROLE_LABELS[user.role]}
      </DataColumn>
      <DataColumn id="createdAt" label="Created" width="160px">
        {(user: LocalUser) =>
          user.createdAt ? new Date(user.createdAt).toLocaleDateString() : '—'
        }
      </DataColumn>
      <DataColumn id="action" align="end" width="80px">
        {(user: LocalUser) => (
          <DialogButton
            icon={
              <Icon>
                <Edit />
              </Icon>
            }
            title={`Edit ${user.username}`}
            variant="quiet"
            width="480px"
          >
            {({ close }) => <UserEditForm user={user} onClose={close} />}
          </DialogButton>
        )}
      </DataColumn>
    </DataTable>
  );
}

export function LocalUsersSettings() {
  const grid = useGridState({ source: 'local' });
  const query = useUsersQuery(grid.query);

  return (
    <Column gap="4">
      <Row alignItems="flex-start" justifyContent="space-between" gap="4" wrap="wrap">
        <Column gap="1">
          <Heading size="lg">Local users</Heading>
          <Text color="muted">Create accounts and control their global access.</Text>
        </Column>
        <DialogButton
          icon={<Plus />}
          label="Add user"
          title="Add local user"
          variant="primary"
          width="480px"
        >
          {({ close }) => <UserCreateForm onClose={close} />}
        </DialogButton>
      </Row>
      <DataGrid query={query} state={grid} allowSearch>
        {({ data }) => <UsersTable data={data} />}
      </DataGrid>
    </Column>
  );
}
