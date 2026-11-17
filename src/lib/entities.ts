import { supabase } from '@/lib/supabase';
import { toast } from '@/components/Toaster';
import { dbErrorMessage } from '@/lib/dbErrors';

// =====================================================================
// טיפוסים ושליפות משותפות לישויות הבסיס (ספקים, ספרים, מוסדות)
// =====================================================================

export type Supplier = {
  id: string;
  number: number;
  name: string;
  contact_name: string | null;
  phone: string | null;
  phone2: string | null;
  email: string | null;
  address: string | null;
  payment_terms: string | null;
  lead_time_days: number | null;
  notes: string | null;
  is_active: boolean;
};

export const SUPPLIER_COLUMNS =
  'id, number, name, contact_name, phone, phone2, email, address, payment_terms, lead_time_days, notes, is_active';

export async function fetchSuppliers(): Promise<Supplier[]> {
  const { data, error } = await supabase.from('suppliers').select(SUPPLIER_COLUMNS).order('name');
  if (error) toast.error(dbErrorMessage(error.message));
  return data ?? [];
}

export type Book = {
  id: string;
  code: string;
  name: string;
  publisher: string | null;
  sale_price: number;
  notes: string | null;
  is_active: boolean;
};

export const BOOK_COLUMNS = 'id, code, name, publisher, sale_price, notes, is_active';

export async function fetchBooks(): Promise<Book[]> {
  const { data, error } = await supabase.from('books').select(BOOK_COLUMNS).order('name');
  if (error) toast.error(dbErrorMessage(error.message));
  return data ?? [];
}

export type BookSupplier = {
  id: string;
  book_id: string;
  supplier_id: string;
  supplier_sku: string | null;
  purchase_price: number | null;
  is_preferred: boolean;
  notes: string | null;
};

export const BOOK_SUPPLIER_COLUMNS = 'id, book_id, supplier_id, supplier_sku, purchase_price, is_preferred, notes';

export type Institution = {
  id: string;
  number: number;
  name: string;
  address: string | null;
  city: string | null;
  contact_name: string | null;
  phone: string | null;
  phone2: string | null;
  email: string | null;
  notes: string | null;
  is_active: boolean;
};

export const INSTITUTION_COLUMNS = 'id, number, name, address, city, contact_name, phone, phone2, email, notes, is_active';

/** המכירה של מוסד בשנה */
export type InstitutionYear = {
  id: string;
  institution_id: string;
  year_id: string;
  sale_open_date: string | null;
  sale_close_date: string | null;
  order_deadline: string | null;
  cancel_deadline: string | null;
  notes: string | null;
};

export const INSTITUTION_YEAR_COLUMNS =
  'id, institution_id, year_id, sale_open_date, sale_close_date, order_deadline, cancel_deadline, notes';

export type ClassRow = {
  id: string;
  institution_year_id: string;
  name: string;
  student_count: number | null;
  sort_order: number;
  notes: string | null;
};

export const CLASS_COLUMNS = 'id, institution_year_id, name, student_count, sort_order, notes';
