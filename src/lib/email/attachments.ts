import 'server-only';
import * as XLSX from 'xlsx';
import { supabaseAdmin } from '@/lib/supabase-admin';
import type { Database } from '@/types/database';
import type { Attachment } from './server';

// =====================================================================
// קבצים מצורפים למיילים. הזמנת רכש לספק → קובץ אקסל (ספר, קוד, מק"ט ספק, כמות, ומחיר רק אם סומן).
// ההרשאה לצרף מחיר נבדקה כשהמייל נכנס לתור (RLS: attach_po_prices רק עם books_view_cost).
// =====================================================================

type OutboxRow = Database['public']['Tables']['email_outbox']['Row'];

export async function buildAttachments(row: OutboxRow): Promise<Attachment[]> {
  if (!row.attach_po || !row.po_id) return [];
  const { data: po, error } = await supabaseAdmin
    .from('purchase_orders')
    .select('number, supplier_id, expected_date, notes, po_items(id, book_id, qty_ordered, notes, books(name, code), po_item_costs(unit_cost))')
    .eq('id', row.po_id)
    .maybeSingle();
  if (error || !po) throw new Error('הזמנת הרכש לא נמצאה – לא ניתן לצרף את הקובץ');

  type Item = {
    book_id: string;
    qty_ordered: number;
    notes: string | null;
    books: { name: string; code: string | null } | null;
    po_item_costs: { unit_cost: number | null } | { unit_cost: number | null }[] | null;
  };
  const items = ((po.po_items ?? []) as unknown as Item[]).filter((i) => i.qty_ordered > 0);
  const { data: skus } = await supabaseAdmin
    .from('book_suppliers')
    .select('book_id, supplier_sku')
    .eq('supplier_id', po.supplier_id)
    .in('book_id', items.map((i) => i.book_id).length ? items.map((i) => i.book_id) : ['00000000-0000-0000-0000-000000000000']);
  const skuOf = new Map((skus ?? []).map((s) => [s.book_id, s.supplier_sku]));

  const rows = items
    .sort((a, b) => (a.books?.name ?? '').localeCompare(b.books?.name ?? '', 'he'))
    .map((i) => {
      const cost = Array.isArray(i.po_item_costs) ? i.po_item_costs[0]?.unit_cost : i.po_item_costs?.unit_cost;
      const r: Record<string, string | number | null> = {
        ספר: i.books?.name ?? '',
        קוד: i.books?.code ?? '',
        'מק"ט ספק': skuOf.get(i.book_id) ?? '',
        כמות: i.qty_ordered,
      };
      if (row.attach_po_prices) {
        r['מחיר ליחידה'] = cost ?? null;
        r['סה"כ'] = cost != null ? Math.round(cost * i.qty_ordered * 100) / 100 : null;
      }
      r['הערות'] = i.notes ?? '';
      return r;
    });

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(rows);
  ws['!cols'] = [{ wch: 36 }, { wch: 12 }, { wch: 14 }, { wch: 8 }, ...(row.attach_po_prices ? [{ wch: 12 }, { wch: 12 }] : []), { wch: 30 }];
  wb.Workbook = { Views: [{ RTL: true }] };
  XLSX.utils.book_append_sheet(wb, ws, `הזמנה ${po.number}`);
  const content = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
  return [
    {
      filename: `הזמנת רכש ${po.number}.xlsx`,
      content,
      contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    },
  ];
}
