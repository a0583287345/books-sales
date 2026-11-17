import { PO_STATUS_LABELS, PO_STATUS_STYLES, type PoStatus } from '@/lib/purchasing';

export function PoStatusBadge({ status }: { status: PoStatus }) {
  return (
    <span className={`inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${PO_STATUS_STYLES[status]}`}>
      {PO_STATUS_LABELS[status]}
    </span>
  );
}
