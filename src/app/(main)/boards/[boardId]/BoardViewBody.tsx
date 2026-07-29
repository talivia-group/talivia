import { Column } from '@talivia/react-zen';
import { useBoard } from '@/components/hooks/context/useBoard';
import { BoardViewRow } from './BoardViewRow';

export function BoardViewBody({ showEntityBadges = true }: { showEntityBadges?: boolean }) {
  const { board } = useBoard();
  const rows = board?.parameters?.rows ?? [];

  return (
    <Column gap="3">
      {rows.map(row => (
        <BoardViewRow key={row.id} columns={row.columns} showEntityBadges={showEntityBadges} />
      ))}
    </Column>
  );
}
