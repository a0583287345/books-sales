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
        Update: {
          created_at?: string
          end_date?: string | null
          id?: string
          is_current?: boolean
          name?: string
          notes?: string | null
          start_date?: string | null
          status?: string
          updated_at?: string
        }
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
        Update: {
          action?: string
          created_at?: string
          description?: string | null
          details?: Json | null
          entity?: string | null
          entity_id?: string | null
          id?: never
          user_id?: string | null
          user_name?: string | null
        }
        Relationships: []
      }
      bag_items: {
        Row: {
          bag_id: string
          id: string
          order_item_id: string
          qty: number
        }
        Insert: {
          bag_id: string
          id?: string
          order_item_id: string
          qty: number
        }
        Update: {
          bag_id?: string
          id?: string
          order_item_id?: string
          qty?: number
        }
        Relationships: [
          {
            foreignKeyName: "bag_items_bag_id_fkey"
            columns: ["bag_id"]
            isOneToOne: false
            referencedRelation: "bags"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bag_items_order_item_id_fkey"
            columns: ["order_item_id"]
            isOneToOne: false
            referencedRelation: "order_items"
            referencedColumns: ["id"]
          },
        ]
      }
      bags: {
        Row: {
          bag_no: number
          checked_at: string | null
          checked_by_name: string | null
          code: string
          created_at: string
          created_by_name: string | null
          delivered_at: string | null
          delivered_by_name: string | null
          delivery_id: string | null
          id: string
          is_partial: boolean
          label_printed_at: string | null
          notes: string | null
          order_id: string
          picked_at: string | null
          picked_by_name: string | null
          ready_at: string | null
          ready_by_name: string | null
          received_by: string | null
          status: string
          updated_at: string
        }
        Insert: {
          bag_no: number
          checked_at?: string | null
          checked_by_name?: string | null
          code: string
          created_at?: string
          created_by_name?: string | null
          delivered_at?: string | null
          delivered_by_name?: string | null
          delivery_id?: string | null
          id?: string
          is_partial?: boolean
          label_printed_at?: string | null
          notes?: string | null
          order_id: string
          picked_at?: string | null
          picked_by_name?: string | null
          ready_at?: string | null
          ready_by_name?: string | null
          received_by?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          bag_no?: number
          checked_at?: string | null
          checked_by_name?: string | null
          code?: string
          created_at?: string
          created_by_name?: string | null
          delivered_at?: string | null
          delivered_by_name?: string | null
          delivery_id?: string | null
          id?: string
          is_partial?: boolean
          label_printed_at?: string | null
          notes?: string | null
          order_id?: string
          picked_at?: string | null
          picked_by_name?: string | null
          ready_at?: string | null
          ready_by_name?: string | null
          received_by?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "bags_delivery_id_fkey"
            columns: ["delivery_id"]
            isOneToOne: false
            referencedRelation: "institution_deliveries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bags_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
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
        Update: {
          book_id?: string
          changed_at?: string
          changed_by?: string | null
          changed_by_name?: string | null
          id?: never
          kind?: string
          new_price?: number | null
          old_price?: number | null
          supplier_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "book_price_history_book_id_fkey"
            columns: ["book_id"]
            isOneToOne: false
            referencedRelation: "books"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "book_price_history_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
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
        Update: {
          book_id?: string
          created_at?: string
          id?: string
          is_preferred?: boolean
          notes?: string | null
          purchase_price?: number | null
          supplier_id?: string
          supplier_sku?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "book_suppliers_book_id_fkey"
            columns: ["book_id"]
            isOneToOne: false
            referencedRelation: "books"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "book_suppliers_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
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
        Update: {
          code?: string
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          notes?: string | null
          publisher?: string | null
          sale_price?: number
          updated_at?: string
        }
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
        Update: {
          book_id?: string
          cancel_deadline?: string | null
          class_id?: string
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
        Relationships: [
          {
            foreignKeyName: "class_books_book_id_fkey"
            columns: ["book_id"]
            isOneToOne: false
            referencedRelation: "books"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "class_books_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "class_books_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
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
        Update: {
          created_at?: string
          id?: string
          institution_year_id?: string
          name?: string
          notes?: string | null
          sort_order?: number
          student_count?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "classes_institution_year_id_fkey"
            columns: ["institution_year_id"]
            isOneToOne: false
            referencedRelation: "institution_years"
            referencedColumns: ["id"]
          },
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
        Update: {
          address?: string | null
          city?: string | null
          customer_id?: string
          id_number?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_private_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: true
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      customers: {
        Row: {
          created_at: string
          email: string | null
          email_opt_out: boolean
          first_name: string
          id: string
          last_name: string
          notes: string | null
          number: number
          parent_name: string | null
          phone: string | null
          phone_digits: string | null
          phone2: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          email_opt_out?: boolean
          first_name: string
          id?: string
          last_name: string
          notes?: string | null
          number?: number
          parent_name?: string | null
          phone?: string | null
          phone_digits?: string | null
          phone2?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string | null
          email_opt_out?: boolean
          first_name?: string
          id?: string
          last_name?: string
          notes?: string | null
          number?: number
          parent_name?: string | null
          phone?: string | null
          phone_digits?: string | null
          phone2?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      email_batches: {
        Row: {
          created_at: string
          created_by: string | null
          created_by_name: string | null
          id: string
          kind: string
          title: string
          total: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          created_by_name?: string | null
          id?: string
          kind: string
          title: string
          total?: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          created_by_name?: string | null
          id?: string
          kind?: string
          title?: string
          total?: number
        }
        Relationships: []
      }
      email_outbox: {
        Row: {
          attach_po: boolean
          attach_po_prices: boolean
          attempts: number
          batch_id: string | null
          body: string
          created_at: string
          created_by: string | null
          created_by_name: string | null
          customer_id: string | null
          error: string | null
          id: string
          kind: string
          order_id: string | null
          po_id: string | null
          sent_at: string | null
          status: string
          subject: string
          supplier_id: string | null
          to_email: string
          to_name: string | null
        }
        Insert: {
          attach_po?: boolean
          attach_po_prices?: boolean
          attempts?: number
          batch_id?: string | null
          body: string
          created_at?: string
          created_by?: string | null
          created_by_name?: string | null
          customer_id?: string | null
          error?: string | null
          id?: string
          kind: string
          order_id?: string | null
          po_id?: string | null
          sent_at?: string | null
          status?: string
          subject: string
          supplier_id?: string | null
          to_email: string
          to_name?: string | null
        }
        Update: {
          attach_po?: boolean
          attach_po_prices?: boolean
          attempts?: number
          batch_id?: string | null
          body?: string
          created_at?: string
          created_by?: string | null
          created_by_name?: string | null
          customer_id?: string | null
          error?: string | null
          id?: string
          kind?: string
          order_id?: string | null
          po_id?: string | null
          sent_at?: string | null
          status?: string
          subject?: string
          supplier_id?: string | null
          to_email?: string
          to_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "email_outbox_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "email_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_outbox_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_outbox_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_outbox_po_id_fkey"
            columns: ["po_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_outbox_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      email_secrets: {
        Row: {
          gmail_app_password: string | null
          id: number
          updated_at: string
        }
        Insert: {
          gmail_app_password?: string | null
          id?: number
          updated_at?: string
        }
        Update: {
          gmail_app_password?: string | null
          id?: number
          updated_at?: string
        }
        Relationships: []
      }
      email_settings: {
        Row: {
          daily_limit: number
          default_payment_instructions: string | null
          default_pickup_info: string | null
          enabled: boolean
          from_name: string
          gmail_user: string | null
          id: number
          reply_to: string | null
          signature: string | null
          templates: Json
          updated_at: string
        }
        Insert: {
          daily_limit?: number
          default_payment_instructions?: string | null
          default_pickup_info?: string | null
          enabled?: boolean
          from_name?: string
          gmail_user?: string | null
          id?: number
          reply_to?: string | null
          signature?: string | null
          templates?: Json
          updated_at?: string
        }
        Update: {
          daily_limit?: number
          default_payment_instructions?: string | null
          default_pickup_info?: string | null
          enabled?: boolean
          from_name?: string
          gmail_user?: string | null
          id?: number
          reply_to?: string | null
          signature?: string | null
          templates?: Json
          updated_at?: string
        }
        Relationships: []
      }
      expenses: {
        Row: {
          amount: number
          category: string
          created_at: string
          created_by_name: string | null
          expense_date: string
          id: string
          institution_year_id: string | null
          method: string | null
          notes: string | null
          payee: string | null
          reference: string | null
          updated_at: string
          year_id: string | null
        }
        Insert: {
          amount: number
          category: string
          created_at?: string
          created_by_name?: string | null
          expense_date?: string
          id?: string
          institution_year_id?: string | null
          method?: string | null
          notes?: string | null
          payee?: string | null
          reference?: string | null
          updated_at?: string
          year_id?: string | null
        }
        Update: {
          amount?: number
          category?: string
          created_at?: string
          created_by_name?: string | null
          expense_date?: string
          id?: string
          institution_year_id?: string | null
          method?: string | null
          notes?: string | null
          payee?: string | null
          reference?: string | null
          updated_at?: string
          year_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "expenses_institution_year_id_fkey"
            columns: ["institution_year_id"]
            isOneToOne: false
            referencedRelation: "institution_years"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_year_id_fkey"
            columns: ["year_id"]
            isOneToOne: false
            referencedRelation: "academic_years"
            referencedColumns: ["id"]
          },
        ]
      }
      institution_deliveries: {
        Row: {
          boxes_count: number | null
          carrier: string | null
          cost: number | null
          created_at: string
          created_by_name: string | null
          delivered_at: string | null
          delivery_date: string | null
          id: string
          institution_year_id: string
          notes: string | null
          number: number
          paid_by: string | null
          receiver_name: string | null
          status: string
          updated_at: string
        }
        Insert: {
          boxes_count?: number | null
          carrier?: string | null
          cost?: number | null
          created_at?: string
          created_by_name?: string | null
          delivered_at?: string | null
          delivery_date?: string | null
          id?: string
          institution_year_id: string
          notes?: string | null
          number?: number
          paid_by?: string | null
          receiver_name?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          boxes_count?: number | null
          carrier?: string | null
          cost?: number | null
          created_at?: string
          created_by_name?: string | null
          delivered_at?: string | null
          delivery_date?: string | null
          id?: string
          institution_year_id?: string
          notes?: string | null
          number?: number
          paid_by?: string | null
          receiver_name?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "institution_deliveries_institution_year_id_fkey"
            columns: ["institution_year_id"]
            isOneToOne: false
            referencedRelation: "institution_years"
            referencedColumns: ["id"]
          },
        ]
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
          cancel_deadline?: string | null
          created_at?: string
          id?: string
          institution_id: string
          notes?: string | null
          order_deadline?: string | null
          sale_close_date?: string | null
          sale_day_date?: string | null
          sale_day_notes?: string | null
          sale_open_date?: string | null
          settings?: Json
          updated_at?: string
          year_id: string
        }
        Update: {
          cancel_deadline?: string | null
          created_at?: string
          id?: string
          institution_id?: string
          notes?: string | null
          order_deadline?: string | null
          sale_close_date?: string | null
          sale_day_date?: string | null
          sale_day_notes?: string | null
          sale_open_date?: string | null
          settings?: Json
          updated_at?: string
          year_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "institution_years_institution_id_fkey"
            columns: ["institution_id"]
            isOneToOne: false
            referencedRelation: "institutions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "institution_years_year_id_fkey"
            columns: ["year_id"]
            isOneToOne: false
            referencedRelation: "academic_years"
            referencedColumns: ["id"]
          },
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
        Update: {
          address?: string | null
          city?: string | null
          contact_name?: string | null
          created_at?: string
          email?: string | null
          id?: string
          is_active?: boolean
          name?: string
          notes?: string | null
          number?: number
          phone?: string | null
          phone2?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      order_events: {
        Row: {
          created_at: string
          description: string
          event: string
          id: number
          order_id: string
          user_id: string | null
          user_name: string | null
        }
        Insert: {
          created_at?: string
          description: string
          event: string
          id?: never
          order_id: string
          user_id?: string | null
          user_name?: string | null
        }
        Update: {
          created_at?: string
          description?: string
          event?: string
          id?: never
          order_id?: string
          user_id?: string | null
          user_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "order_events_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      order_items: {
        Row: {
          book_id: string
          cancel_deadline: string | null
          cancel_reason: string | null
          cancelled_at: string | null
          cancelled_by_name: string | null
          cancelled_late: boolean
          class_book_id: string | null
          created_at: string
          id: string
          is_required: boolean
          order_deadline: string | null
          order_id: string
          qty: number
          status: string
          unit_price: number
          updated_at: string
        }
        Insert: {
          book_id: string
          cancel_deadline?: string | null
          cancel_reason?: string | null
          cancelled_at?: string | null
          cancelled_by_name?: string | null
          cancelled_late?: boolean
          class_book_id?: string | null
          created_at?: string
          id?: string
          is_required?: boolean
          order_deadline?: string | null
          order_id: string
          qty?: number
          status?: string
          unit_price?: number
          updated_at?: string
        }
        Update: {
          book_id?: string
          cancel_deadline?: string | null
          cancel_reason?: string | null
          cancelled_at?: string | null
          cancelled_by_name?: string | null
          cancelled_late?: boolean
          class_book_id?: string | null
          created_at?: string
          id?: string
          is_required?: boolean
          order_deadline?: string | null
          order_id?: string
          qty?: number
          status?: string
          unit_price?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_items_book_id_fkey"
            columns: ["book_id"]
            isOneToOne: false
            referencedRelation: "books"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_class_book_id_fkey"
            columns: ["class_book_id"]
            isOneToOne: false
            referencedRelation: "class_books"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          balance: number | null
          cancel_reason: string | null
          cancelled_at: string | null
          cancelled_by_name: string | null
          class_id: string
          copied_from: string | null
          created_at: string
          created_by: string | null
          created_by_name: string | null
          customer_id: string
          delivery_method: string
          discount: number
          discount_reason: string | null
          id: string
          institution_year_id: string
          notes: string | null
          number: number
          paid_amount: number
          source: string
          status: string
          student_id: string | null
          student_name: string
          subtotal: number
          total: number | null
          updated_at: string
          year_id: string
        }
        Insert: {
          balance?: number | null
          cancel_reason?: string | null
          cancelled_at?: string | null
          cancelled_by_name?: string | null
          class_id: string
          copied_from?: string | null
          created_at?: string
          created_by?: string | null
          created_by_name?: string | null
          customer_id: string
          delivery_method?: string
          discount?: number
          discount_reason?: string | null
          id?: string
          institution_year_id: string
          notes?: string | null
          number?: number
          paid_amount?: number
          source?: string
          status?: string
          student_id?: string | null
          student_name: string
          subtotal?: number
          total?: number | null
          updated_at?: string
          year_id: string
        }
        Update: {
          balance?: number | null
          cancel_reason?: string | null
          cancelled_at?: string | null
          cancelled_by_name?: string | null
          class_id?: string
          copied_from?: string | null
          created_at?: string
          created_by?: string | null
          created_by_name?: string | null
          customer_id?: string
          delivery_method?: string
          discount?: number
          discount_reason?: string | null
          id?: string
          institution_year_id?: string
          notes?: string | null
          number?: number
          paid_amount?: number
          source?: string
          status?: string
          student_id?: string | null
          student_name?: string
          subtotal?: number
          total?: number | null
          updated_at?: string
          year_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "orders_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_copied_from_fkey"
            columns: ["copied_from"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_institution_year_id_fkey"
            columns: ["institution_year_id"]
            isOneToOne: false
            referencedRelation: "institution_years"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_year_id_fkey"
            columns: ["year_id"]
            isOneToOne: false
            referencedRelation: "academic_years"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount: number
          created_at: string
          created_by_name: string | null
          id: string
          kind: string
          method: string
          notes: string | null
          order_id: string
          paid_at: string
          reference: string | null
          related_payment_id: string | null
          void_reason: string | null
          voided: boolean
          voided_at: string | null
          voided_by_name: string | null
        }
        Insert: {
          amount: number
          created_at?: string
          created_by_name?: string | null
          id?: string
          kind: string
          method: string
          notes?: string | null
          order_id: string
          paid_at?: string
          reference?: string | null
          related_payment_id?: string | null
          void_reason?: string | null
          voided?: boolean
          voided_at?: string | null
          voided_by_name?: string | null
        }
        Update: {
          amount?: number
          created_at?: string
          created_by_name?: string | null
          id?: string
          kind?: string
          method?: string
          notes?: string | null
          order_id?: string
          paid_at?: string
          reference?: string | null
          related_payment_id?: string | null
          void_reason?: string | null
          voided?: boolean
          voided_at?: string | null
          voided_by_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payments_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_related_payment_id_fkey"
            columns: ["related_payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
        ]
      }
      po_item_allocations: {
        Row: {
          id: string
          institution_year_id: string | null
          po_item_id: string
          qty: number
        }
        Insert: {
          id?: string
          institution_year_id?: string | null
          po_item_id: string
          qty: number
        }
        Update: {
          id?: string
          institution_year_id?: string | null
          po_item_id?: string
          qty?: number
        }
        Relationships: [
          {
            foreignKeyName: "po_item_allocations_institution_year_id_fkey"
            columns: ["institution_year_id"]
            isOneToOne: false
            referencedRelation: "institution_years"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "po_item_allocations_po_item_id_fkey"
            columns: ["po_item_id"]
            isOneToOne: false
            referencedRelation: "po_items"
            referencedColumns: ["id"]
          },
        ]
      }
      po_item_costs: {
        Row: {
          po_item_id: string
          unit_cost: number | null
          updated_at: string
        }
        Insert: {
          po_item_id: string
          unit_cost?: number | null
          updated_at?: string
        }
        Update: {
          po_item_id?: string
          unit_cost?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "po_item_costs_po_item_id_fkey"
            columns: ["po_item_id"]
            isOneToOne: true
            referencedRelation: "po_items"
            referencedColumns: ["id"]
          },
        ]
      }
      po_items: {
        Row: {
          book_id: string
          created_at: string
          id: string
          notes: string | null
          po_id: string
          qty_damaged: number
          qty_ordered: number
          qty_received: number
          qty_returned: number
          qty_wrong: number
          shortage_note: string | null
          updated_at: string
        }
        Insert: {
          book_id: string
          created_at?: string
          id?: string
          notes?: string | null
          po_id: string
          qty_damaged?: number
          qty_ordered?: number
          qty_received?: number
          qty_returned?: number
          qty_wrong?: number
          shortage_note?: string | null
          updated_at?: string
        }
        Update: {
          book_id?: string
          created_at?: string
          id?: string
          notes?: string | null
          po_id?: string
          qty_damaged?: number
          qty_ordered?: number
          qty_received?: number
          qty_returned?: number
          qty_wrong?: number
          shortage_note?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "po_items_book_id_fkey"
            columns: ["book_id"]
            isOneToOne: false
            referencedRelation: "books"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "po_items_po_id_fkey"
            columns: ["po_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      po_receipt_lines: {
        Row: {
          id: string
          po_item_id: string
          qty_damaged: number
          qty_good: number
          qty_wrong: number
          receipt_id: string
        }
        Insert: {
          id?: string
          po_item_id: string
          qty_damaged?: number
          qty_good?: number
          qty_wrong?: number
          receipt_id: string
        }
        Update: {
          id?: string
          po_item_id?: string
          qty_damaged?: number
          qty_good?: number
          qty_wrong?: number
          receipt_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "po_receipt_lines_po_item_id_fkey"
            columns: ["po_item_id"]
            isOneToOne: false
            referencedRelation: "po_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "po_receipt_lines_receipt_id_fkey"
            columns: ["receipt_id"]
            isOneToOne: false
            referencedRelation: "po_receipts"
            referencedColumns: ["id"]
          },
        ]
      }
      po_receipts: {
        Row: {
          id: string
          notes: string | null
          po_id: string
          received_at: string
          received_by_name: string | null
        }
        Insert: {
          id?: string
          notes?: string | null
          po_id: string
          received_at?: string
          received_by_name?: string | null
        }
        Update: {
          id?: string
          notes?: string | null
          po_id?: string
          received_at?: string
          received_by_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "po_receipts_po_id_fkey"
            columns: ["po_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      po_returns: {
        Row: {
          created_at: string
          created_by_name: string | null
          id: string
          kind: string
          po_item_id: string
          qty: number
          reason: string | null
        }
        Insert: {
          created_at?: string
          created_by_name?: string | null
          id?: string
          kind: string
          po_item_id: string
          qty: number
          reason?: string | null
        }
        Update: {
          created_at?: string
          created_by_name?: string | null
          id?: string
          kind?: string
          po_item_id?: string
          qty?: number
          reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "po_returns_po_item_id_fkey"
            columns: ["po_item_id"]
            isOneToOne: false
            referencedRelation: "po_items"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_orders: {
        Row: {
          close_note: string | null
          closed_at: string | null
          closed_by_name: string | null
          created_at: string
          created_by_name: string | null
          expected_date: string | null
          id: string
          notes: string | null
          number: number
          order_date: string | null
          status: string
          supplier_id: string
          updated_at: string
          year_id: string
        }
        Insert: {
          close_note?: string | null
          closed_at?: string | null
          closed_by_name?: string | null
          created_at?: string
          created_by_name?: string | null
          expected_date?: string | null
          id?: string
          notes?: string | null
          number?: number
          order_date?: string | null
          status?: string
          supplier_id: string
          updated_at?: string
          year_id: string
        }
        Update: {
          close_note?: string | null
          closed_at?: string | null
          closed_by_name?: string | null
          created_at?: string
          created_by_name?: string | null
          expected_date?: string | null
          id?: string
          notes?: string | null
          number?: number
          order_date?: string | null
          status?: string
          supplier_id?: string
          updated_at?: string
          year_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "purchase_orders_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_orders_year_id_fkey"
            columns: ["year_id"]
            isOneToOne: false
            referencedRelation: "academic_years"
            referencedColumns: ["id"]
          },
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
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_super?: boolean
          name?: string
          permissions?: Json
          updated_at?: string
        }
        Relationships: []
      }
      stock_allocations: {
        Row: {
          book_id: string
          id: string
          institution_year_id: string
          qty: number
          updated_at: string
          updated_by_name: string | null
        }
        Insert: {
          book_id: string
          id?: string
          institution_year_id: string
          qty: number
          updated_at?: string
          updated_by_name?: string | null
        }
        Update: {
          book_id?: string
          id?: string
          institution_year_id?: string
          qty?: number
          updated_at?: string
          updated_by_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "stock_allocations_book_id_fkey"
            columns: ["book_id"]
            isOneToOne: false
            referencedRelation: "books"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_allocations_institution_year_id_fkey"
            columns: ["institution_year_id"]
            isOneToOne: false
            referencedRelation: "institution_years"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_movements: {
        Row: {
          book_id: string
          created_at: string
          created_by_name: string | null
          id: number
          institution_year_id: string | null
          kind: string
          order_id: string | null
          po_item_id: string | null
          qty: number
          reason: string | null
        }
        Insert: {
          book_id: string
          created_at?: string
          created_by_name?: string | null
          id?: never
          institution_year_id?: string | null
          kind: string
          order_id?: string | null
          po_item_id?: string | null
          qty: number
          reason?: string | null
        }
        Update: {
          book_id?: string
          created_at?: string
          created_by_name?: string | null
          id?: never
          institution_year_id?: string | null
          kind?: string
          order_id?: string | null
          po_item_id?: string | null
          qty?: number
          reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "stock_movements_book_id_fkey"
            columns: ["book_id"]
            isOneToOne: false
            referencedRelation: "books"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_institution_year_id_fkey"
            columns: ["institution_year_id"]
            isOneToOne: false
            referencedRelation: "institution_years"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_po_item_id_fkey"
            columns: ["po_item_id"]
            isOneToOne: false
            referencedRelation: "po_items"
            referencedColumns: ["id"]
          },
        ]
      }
      supplier_payments: {
        Row: {
          amount: number
          created_at: string
          created_by_name: string | null
          id: string
          method: string
          notes: string | null
          paid_at: string
          reference: string | null
          supplier_id: string
          void_reason: string | null
          voided: boolean
          voided_at: string | null
          voided_by_name: string | null
          year_id: string | null
        }
        Insert: {
          amount: number
          created_at?: string
          created_by_name?: string | null
          id?: string
          method: string
          notes?: string | null
          paid_at?: string
          reference?: string | null
          supplier_id: string
          void_reason?: string | null
          voided?: boolean
          voided_at?: string | null
          voided_by_name?: string | null
          year_id?: string | null
        }
        Update: {
          amount?: number
          created_at?: string
          created_by_name?: string | null
          id?: string
          method?: string
          notes?: string | null
          paid_at?: string
          reference?: string | null
          supplier_id?: string
          void_reason?: string | null
          voided?: boolean
          voided_at?: string | null
          voided_by_name?: string | null
          year_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "supplier_payments_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_payments_year_id_fkey"
            columns: ["year_id"]
            isOneToOne: false
            referencedRelation: "academic_years"
            referencedColumns: ["id"]
          },
        ]
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
        Update: {
          address?: string | null
          contact_name?: string | null
          created_at?: string
          email?: string | null
          id?: string
          is_active?: boolean
          lead_time_days?: number | null
          name?: string
          notes?: string | null
          number?: number
          payment_terms?: string | null
          phone?: string | null
          phone2?: string | null
          updated_at?: string
        }
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
        Update: {
          created_at?: string
          email?: string | null
          full_name?: string
          id?: string
          is_active?: boolean
          permission_overrides?: Json
          role_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_profiles_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      _copy_institution_year_content: {
        Args: {
          p_refresh_prices: boolean
          p_shift_days: number
          p_source_iy: string
          p_target_iy: string
        }
        Returns: number
      }
      adjust_stock: {
        Args: {
          p_book: string
          p_kind: string
          p_qty: number
          p_reason: string
        }
        Returns: undefined
      }
      assert_can_grant: { Args: { perms: Json }; Returns: undefined }
      assign_bags_to_delivery: {
        Args: { p_bags: string[]; p_delivery: string; p_remove?: boolean }
        Returns: number
      }
      bag_labels: { Args: { p_bags: string[] }; Returns: Json }
      book_allocated: { Args: { p_book: string }; Returns: number }
      book_on_hand: { Args: { p_book: string }; Returns: number }
      copy_class: {
        Args: {
          p_name: string
          p_source_class: string
          p_target_institution_year: string
        }
        Returns: string
      }
      copy_class_books: {
        Args: {
          p_replace?: boolean
          p_source_class: string
          p_target_class: string
        }
        Returns: number
      }
      copy_institution: {
        Args: {
          p_new_name: string
          p_new_number?: number
          p_source_iy: string
          p_target_year?: string
        }
        Returns: string
      }
      copy_institution_to_year: {
        Args: {
          p_refresh_prices?: boolean
          p_source_iy: string
          p_target_year: string
        }
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
          p_copied_from?: string
          p_customer_id: string
          p_delivery?: string
          p_discount?: number
          p_discount_reason?: string
          p_items: Json
          p_notes?: string
          p_source?: string
          p_student_id?: string
          p_student_name: string
        }
        Returns: string
      }
      create_purchase_order: {
        Args: {
          p_expected?: string
          p_items: Json
          p_notes?: string
          p_supplier: string
          p_year: string
        }
        Returns: string
      }
      dashboard_stats: { Args: { p_year: string }; Returns: Json }
      delivery_report: { Args: { p_delivery: string }; Returns: Json }
      demand_by_institution: {
        Args: { p_year: string }
        Returns: {
          allocated: number
          book_id: string
          demand: number
          institution_year_id: string
          ordered: number
          ordered_draft: number
          supplier_id: string
        }[]
      }
      finance_summary: { Args: { p_year: string }; Returns: Json }
      find_orders_for_pickup: {
        Args: { p_query: string; p_year: string }
        Returns: {
          bags_delivered: number
          bags_open: number
          bags_ready: number
          balance: number
          class_name: string
          customer_name: string
          customer_phone: string
          inst_name: string
          order_id: string
          order_number: number
          order_status: string
          student_name: string
        }[]
      }
      has_permission: { Args: { p: string }; Returns: boolean }
      institution_finance: {
        Args: { p_year: string }
        Returns: {
          delivered_orders: number
          inst_name: string
          institution_year_id: string
          open_debt: number
          orders_count: number
          paid: number
          sales_total: number
        }[]
      }
      is_active_user: { Args: never; Returns: boolean }
      is_super_user: { Args: never; Returns: boolean }
      israel_today: { Args: never; Returns: string }
      item_packed: { Args: { p_item: string }; Returns: number }
      mark_labels_printed: { Args: { p_bags: string[] }; Returns: undefined }
      my_access: { Args: never; Returns: Json }
      my_full_name: { Args: never; Returns: string }
      my_role_id: { Args: never; Returns: string }
      order_pack_details: { Args: { p_order: string }; Returns: Json }
      order_packed_qty: { Args: { p_order: string }; Returns: number }
      order_status_label: { Args: { s: string }; Returns: string }
      pack_availability: {
        Args: { p_year: string }
        Returns: {
          allocated: number
          book_id: string
          institution_year_id: string
          packed_open: number
        }[]
      }
      packed_open: {
        Args: { p_book: string; p_except_bag?: string; p_iy: string }
        Returns: number
      }
      packing_queue: {
        Args: { p_year: string }
        Returns: {
          bags_open: number
          bags_ready: number
          balance: number
          class_name: string
          customer_name: string
          delivery_method: string
          inst_name: string
          institution_year_id: string
          order_id: string
          order_number: number
          order_status: string
          qty_delivered: number
          qty_packed: number
          qty_total: number
          student_name: string
        }[]
      }
      payment_method_label: { Args: { m: string }; Returns: string }
      permission_state: { Args: { p: string }; Returns: string }
      po_status_label: { Args: { s: string }; Returns: string }
      receive_po: {
        Args: { p_lines: Json; p_notes?: string; p_po: string }
        Returns: string
      }
      record_payment: {
        Args: {
          p_amount: number
          p_date?: string
          p_method: string
          p_notes?: string
          p_order: string
          p_reference?: string
        }
        Returns: string
      }
      record_supplier_payment: {
        Args: {
          p_amount: number
          p_date?: string
          p_method: string
          p_notes?: string
          p_reference?: string
          p_supplier: string
          p_year?: string
        }
        Returns: string
      }
      refund_payment: {
        Args: {
          p_amount: number
          p_date?: string
          p_method: string
          p_notes?: string
          p_order: string
          p_reference?: string
        }
        Returns: string
      }
      require_any_permission: { Args: { p: string[] }; Returns: undefined }
      require_permission: { Args: { p: string }; Returns: undefined }
      return_to_supplier: {
        Args: {
          p_kind: string
          p_po_item: string
          p_qty: number
          p_reason?: string
        }
        Returns: undefined
      }
      save_bag: {
        Args: {
          p_bag?: string
          p_lines: Json
          p_notes?: string
          p_order: string
        }
        Returns: string
      }
      save_delivery: {
        Args: {
          p_boxes?: number
          p_carrier?: string
          p_cost?: number
          p_date?: string
          p_delivery?: string
          p_iy: string
          p_notes?: string
          p_paid_by?: string
        }
        Returns: string
      }
      set_allocation: {
        Args: { p_book: string; p_iy: string; p_qty: number }
        Returns: undefined
      }
      set_bag_status: {
        Args: { p_bag: string; p_received_by?: string; p_status: string }
        Returns: undefined
      }
      set_delivery_status: {
        Args: { p_delivery: string; p_receiver?: string; p_status: string }
        Returns: undefined
      }
      set_po_status: {
        Args: { p_note?: string; p_po: string; p_status: string }
        Returns: undefined
      }
      stock_levels: {
        Args: never
        Returns: {
          allocated: number
          book_id: string
          in_draft: number
          on_hand: number
          on_order: number
        }[]
      }
      supplier_balances: {
        Args: { p_year?: string }
        Returns: {
          balance: number
          missing_cost_items: number
          paid: number
          received_value: number
          supplier_id: string
        }[]
      }
      sync_order_from_bags: { Args: { p_order: string }; Returns: undefined }
      transfer_credit: {
        Args: {
          p_amount: number
          p_from_order: string
          p_notes?: string
          p_to_order: string
        }
        Returns: undefined
      }
      void_payment: {
        Args: { p_payment: string; p_reason: string }
        Returns: undefined
      }
      void_supplier_payment: {
        Args: { p_payment: string; p_reason: string }
        Returns: undefined
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}
