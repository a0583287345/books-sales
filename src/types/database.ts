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
          sale_open_date: string | null
          settings: Json
          updated_at: string
          year_id: string
        }
        Insert: {
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
