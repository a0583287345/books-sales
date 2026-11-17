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
