import { ORDER_STATUS_HINTS, ORDER_STATUS_LABELS, ORDER_STATUS_STYLES, type OrderStatus } from '@/lib/orders';

export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  return (
    <span
      title={ORDER_STATUS_HINTS[status]}
      className={`inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${ORDER_STATUS_STYLES[status] ?? 'bg-slate-100 text-slate-700'}`}
    >
      {ORDER_STATUS_LABELS[status] ?? status}
    </span>
  );
}
