// נוצר ממסד הנתונים (Supabase generate_typescript_types) – Json + Database בלבד. לייצר מחדש אחרי כל שינוי סכמה.
export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      academic_years: {
        Row: {
          created_at: string
          end_date: string | null
          id: string
          is_current: boolean
          name: string
          notes: string | null
          start_date: string | null
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          end_date?: string | null
          id?: string
          is_current?: boolean
          name: string
          notes?: string | null
          start_date?: string | null
          status?: string
          updated_at?: string
        }
        Update: Partial<Database["public"]["Tables"]["academic_years"]["Insert"]>
        Relationships: []
      }
      audit_logs: {
        Row: {
          action: string
          created_at: string
          description: string | null
          details: Json | null
          entity: string | null
          entity_id: string | null
          id: number
          user_id: string | null
          user_name: string | null
        }
        Insert: {
          action: string
          created_at?: string
          description?: string | null
          details?: Json | null
          entity?: string | null
          entity_id?: string | null
          id?: never
          user_id?: string | null
          user_name?: string | null
        }
        Update: Partial<Database["public"]["Tables"]["audit_logs"]["Insert"]>
        Relationships: []
      }
      book_price_history: {
        Row: {
          book_id: string
          changed_at: string
          changed_by: string | null
          changed_by_name: string | null
          id: number
          kind: string
          new_price: number | null
          old_price: number | null
          supplier_id: string | null
        }
        Insert: {
          book_id: string
          changed_at?: string
          changed_by?: string | null
          changed_by_name?: string | null
          id?: never
          kind: string
          new_price?: number | null
          old_price?: number | null
          supplier_id?: string | null
        }
        Update: Partial<Database["public"]["Tables"]["book_price_history"]["Insert"]>
        Relationships: [
          { foreignKeyName: "book_price_history_book_id_fkey"; columns: ["book_id"]; isOneToOne: false; referencedRelation: "books"; referencedColumns: ["id"] },
          { foreignKeyName: "book_price_history_supplier_id_fkey"; columns: ["supplier_id"]; isOneToOne: false; referencedRelation: "suppliers"; referencedColumns: ["id"] },
        ]
      }
      book_suppliers: {
        Row: {
          book_id: string
          created_at: string
          id: string
          is_preferred: boolean
          notes: string | null
          purchase_price: number | null
          supplier_id: string
          supplier_sku: string | null
          updated_at: string
        }
        Insert: {
          book_id: string
          created_at?: string
          id?: string
          is_preferred?: boolean
          notes?: string | null
          purchase_price?: number | null
          supplier_id: string
          supplier_sku?: string | null
          updated_at?: string
        }
        Update: Partial<Database["public"]["Tables"]["book_suppliers"]["Insert"]>
        Relationships: [
          { foreignKeyName: "book_suppliers_book_id_fkey"; columns: ["book_id"]; isOneToOne: false; referencedRelation: "books"; referencedColumns: ["id"] },
          { foreignKeyName: "book_suppliers_supplier_id_fkey"; columns: ["supplier_id"]; isOneToOne: false; referencedRelation: "suppliers"; referencedColumns: ["id"] },
        ]
      }
      books: {
        Row: {
          code: string
          created_at: string
          id: string
          is_active: boolean
          name: string
          notes: string | null
          publisher: string | null
          sale_price: number
          updated_at: string
        }
        Insert: {
          code?: string
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          notes?: string | null
          publisher?: string | null
          sale_price?: number
          updated_at?: string
        }
        Update: Partial<Database["public"]["Tables"]["books"]["Insert"]>
        Relationships: []
      }
      class_books: {
        Row: {
          book_id: string
          cancel_deadline: string | null
          class_id: string
          created_at: string
          id: string
          is_required: boolean
          notes: string | null
          order_deadline: string | null
          qty_per_student: number
          sale_price: number
          sort_order: number
          supplier_id: string | null
          updated_at: string
        }
        Insert: {
          book_id: string
          cancel_deadline?: string | null
          class_id: string
          created_at?: string
          id?: string
          is_required?: boolean
          notes?: string | null
          order_deadline?: string | null
          qty_per_student?: number
          sale_price?: number
          sort_order?: number
          supplier_id?: string | null
          updated_at?: string
        }
        Update: Partial<Database["public"]["Tables"]["class_books"]["Insert"]>
        Relationships: [
          { foreignKeyName: "class_books_book_id_fkey"; columns: ["book_id"]; isOneToOne: false; referencedRelation: "books"; referencedColumns: ["id"] },
          { foreignKeyName: "class_books_class_id_fkey"; columns: ["class_id"]; isOneToOne: false; referencedRelation: "classes"; referencedColumns: ["id"] },
          { foreignKeyName: "class_books_supplier_id_fkey"; columns: ["supplier_id"]; isOneToOne: false; referencedRelation: "suppliers"; referencedColumns: ["id"] },
        ]
      }
      classes: {
        Row: {
          created_at: string
          id: string
          institution_year_id: string
          name: string
          notes: string | null
          sort_order: number
          student_count: number | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          institution_year_id: string
          name: string
          notes?: string | null
          sort_order?: number
          student_count?: number | null
          updated_at?: string
        }
        Update: Partial<Database["public"]["Tables"]["classes"]["Insert"]>
        Relationships: [
          { foreignKeyName: "classes_institution_year_id_fkey"; columns: ["institution_year_id"]; isOneToOne: false; referencedRelation: "institution_years"; referencedColumns: ["id"] },
        ]
      }
      customer_private: {
        Row: {
          address: string | null
          city: string | null
          customer_id: string
          id_number: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          city?: string | null
          customer_id: string
          id_number?: string | null
          updated_at?: string
        }
        Update: Partial<Database["public"]["Tables"]["customer_private"]["Insert"]>
        Relationships: [
          { foreignKeyName: "customer_private_customer_id_fkey"; columns: ["customer_id"]; isOneToOne: true; referencedRelation: "customers"; referencedColumns: ["id"] },
        ]
      }
      customers: {
        Row: {
          created_at: string
          email: string | null
          first_name: string
          id: string
          last_name: string
          notes: string | null
          number: number
          phone: string | null
          phone_digits: string | null
          phone2: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          first_name: string
          id?: string
          last_name: string
          notes?: string | null
          number?: number
          phone?: string | null
          phone_digits?: string | null
          phone2?: string | null
          updated_at?: string
        }
        Update: Partial<Database["public"]["Tables"]["customers"]["Insert"]>
        Relationships: []
      }
      institution_years: {
        Row: {
          cancel_deadline: string | null
          created_at: string
          id: string
          institution_id: string
          notes: string | null
          order_deadline: string | null
          sale_close_date: string | null
          sale_day_date: string | null
          sale_day_notes: string | null
          sale_open_date: string | null
          settings: Json
          updated_at: string
          year_id: string
        }
        Insert: {
          sale_day_date?: string | null
          sale_day_notes?: string | null
          cancel_deadline?: string | null
          created_at?: string
          id?: string
          institution_id: string
          notes?: string | null
          order_deadline?: string | null
          sale_close_date?: string | null
          sale_open_date?: string | null
          settings?: Json
          updated_at?: string
          year_id: string
        }
        Update: Partial<Database["public"]["Tables"]["institution_years"]["Insert"]>
        Relationships: [
          { foreignKeyName: "institution_years_institution_id_fkey"; columns: ["institution_id"]; isOneToOne: false; referencedRelation: "institutions"; referencedColumns: ["id"] },
          { foreignKeyName: "institution_years_year_id_fkey"; columns: ["year_id"]; isOneToOne: false; referencedRelation: "academic_years"; referencedColumns: ["id"] },
        ]
      }
      institutions: {
        Row: {
          address: string | null
          city: string | null
          contact_name: string | null
          created_at: string
          email: string | null
          id: string
          is_active: boolean
          name: string
          notes: string | null
          number: number
          phone: string | null
          phone2: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          city?: string | null
          contact_name?: string | null
          created_at?: string
          email?: string | null
          id?: string
          is_active?: boolean
          name: string
          notes?: string | null
          number?: number
          phone?: string | null
          phone2?: string | null
          updated_at?: string
        }
        Update: Partial<Database["public"]["Tables"]["institutions"]["Insert"]>
        Relationships: []
      }
      customer_students: {
        Row: { id: string; customer_id: string; name: string; notes: string | null; created_at: string; updated_at: string }
        Insert: { id?: string; customer_id: string; name: string; notes?: string | null; created_at?: string; updated_at?: string }
        Update: Partial<Database["public"]["Tables"]["customer_students"]["Insert"]>
        Relationships: [
          { foreignKeyName: "customer_students_customer_id_fkey"; columns: ["customer_id"]; isOneToOne: false; referencedRelation: "customers"; referencedColumns: ["id"] },
        ]
      }
      orders: {
        Row: {
          id: string
          number: number
          year_id: string
          institution_year_id: string
          class_id: string
          customer_id: string
          student_id: string | null
          student_name: string
          status: string
          delivery_method: string
          subtotal: number
          discount: number
          discount_reason: string | null
          total: number
          paid_amount: number
          balance: number
          source: string
          copied_from: string | null
          notes: string | null
          cancelled_at: string | null
          cancelled_by_name: string | null
          cancel_reason: string | null
          created_at: string
          created_by: string | null
          created_by_name: string | null
          updated_at: string
        }
        Insert: {
          id?: string
          number?: number
          year_id: string
          institution_year_id: string
          class_id: string
          customer_id: string
          student_id?: string | null
          student_name: string
          status?: string
          delivery_method?: string
          subtotal?: number
          discount?: number
          discount_reason?: string | null
          paid_amount?: number
          source?: string
          copied_from?: string | null
          notes?: string | null
          cancelled_at?: string | null
          cancelled_by_name?: string | null
          cancel_reason?: string | null
          created_at?: string
          created_by?: string | null
          created_by_name?: string | null
          updated_at?: string
        }
        Update: Partial<Database["public"]["Tables"]["orders"]["Insert"]>
        Relationships: [
          { foreignKeyName: "orders_class_id_fkey"; columns: ["class_id"]; isOneToOne: false; referencedRelation: "classes"; referencedColumns: ["id"] },
          { foreignKeyName: "orders_customer_id_fkey"; columns: ["customer_id"]; isOneToOne: false; referencedRelation: "customers"; referencedColumns: ["id"] },
          { foreignKeyName: "orders_institution_year_id_fkey"; columns: ["institution_year_id"]; isOneToOne: false; referencedRelation: "institution_years"; referencedColumns: ["id"] },
          { foreignKeyName: "orders_year_id_fkey"; columns: ["year_id"]; isOneToOne: false; referencedRelation: "academic_years"; referencedColumns: ["id"] },
          { foreignKeyName: "orders_student_id_fkey"; columns: ["student_id"]; isOneToOne: false; referencedRelation: "customer_students"; referencedColumns: ["id"] },
          { foreignKeyName: "orders_copied_from_fkey"; columns: ["copied_from"]; isOneToOne: false; referencedRelation: "orders"; referencedColumns: ["id"] },
        ]
      }
      order_items: {
        Row: {
          id: string
          order_id: string
          book_id: string
          class_book_id: string | null
          qty: number
          unit_price: number
          is_required: boolean
          order_deadline: string | null
          cancel_deadline: string | null
          status: string
          cancelled_at: string | null
          cancelled_by_name: string | null
          cancel_reason: string | null
          cancelled_late: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          order_id: string
          book_id: string
          class_book_id?: string | null
          qty?: number
          unit_price?: number
          is_required?: boolean
          order_deadline?: string | null
          cancel_deadline?: string | null
          status?: string
          cancelled_at?: string | null
          cancelled_by_name?: string | null
          cancel_reason?: string | null
          cancelled_late?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: Partial<Database["public"]["Tables"]["order_items"]["Insert"]>
        Relationships: [
          { foreignKeyName: "order_items_order_id_fkey"; columns: ["order_id"]; isOneToOne: false; referencedRelation: "orders"; referencedColumns: ["id"] },
          { foreignKeyName: "order_items_book_id_fkey"; columns: ["book_id"]; isOneToOne: false; referencedRelation: "books"; referencedColumns: ["id"] },
          { foreignKeyName: "order_items_class_book_id_fkey"; columns: ["class_book_id"]; isOneToOne: false; referencedRelation: "class_books"; referencedColumns: ["id"] },
        ]
      }
      order_events: {
        Row: { id: number; order_id: string; created_at: string; user_id: string | null; user_name: string | null; event: string; description: string }
        Insert: { id?: never; order_id: string; created_at?: string; user_id?: string | null; user_name?: string | null; event: string; description: string }
        Update: Partial<Database["public"]["Tables"]["order_events"]["Insert"]>
        Relationships: [
          { foreignKeyName: "order_events_order_id_fkey"; columns: ["order_id"]; isOneToOne: false; referencedRelation: "orders"; referencedColumns: ["id"] },
        ]
      }
      purchase_orders: {
        Row: {
          id: string
          number: number
          supplier_id: string
          year_id: string
          status: string
          order_date: string | null
          expected_date: string | null
          notes: string | null
          close_note: string | null
          closed_at: string | null
          closed_by_name: string | null
          created_at: string
          created_by_name: string | null
          updated_at: string
        }
        Insert: { supplier_id: string; year_id: string; notes?: string | null; expected_date?: string | null; order_date?: string | null }
        Update: { notes?: string | null; expected_date?: string | null; order_date?: string | null }
        Relationships: [
          { foreignKeyName: "purchase_orders_supplier_id_fkey"; columns: ["supplier_id"]; isOneToOne: false; referencedRelation: "suppliers"; referencedColumns: ["id"] },
          { foreignKeyName: "purchase_orders_year_id_fkey"; columns: ["year_id"]; isOneToOne: false; referencedRelation: "academic_years"; referencedColumns: ["id"] },
        ]
      }
      po_items: {
        Row: {
          id: string
          po_id: string
          book_id: string
          qty_ordered: number
          qty_received: number
          qty_damaged: number
          qty_wrong: number
          qty_returned: number
          shortage_note: string | null
          notes: string | null
          created_at: string
          updated_at: string
        }
        Insert: { po_id: string; book_id: string; notes?: string | null }
        Update: { notes?: string | null; shortage_note?: string | null }
        Relationships: [
          { foreignKeyName: "po_items_po_id_fkey"; columns: ["po_id"]; isOneToOne: false; referencedRelation: "purchase_orders"; referencedColumns: ["id"] },
          { foreignKeyName: "po_items_book_id_fkey"; columns: ["book_id"]; isOneToOne: false; referencedRelation: "books"; referencedColumns: ["id"] },
        ]
      }
      po_item_costs: {
        Row: { po_item_id: string; unit_cost: number | null; updated_at: string }
        Insert: { po_item_id: string; unit_cost?: number | null }
        Update: { unit_cost?: number | null }
        Relationships: [
          { foreignKeyName: "po_item_costs_po_item_id_fkey"; columns: ["po_item_id"]; isOneToOne: true; referencedRelation: "po_items"; referencedColumns: ["id"] },
        ]
      }
      po_item_allocations: {
        Row: { id: string; po_item_id: string; institution_year_id: string | null; qty: number }
        Insert: { po_item_id: string; institution_year_id?: string | null; qty: number }
        Update: { qty?: number }
        Relationships: [
          { foreignKeyName: "po_item_allocations_po_item_id_fkey"; columns: ["po_item_id"]; isOneToOne: false; referencedRelation: "po_items"; referencedColumns: ["id"] },
          { foreignKeyName: "po_item_allocations_institution_year_id_fkey"; columns: ["institution_year_id"]; isOneToOne: false; referencedRelation: "institution_years"; referencedColumns: ["id"] },
        ]
      }
      po_receipts: {
        Row: { id: string; po_id: string; received_at: string; received_by_name: string | null; notes: string | null }
        Insert: never
        Update: never
        Relationships: [
          { foreignKeyName: "po_receipts_po_id_fkey"; columns: ["po_id"]; isOneToOne: false; referencedRelation: "purchase_orders"; referencedColumns: ["id"] },
        ]
      }
      po_receipt_lines: {
        Row: { id: string; receipt_id: string; po_item_id: string; qty_good: number; qty_damaged: number; qty_wrong: number }
        Insert: never
        Update: never
        Relationships: [
          { foreignKeyName: "po_receipt_lines_receipt_id_fkey"; columns: ["receipt_id"]; isOneToOne: false; referencedRelation: "po_receipts"; referencedColumns: ["id"] },
          { foreignKeyName: "po_receipt_lines_po_item_id_fkey"; columns: ["po_item_id"]; isOneToOne: false; referencedRelation: "po_items"; referencedColumns: ["id"] },
        ]
      }
      po_returns: {
        Row: { id: string; po_item_id: string; qty: number; kind: string; reason: string | null; created_at: string; created_by_name: string | null }
        Insert: never
        Update: never
        Relationships: [
          { foreignKeyName: "po_returns_po_item_id_fkey"; columns: ["po_item_id"]; isOneToOne: false; referencedRelation: "po_items"; referencedColumns: ["id"] },
        ]
      }
      stock_movements: {
        Row: {
          id: number
          book_id: string
          qty: number
          kind: string
          po_item_id: string | null
          institution_year_id: string | null
          order_id: string | null
          reason: string | null
          created_at: string
          created_by_name: string | null
        }
        Insert: never
        Update: never
        Relationships: [
          { foreignKeyName: "stock_movements_book_id_fkey"; columns: ["book_id"]; isOneToOne: false; referencedRelation: "books"; referencedColumns: ["id"] },
        ]
      }
      stock_allocations: {
        Row: { id: string; institution_year_id: string; book_id: string; qty: number; updated_at: string; updated_by_name: string | null }
        Insert: never
        Update: never
        Relationships: [
          { foreignKeyName: "stock_allocations_institution_year_id_fkey"; columns: ["institution_year_id"]; isOneToOne: false; referencedRelation: "institution_years"; referencedColumns: ["id"] },
          { foreignKeyName: "stock_allocations_book_id_fkey"; columns: ["book_id"]; isOneToOne: false; referencedRelation: "books"; referencedColumns: ["id"] },
        ]
      }
      bags: {
        Row: {
          id: string
          order_id: string
          bag_no: number
          code: string
          status: string
          is_partial: boolean
          delivery_id: string | null
          notes: string | null
          created_at: string
          created_by_name: string | null
          picked_at: string | null
          picked_by_name: string | null
          checked_at: string | null
          checked_by_name: string | null
          ready_at: string | null
          ready_by_name: string | null
          delivered_at: string | null
          delivered_by_name: string | null
          received_by: string | null
          label_printed_at: string | null
          updated_at: string
        }
        Insert: never
        Update: never
        Relationships: [
          { foreignKeyName: "bags_order_id_fkey"; columns: ["order_id"]; isOneToOne: false; referencedRelation: "orders"; referencedColumns: ["id"] },
          { foreignKeyName: "bags_delivery_id_fkey"; columns: ["delivery_id"]; isOneToOne: false; referencedRelation: "institution_deliveries"; referencedColumns: ["id"] },
        ]
      }
      bag_items: {
        Row: { id: string; bag_id: string; order_item_id: string; qty: number }
        Insert: never
        Update: never
        Relationships: [
          { foreignKeyName: "bag_items_bag_id_fkey"; columns: ["bag_id"]; isOneToOne: false; referencedRelation: "bags"; referencedColumns: ["id"] },
        ]
      }
      institution_deliveries: {
        Row: {
          id: string
          number: number
          institution_year_id: string
          delivery_date: string | null
          carrier: string | null
          cost: number | null
          paid_by: string | null
          boxes_count: number | null
          status: string
          receiver_name: string | null
          delivered_at: string | null
          notes: string | null
          created_at: string
          created_by_name: string | null
          updated_at: string
        }
        Insert: never
        Update: never
        Relationships: [
          { foreignKeyName: "institution_deliveries_institution_year_id_fkey"; columns: ["institution_year_id"]; isOneToOne: false; referencedRelation: "institution_years"; referencedColumns: ["id"] },
        ]
      }
      roles: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_super: boolean
          name: string
          permissions: Json
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_super?: boolean
          name: string
          permissions?: Json
          updated_at?: string
        }
        Update: Partial<Database["public"]["Tables"]["roles"]["Insert"]>
        Relationships: []
      }
      suppliers: {
        Row: {
          address: string | null
          contact_name: string | null
          created_at: string
          email: string | null
          id: string
          is_active: boolean
          lead_time_days: number | null
          name: string
          notes: string | null
          number: number
          payment_terms: string | null
          phone: string | null
          phone2: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          contact_name?: string | null
          created_at?: string
          email?: string | null
          id?: string
          is_active?: boolean
          lead_time_days?: number | null
          name: string
          notes?: string | null
          number?: number
          payment_terms?: string | null
          phone?: string | null
          phone2?: string | null
          updated_at?: string
        }
        Update: Partial<Database["public"]["Tables"]["suppliers"]["Insert"]>
        Relationships: []
      }
      user_profiles: {
        Row: {
          created_at: string
          email: string | null
          full_name: string
          id: string
          is_active: boolean
          permission_overrides: Json
          role_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          full_name: string
          id: string
          is_active?: boolean
          permission_overrides?: Json
          role_id: string
          updated_at?: string
        }
        Update: Partial<Database["public"]["Tables"]["user_profiles"]["Insert"]>
        Relationships: [
          { foreignKeyName: "user_profiles_role_id_fkey"; columns: ["role_id"]; isOneToOne: false; referencedRelation: "roles"; referencedColumns: ["id"] },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      copy_class: { Args: { p_name: string; p_source_class: string; p_target_institution_year: string }; Returns: string }
      copy_class_books: { Args: { p_replace?: boolean; p_source_class: string; p_target_class: string }; Returns: number }
      copy_institution: {
        Args: { p_new_name: string; p_new_number?: number; p_source_iy: string; p_target_year?: string }
        Returns: string
      }
      copy_institution_to_year: {
        Args: { p_refresh_prices?: boolean; p_source_iy: string; p_target_year: string }
        Returns: string
      }
      copy_year: {
        Args: {
          p_end?: string
          p_institution_ids?: string[]
          p_name: string
          p_refresh_prices?: boolean
          p_source_year: string
          p_start?: string
        }
        Returns: string
      }
      create_order: {
        Args: {
          p_class_id: string
          p_customer_id: string
          p_student_name: string
          p_items: Json
          p_student_id?: string
          p_delivery?: string
          p_discount?: number
          p_discount_reason?: string
          p_notes?: string
          p_source?: string
          p_copied_from?: string
        }
        Returns: string
      }
      create_purchase_order: {
        Args: { p_supplier: string; p_year: string; p_items: Json; p_notes?: string; p_expected?: string }
        Returns: string
      }
      set_po_status: { Args: { p_po: string; p_status: string; p_note?: string }; Returns: undefined }
      receive_po: { Args: { p_po: string; p_lines: Json; p_notes?: string }; Returns: string }
      return_to_supplier: { Args: { p_po_item: string; p_qty: number; p_kind: string; p_reason?: string }; Returns: undefined }
      adjust_stock: { Args: { p_book: string; p_qty: number; p_kind: string; p_reason: string }; Returns: undefined }
      set_allocation: { Args: { p_iy: string; p_book: string; p_qty: number }; Returns: undefined }
      stock_levels: {
        Args: never
        Returns: { book_id: string; on_hand: number; allocated: number; on_order: number; in_draft: number }[]
      }
      demand_by_institution: {
        Args: { p_year: string }
        Returns: {
          institution_year_id: string
          book_id: string
          supplier_id: string | null
          demand: number
          allocated: number
          ordered: number
          ordered_draft: number
        }[]
      }
      save_bag: { Args: { p_order: string; p_lines: Json; p_bag?: string; p_notes?: string }; Returns: string }
      set_bag_status: { Args: { p_bag: string; p_status: string; p_received_by?: string }; Returns: undefined }
      mark_labels_printed: { Args: { p_bags: string[] }; Returns: undefined }
      save_delivery: {
        Args: {
          p_iy: string
          p_delivery?: string
          p_date?: string
          p_carrier?: string
          p_cost?: number
          p_paid_by?: string
          p_boxes?: number
          p_notes?: string
        }
        Returns: string
      }
      assign_bags_to_delivery: { Args: { p_delivery: string; p_bags: string[]; p_remove?: boolean }; Returns: number }
      set_delivery_status: { Args: { p_delivery: string; p_status: string; p_receiver?: string }; Returns: undefined }
      packing_queue: {
        Args: { p_year: string }
        Returns: {
          order_id: string
          order_number: number
          order_status: string
          delivery_method: string
          student_name: string
          customer_name: string
          institution_year_id: string
          inst_name: string
          class_name: string
          qty_total: number
          qty_packed: number
          qty_delivered: number
          bags_open: number
          bags_ready: number
          balance: number
        }[]
      }
      pack_availability: {
        Args: { p_year: string }
        Returns: { institution_year_id: string; book_id: string; allocated: number; packed_open: number }[]
      }
      order_pack_details: { Args: { p_order: string }; Returns: Json }
      bag_labels: { Args: { p_bags: string[] }; Returns: Json }
      find_orders_for_pickup: {
        Args: { p_year: string; p_query: string }
        Returns: {
          order_id: string
          order_number: number
          order_status: string
          student_name: string
          customer_name: string
          customer_phone: string | null
          inst_name: string
          class_name: string
          balance: number
          bags_ready: number
          bags_open: number
          bags_delivered: number
        }[]
      }
      delivery_report: { Args: { p_delivery: string }; Returns: Json }
      has_permission: { Args: { p: string }; Returns: boolean }
      is_active_user: { Args: never; Returns: boolean }
      is_super_user: { Args: never; Returns: boolean }
      my_access: { Args: never; Returns: Json }
      my_role_id: { Args: never; Returns: string }
      permission_state: { Args: { p: string }; Returns: string }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}
