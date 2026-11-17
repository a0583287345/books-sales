import { BAG_STATUS_LABELS, BAG_STATUS_STYLES, type BagStatus } from '@/lib/warehouse';

export function BagStatusBadge({ status, partial }: { status: BagStatus; partial?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${BAG_STATUS_STYLES[status]}`}>
        {BAG_STATUS_LABELS[status]}
      </span>
      {partial && status !== 'cancelled' && (
        <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">חסר</span>
      )}
    </span>
  );
}
