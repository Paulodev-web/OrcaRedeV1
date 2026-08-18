export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.15"
  }
  public: {
    Tables: {
      budget_folders: {
        Row: {
          color: string | null
          created_at: string | null
          id: string
          name: string
          org_id: string
          parent_id: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          color?: string | null
          created_at?: string | null
          id?: string
          name: string
          org_id?: string
          parent_id?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          color?: string | null
          created_at?: string | null
          id?: string
          name?: string
          org_id?: string
          parent_id?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "budget_folders_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "budget_folders_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "budget_folders"
            referencedColumns: ["id"]
          },
        ]
      }
      budget_posts: {
        Row: {
          budget_id: string
          counter: number
          created_at: string | null
          custom_name: string | null
          id: string
          name: string | null
          org_id: string
          pole_standard_id: string | null
          post_type_id: string
          segment_id: string | null
          x_coord: number
          y_coord: number
        }
        Insert: {
          budget_id: string
          counter?: number
          created_at?: string | null
          custom_name?: string | null
          id?: string
          name?: string | null
          org_id: string
          pole_standard_id?: string | null
          post_type_id: string
          segment_id?: string | null
          x_coord: number
          y_coord: number
        }
        Update: {
          budget_id?: string
          counter?: number
          created_at?: string | null
          custom_name?: string | null
          id?: string
          name?: string | null
          org_id?: string
          pole_standard_id?: string | null
          post_type_id?: string
          segment_id?: string | null
          x_coord?: number
          y_coord?: number
        }
        Relationships: [
          {
            foreignKeyName: "budget_posts_budget_id_fkey"
            columns: ["budget_id"]
            isOneToOne: false
            referencedRelation: "budgets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "budget_posts_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "budget_posts_pole_standard_id_fkey"
            columns: ["pole_standard_id"]
            isOneToOne: false
            referencedRelation: "pole_standards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "budget_posts_post_type_id_fkey"
            columns: ["post_type_id"]
            isOneToOne: false
            referencedRelation: "post_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "budget_posts_segment_id_fkey"
            columns: ["segment_id"]
            isOneToOne: false
            referencedRelation: "work_segments"
            referencedColumns: ["id"]
          },
        ]
      }
      budgets: {
        Row: {
          city: string | null
          client_name: string | null
          company_id: string | null
          created_at: string | null
          extra_cost_items: Json
          folder_id: string | null
          id: string
          is_template: boolean
          org_id: string
          plan_image_url: string | null
          plantas: Json | null
          profit_margin_percent: number
          project_name: string
          render_version: number
          status: string
          template_source_id: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          city?: string | null
          client_name?: string | null
          company_id?: string | null
          created_at?: string | null
          extra_cost_items?: Json
          folder_id?: string | null
          id?: string
          is_template?: boolean
          org_id?: string
          plan_image_url?: string | null
          plantas?: Json | null
          profit_margin_percent?: number
          project_name: string
          render_version?: number
          status?: string
          template_source_id?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          city?: string | null
          client_name?: string | null
          company_id?: string | null
          created_at?: string | null
          extra_cost_items?: Json
          folder_id?: string | null
          id?: string
          is_template?: boolean
          org_id?: string
          plan_image_url?: string | null
          plantas?: Json | null
          profit_margin_percent?: number
          project_name?: string
          render_version?: number
          status?: string
          template_source_id?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "budgets_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "utility_companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "budgets_folder_id_fkey"
            columns: ["folder_id"]
            isOneToOne: false
            referencedRelation: "budget_folders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "budgets_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "budgets_template_source_id_fkey"
            columns: ["template_source_id"]
            isOneToOne: false
            referencedRelation: "budgets"
            referencedColumns: ["id"]
          },
        ]
      }
      checklist_template_items: {
        Row: {
          created_at: string
          description: string | null
          id: string
          label: string
          order_index: number
          requires_photo: boolean
          template_id: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          label: string
          order_index: number
          requires_photo?: boolean
          template_id: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          label?: string
          order_index?: number
          requires_photo?: boolean
          template_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "checklist_template_items_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "checklist_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      checklist_templates: {
        Row: {
          created_at: string
          description: string | null
          engineer_id: string
          id: string
          is_active: boolean
          is_default: boolean
          name: string
          org_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          engineer_id: string
          id?: string
          is_active?: boolean
          is_default?: boolean
          name: string
          org_id?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          engineer_id?: string
          id?: string
          is_active?: boolean
          is_default?: boolean
          name?: string
          org_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "checklist_templates_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      company_settings: {
        Row: {
          address: string | null
          cnpj: string | null
          created_at: string
          email: string | null
          id: string
          instagram: string | null
          legal_name: string
          logo_storage_path: string | null
          logo_url: string | null
          org_id: string
          phone_primary: string | null
          phone_secondary: string | null
          trade_name: string | null
          updated_at: string
          user_id: string
          website: string | null
          whatsapp_number: string | null
        }
        Insert: {
          address?: string | null
          cnpj?: string | null
          created_at?: string
          email?: string | null
          id?: string
          instagram?: string | null
          legal_name?: string
          logo_storage_path?: string | null
          logo_url?: string | null
          org_id?: string
          phone_primary?: string | null
          phone_secondary?: string | null
          trade_name?: string | null
          updated_at?: string
          user_id?: string
          website?: string | null
          whatsapp_number?: string | null
        }
        Update: {
          address?: string | null
          cnpj?: string | null
          created_at?: string
          email?: string | null
          id?: string
          instagram?: string | null
          legal_name?: string
          logo_storage_path?: string | null
          logo_url?: string | null
          org_id?: string
          phone_primary?: string | null
          phone_secondary?: string | null
          trade_name?: string | null
          updated_at?: string
          user_id?: string
          website?: string | null
          whatsapp_number?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "company_settings_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      crew_members: {
        Row: {
          created_at: string
          document_id: string | null
          full_name: string
          id: string
          is_active: boolean
          notes: string | null
          org_id: string
          owner_id: string
          phone: string | null
          role: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          document_id?: string | null
          full_name: string
          id?: string
          is_active?: boolean
          notes?: string | null
          org_id?: string
          owner_id: string
          phone?: string | null
          role?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          document_id?: string | null
          full_name?: string
          id?: string
          is_active?: boolean
          notes?: string | null
          org_id?: string
          owner_id?: string
          phone?: string | null
          role?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "crew_members_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      device_tokens: {
        Row: {
          created_at: string
          id: string
          last_seen_at: string | null
          platform: string | null
          token: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          last_seen_at?: string | null
          platform?: string | null
          token: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          last_seen_at?: string | null
          platform?: string | null
          token?: string
          user_id?: string
        }
        Relationships: []
      }
      dre_actuals: {
        Row: {
          competencia: string
          created_at: string
          descricao: string
          dre_id: string
          grupo: Database["public"]["Enums"]["dre_group"]
          id: string
          notes: string | null
          org_id: string
          updated_at: string
          user_id: string
          valor: number
        }
        Insert: {
          competencia?: string
          created_at?: string
          descricao: string
          dre_id: string
          grupo: Database["public"]["Enums"]["dre_group"]
          id?: string
          notes?: string | null
          org_id?: string
          updated_at?: string
          user_id?: string
          valor: number
        }
        Update: {
          competencia?: string
          created_at?: string
          descricao?: string
          dre_id?: string
          grupo?: Database["public"]["Enums"]["dre_group"]
          id?: string
          notes?: string | null
          org_id?: string
          updated_at?: string
          user_id?: string
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "dre_actuals_dre_id_fkey"
            columns: ["dre_id"]
            isOneToOne: false
            referencedRelation: "work_dre"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dre_actuals_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      dre_group_status: {
        Row: {
          dre_id: string
          fechado: boolean
          fechado_em: string | null
          fechado_por: string | null
          grupo: Database["public"]["Enums"]["dre_group"]
        }
        Insert: {
          dre_id: string
          fechado?: boolean
          fechado_em?: string | null
          fechado_por?: string | null
          grupo: Database["public"]["Enums"]["dre_group"]
        }
        Update: {
          dre_id?: string
          fechado?: boolean
          fechado_em?: string | null
          fechado_por?: string | null
          grupo?: Database["public"]["Enums"]["dre_group"]
        }
        Relationships: [
          {
            foreignKeyName: "dre_group_status_dre_id_fkey"
            columns: ["dre_id"]
            isOneToOne: false
            referencedRelation: "work_dre"
            referencedColumns: ["id"]
          },
        ]
      }
      extraction_jobs: {
        Row: {
          created_at: string
          error_message: string | null
          estimated_time: number | null
          file_path: string
          finished_at: string | null
          id: string
          last_dispatch_at: string | null
          match_batch_index: number
          match_total_batches: number | null
          org_id: string
          pipeline_context: Json | null
          pipeline_phase: string | null
          quote_id: string | null
          session_id: string
          started_at: string | null
          status: string
          supplier_id: string | null
          supplier_name: string | null
          updated_at: string
          user_id: string
          watchdog_attempts: number
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          estimated_time?: number | null
          file_path: string
          finished_at?: string | null
          id?: string
          last_dispatch_at?: string | null
          match_batch_index?: number
          match_total_batches?: number | null
          org_id?: string
          pipeline_context?: Json | null
          pipeline_phase?: string | null
          quote_id?: string | null
          session_id: string
          started_at?: string | null
          status?: string
          supplier_id?: string | null
          supplier_name?: string | null
          updated_at?: string
          user_id?: string
          watchdog_attempts?: number
        }
        Update: {
          created_at?: string
          error_message?: string | null
          estimated_time?: number | null
          file_path?: string
          finished_at?: string | null
          id?: string
          last_dispatch_at?: string | null
          match_batch_index?: number
          match_total_batches?: number | null
          org_id?: string
          pipeline_context?: Json | null
          pipeline_phase?: string | null
          quote_id?: string | null
          session_id?: string
          started_at?: string | null
          status?: string
          supplier_id?: string | null
          supplier_name?: string | null
          updated_at?: string
          user_id?: string
          watchdog_attempts?: number
        }
        Relationships: [
          {
            foreignKeyName: "extraction_jobs_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "extraction_jobs_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "supplier_price_history"
            referencedColumns: ["quote_id"]
          },
          {
            foreignKeyName: "extraction_jobs_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "supplier_quotes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "extraction_jobs_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "quotation_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "extraction_jobs_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      finalized_budget_items: {
        Row: {
          code: string | null
          description: string | null
          finalized_budget_id: string
          id: string
          item_type: string
          name: string
          quantity: number
          total_price: number
          unit: string | null
          unit_price: number
        }
        Insert: {
          code?: string | null
          description?: string | null
          finalized_budget_id: string
          id?: string
          item_type: string
          name: string
          quantity: number
          total_price: number
          unit?: string | null
          unit_price: number
        }
        Update: {
          code?: string | null
          description?: string | null
          finalized_budget_id?: string
          id?: string
          item_type?: string
          name?: string
          quantity?: number
          total_price?: number
          unit?: string | null
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "finalized_budget_items_finalized_budget_id_fkey"
            columns: ["finalized_budget_id"]
            isOneToOne: false
            referencedRelation: "finalized_budgets"
            referencedColumns: ["id"]
          },
        ]
      }
      finalized_budgets: {
        Row: {
          city: string | null
          client_name: string | null
          finalized_at: string | null
          id: string
          org_id: string
          original_created_at: string | null
          plan_image_url: string | null
          project_name: string
          status: string
          total_cost: number
          user_id: string | null
        }
        Insert: {
          city?: string | null
          client_name?: string | null
          finalized_at?: string | null
          id: string
          org_id?: string
          original_created_at?: string | null
          plan_image_url?: string | null
          project_name: string
          status?: string
          total_cost: number
          user_id?: string | null
        }
        Update: {
          city?: string | null
          client_name?: string | null
          finalized_at?: string | null
          id?: string
          org_id?: string
          original_created_at?: string | null
          plan_image_url?: string | null
          project_name?: string
          status?: string
          total_cost?: number
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "finalized_budgets_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      item_group_templates: {
        Row: {
          company_id: string
          created_at: string | null
          description: string | null
          id: string
          name: string
          org_id: string
          user_id: string
        }
        Insert: {
          company_id: string
          created_at?: string | null
          description?: string | null
          id?: string
          name: string
          org_id?: string
          user_id?: string
        }
        Update: {
          company_id?: string
          created_at?: string | null
          description?: string | null
          id?: string
          name?: string
          org_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "item_group_templates_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "utility_companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "item_group_templates_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      material_subgroups: {
        Row: {
          created_at: string
          id: string
          name: string
          org_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          org_id?: string
          user_id?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          org_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "material_subgroups_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      materials: {
        Row: {
          active_in_supplies: boolean
          code: string | null
          created_at: string | null
          description: string | null
          embedding: string | null
          id: string
          name: string
          org_id: string
          price: number
          price_source_quote_id: string | null
          price_source_session_id: string | null
          price_source_supplier_id: string | null
          price_source_supplier_name: string | null
          price_source_updated_at: string | null
          subgroup: string | null
          subgroup_id: string | null
          unit: string
          user_id: string
        }
        Insert: {
          active_in_supplies?: boolean
          code?: string | null
          created_at?: string | null
          description?: string | null
          embedding?: string | null
          id?: string
          name: string
          org_id?: string
          price: number
          price_source_quote_id?: string | null
          price_source_session_id?: string | null
          price_source_supplier_id?: string | null
          price_source_supplier_name?: string | null
          price_source_updated_at?: string | null
          subgroup?: string | null
          subgroup_id?: string | null
          unit: string
          user_id?: string
        }
        Update: {
          active_in_supplies?: boolean
          code?: string | null
          created_at?: string | null
          description?: string | null
          embedding?: string | null
          id?: string
          name?: string
          org_id?: string
          price?: number
          price_source_quote_id?: string | null
          price_source_session_id?: string | null
          price_source_supplier_id?: string | null
          price_source_supplier_name?: string | null
          price_source_updated_at?: string | null
          subgroup?: string | null
          subgroup_id?: string | null
          unit?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "materials_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "materials_price_source_quote_id_fkey"
            columns: ["price_source_quote_id"]
            isOneToOne: false
            referencedRelation: "supplier_price_history"
            referencedColumns: ["quote_id"]
          },
          {
            foreignKeyName: "materials_price_source_quote_id_fkey"
            columns: ["price_source_quote_id"]
            isOneToOne: false
            referencedRelation: "supplier_quotes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "materials_price_source_session_id_fkey"
            columns: ["price_source_session_id"]
            isOneToOne: false
            referencedRelation: "quotation_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "materials_price_source_supplier_id_fkey"
            columns: ["price_source_supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "materials_subgroup_id_fkey"
            columns: ["subgroup_id"]
            isOneToOne: false
            referencedRelation: "material_subgroups"
            referencedColumns: ["id"]
          },
        ]
      }
      media_library: {
        Row: {
          caption: string | null
          created_at: string
          file_size: number | null
          height: number | null
          id: string
          mime_type: string | null
          org_id: string
          source: string
          storage_path: string | null
          taken_at: string | null
          title: string | null
          updated_at: string
          url: string
          user_id: string
          width: number | null
          work_id: string | null
        }
        Insert: {
          caption?: string | null
          created_at?: string
          file_size?: number | null
          height?: number | null
          id?: string
          mime_type?: string | null
          org_id?: string
          source?: string
          storage_path?: string | null
          taken_at?: string | null
          title?: string | null
          updated_at?: string
          url: string
          user_id?: string
          width?: number | null
          work_id?: string | null
        }
        Update: {
          caption?: string | null
          created_at?: string
          file_size?: number | null
          height?: number | null
          id?: string
          mime_type?: string | null
          org_id?: string
          source?: string
          storage_path?: string | null
          taken_at?: string | null
          title?: string | null
          updated_at?: string
          url?: string
          user_id?: string
          width?: number | null
          work_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "media_library_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "media_library_work_id_fkey"
            columns: ["work_id"]
            isOneToOne: false
            referencedRelation: "works"
            referencedColumns: ["id"]
          },
        ]
      }
      media_library_tags: {
        Row: {
          created_at: string
          media_id: string
          org_id: string
          tag_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          media_id: string
          org_id?: string
          tag_id: string
          user_id?: string
        }
        Update: {
          created_at?: string
          media_id?: string
          org_id?: string
          tag_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "media_library_tags_media_id_fkey"
            columns: ["media_id"]
            isOneToOne: false
            referencedRelation: "media_library"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "media_library_tags_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "media_library_tags_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "media_tags"
            referencedColumns: ["id"]
          },
        ]
      }
      media_tags: {
        Row: {
          created_at: string
          id: string
          name: string
          org_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          org_id?: string
          user_id?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          org_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "media_tags_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      module_permissions: {
        Row: {
          can_edit: boolean
          can_view: boolean
          created_at: string
          granted_by: string | null
          id: string
          module_key: string
          org_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          can_edit?: boolean
          can_view?: boolean
          created_at?: string
          granted_by?: string | null
          id?: string
          module_key: string
          org_id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          can_edit?: boolean
          can_view?: boolean
          created_at?: string
          granted_by?: string | null
          id?: string
          module_key?: string
          org_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "module_permissions_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          body: string | null
          created_at: string
          entity_id: string | null
          entity_type: string | null
          id: string
          is_read: boolean
          kind: string
          link_path: string | null
          module_key: string | null
          title: string
          user_id: string
          work_id: string | null
        }
        Insert: {
          body?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          is_read?: boolean
          kind: string
          link_path?: string | null
          module_key?: string | null
          title: string
          user_id: string
          work_id?: string | null
        }
        Update: {
          body?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          is_read?: boolean
          kind?: string
          link_path?: string | null
          module_key?: string | null
          title?: string
          user_id?: string
          work_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "notifications_work_id_fkey"
            columns: ["work_id"]
            isOneToOne: false
            referencedRelation: "works"
            referencedColumns: ["id"]
          },
        ]
      }
      org_members: {
        Row: {
          created_at: string
          id: string
          invited_by: string | null
          is_active: boolean
          org_id: string
          role: string
          sector: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          invited_by?: string | null
          is_active?: boolean
          org_id: string
          role?: string
          sector?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          invited_by?: string | null
          is_active?: boolean
          org_id?: string
          role?: string
          sector?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "org_members_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          cnpj: string | null
          created_at: string
          id: string
          is_active: boolean
          name: string
          slug: string
          updated_at: string
        }
        Insert: {
          cnpj?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          slug: string
          updated_at?: string
        }
        Update: {
          cnpj?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
      platform_admins: {
        Row: {
          granted_at: string
          granted_by: string | null
          note: string | null
          user_id: string
        }
        Insert: {
          granted_at?: string
          granted_by?: string | null
          note?: string | null
          user_id: string
        }
        Update: {
          granted_at?: string
          granted_by?: string | null
          note?: string | null
          user_id?: string
        }
        Relationships: []
      }
      pole_standard_companies: {
        Row: {
          company_id: string
          pole_standard_id: string
        }
        Insert: {
          company_id: string
          pole_standard_id: string
        }
        Update: {
          company_id?: string
          pole_standard_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pole_standard_companies_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "utility_companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pole_standard_companies_pole_standard_id_fkey"
            columns: ["pole_standard_id"]
            isOneToOne: false
            referencedRelation: "pole_standards"
            referencedColumns: ["id"]
          },
        ]
      }
      pole_standard_groups: {
        Row: {
          pole_standard_id: string
          quantity: number
          template_id: string
        }
        Insert: {
          pole_standard_id: string
          quantity?: number
          template_id: string
        }
        Update: {
          pole_standard_id?: string
          quantity?: number
          template_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pole_standard_groups_pole_standard_id_fkey"
            columns: ["pole_standard_id"]
            isOneToOne: false
            referencedRelation: "pole_standards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pole_standard_groups_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "item_group_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      pole_standard_materials: {
        Row: {
          material_id: string
          pole_standard_id: string
          quantity: number
        }
        Insert: {
          material_id: string
          pole_standard_id: string
          quantity?: number
        }
        Update: {
          material_id?: string
          pole_standard_id?: string
          quantity?: number
        }
        Relationships: [
          {
            foreignKeyName: "pole_standard_materials_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "materials"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pole_standard_materials_pole_standard_id_fkey"
            columns: ["pole_standard_id"]
            isOneToOne: false
            referencedRelation: "pole_standards"
            referencedColumns: ["id"]
          },
        ]
      }
      pole_standards: {
        Row: {
          created_at: string
          description: string | null
          id: string
          name: string
          org_id: string
          post_type_id: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          name: string
          org_id?: string
          post_type_id?: string | null
          user_id?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          org_id?: string
          post_type_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pole_standards_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pole_standards_post_type_id_fkey"
            columns: ["post_type_id"]
            isOneToOne: false
            referencedRelation: "post_types"
            referencedColumns: ["id"]
          },
        ]
      }
      post_connections: {
        Row: {
          cable_type: string | null
          client_id: string | null
          connection_type: string | null
          created_at: string | null
          from_post_id: string
          id: string
          installation_date: string | null
          length_meters: number | null
          status: string | null
          to_post_id: string
          tracking_id: string
        }
        Insert: {
          cable_type?: string | null
          client_id?: string | null
          connection_type?: string | null
          created_at?: string | null
          from_post_id: string
          id?: string
          installation_date?: string | null
          length_meters?: number | null
          status?: string | null
          to_post_id: string
          tracking_id: string
        }
        Update: {
          cable_type?: string | null
          client_id?: string | null
          connection_type?: string | null
          created_at?: string | null
          from_post_id?: string
          id?: string
          installation_date?: string | null
          length_meters?: number | null
          status?: string | null
          to_post_id?: string
          tracking_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "post_connections_from_post_id_fkey"
            columns: ["from_post_id"]
            isOneToOne: false
            referencedRelation: "tracked_posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "post_connections_to_post_id_fkey"
            columns: ["to_post_id"]
            isOneToOne: false
            referencedRelation: "tracked_posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "post_connections_tracking_id_fkey"
            columns: ["tracking_id"]
            isOneToOne: false
            referencedRelation: "work_trackings"
            referencedColumns: ["id"]
          },
        ]
      }
      post_item_group_materials: {
        Row: {
          material_id: string
          org_id: string
          post_item_group_id: string
          price_at_addition: number
          quantity: number
        }
        Insert: {
          material_id: string
          org_id: string
          post_item_group_id: string
          price_at_addition: number
          quantity: number
        }
        Update: {
          material_id?: string
          org_id?: string
          post_item_group_id?: string
          price_at_addition?: number
          quantity?: number
        }
        Relationships: [
          {
            foreignKeyName: "post_item_group_materials_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "materials"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "post_item_group_materials_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "post_item_group_materials_post_item_group_id_fkey"
            columns: ["post_item_group_id"]
            isOneToOne: false
            referencedRelation: "post_item_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      post_item_groups: {
        Row: {
          budget_post_id: string
          id: string
          name: string
          org_id: string
          pole_standard_id: string | null
          segment_id: string | null
          template_id: string | null
        }
        Insert: {
          budget_post_id: string
          id?: string
          name: string
          org_id: string
          pole_standard_id?: string | null
          segment_id?: string | null
          template_id?: string | null
        }
        Update: {
          budget_post_id?: string
          id?: string
          name?: string
          org_id?: string
          pole_standard_id?: string | null
          segment_id?: string | null
          template_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "post_item_groups_budget_post_id_fkey"
            columns: ["budget_post_id"]
            isOneToOne: false
            referencedRelation: "budget_posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "post_item_groups_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "post_item_groups_pole_standard_id_fkey"
            columns: ["pole_standard_id"]
            isOneToOne: false
            referencedRelation: "pole_standards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "post_item_groups_segment_id_fkey"
            columns: ["segment_id"]
            isOneToOne: false
            referencedRelation: "work_segments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "post_item_groups_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "item_group_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      post_materials: {
        Row: {
          id: string
          material_id: string
          org_id: string
          pole_standard_id: string | null
          post_id: string
          price_at_addition: number
          quantity: number
        }
        Insert: {
          id?: string
          material_id: string
          org_id: string
          pole_standard_id?: string | null
          post_id: string
          price_at_addition: number
          quantity: number
        }
        Update: {
          id?: string
          material_id?: string
          org_id?: string
          pole_standard_id?: string | null
          post_id?: string
          price_at_addition?: number
          quantity?: number
        }
        Relationships: [
          {
            foreignKeyName: "post_materials_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "materials"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "post_materials_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "post_materials_pole_standard_id_fkey"
            columns: ["pole_standard_id"]
            isOneToOne: false
            referencedRelation: "pole_standards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "post_materials_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "budget_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      post_types: {
        Row: {
          code: string | null
          created_at: string | null
          description: string | null
          height_m: number | null
          id: string
          material_id: string | null
          name: string
          org_id: string
          price: number
          shape: string | null
          user_id: string
        }
        Insert: {
          code?: string | null
          created_at?: string | null
          description?: string | null
          height_m?: number | null
          id?: string
          material_id?: string | null
          name: string
          org_id?: string
          price: number
          shape?: string | null
          user_id?: string
        }
        Update: {
          code?: string | null
          created_at?: string | null
          description?: string | null
          height_m?: number | null
          id?: string
          material_id?: string | null
          name?: string
          org_id?: string
          price?: number
          shape?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "post_types_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "materials"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "post_types_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          active_org_id: string | null
          created_at: string
          created_by: string | null
          email: string | null
          full_name: string
          id: string
          is_active: boolean
          phone: string | null
          role: string
          updated_at: string
        }
        Insert: {
          active_org_id?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          full_name?: string
          id: string
          is_active?: boolean
          phone?: string | null
          role: string
          updated_at?: string
        }
        Update: {
          active_org_id?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          full_name?: string
          id?: string
          is_active?: boolean
          phone?: string | null
          role?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_active_org_id_fkey"
            columns: ["active_org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      proposal_abc_rows: {
        Row: {
          amount: number
          created_at: string
          curve: string
          id: string
          label: string
          order_index: number
          percent: number
          proposal_id: string
          updated_at: string
        }
        Insert: {
          amount?: number
          created_at?: string
          curve: string
          id?: string
          label: string
          order_index?: number
          percent?: number
          proposal_id: string
          updated_at?: string
        }
        Update: {
          amount?: number
          created_at?: string
          curve?: string
          id?: string
          label?: string
          order_index?: number
          percent?: number
          proposal_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "proposal_abc_rows_proposal_id_fkey"
            columns: ["proposal_id"]
            isOneToOne: false
            referencedRelation: "proposals"
            referencedColumns: ["id"]
          },
        ]
      }
      proposal_media: {
        Row: {
          caption: string | null
          created_at: string
          group_label: string | null
          id: string
          media_id: string | null
          order_index: number
          proposal_id: string
          section_key: string
          updated_at: string
          url: string
        }
        Insert: {
          caption?: string | null
          created_at?: string
          group_label?: string | null
          id?: string
          media_id?: string | null
          order_index?: number
          proposal_id: string
          section_key: string
          updated_at?: string
          url: string
        }
        Update: {
          caption?: string | null
          created_at?: string
          group_label?: string | null
          id?: string
          media_id?: string | null
          order_index?: number
          proposal_id?: string
          section_key?: string
          updated_at?: string
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "proposal_media_media_id_fkey"
            columns: ["media_id"]
            isOneToOne: false
            referencedRelation: "media_library"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proposal_media_proposal_id_fkey"
            columns: ["proposal_id"]
            isOneToOne: false
            referencedRelation: "proposals"
            referencedColumns: ["id"]
          },
        ]
      }
      proposal_payment_terms: {
        Row: {
          amount: number
          created_at: string
          due_date: string | null
          due_label: string
          id: string
          order_index: number
          percent: number
          pricing_option_id: string
          proposal_id: string
          updated_at: string
        }
        Insert: {
          amount?: number
          created_at?: string
          due_date?: string | null
          due_label: string
          id?: string
          order_index?: number
          percent?: number
          pricing_option_id: string
          proposal_id: string
          updated_at?: string
        }
        Update: {
          amount?: number
          created_at?: string
          due_date?: string | null
          due_label?: string
          id?: string
          order_index?: number
          percent?: number
          pricing_option_id?: string
          proposal_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "proposal_payment_terms_pricing_option_id_fkey"
            columns: ["pricing_option_id"]
            isOneToOne: false
            referencedRelation: "proposal_pricing_options"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proposal_payment_terms_proposal_id_fkey"
            columns: ["proposal_id"]
            isOneToOne: false
            referencedRelation: "proposals"
            referencedColumns: ["id"]
          },
        ]
      }
      proposal_pricing_options: {
        Row: {
          amount_per_unit: number | null
          created_at: string
          grand_total: number
          id: string
          is_recommended: boolean
          label: string
          labor_total: number
          material_total: number
          order_index: number
          proposal_id: string
          saved_pricing_budget_id: string | null
          units_count: number | null
          units_label: string | null
          updated_at: string
        }
        Insert: {
          amount_per_unit?: number | null
          created_at?: string
          grand_total?: number
          id?: string
          is_recommended?: boolean
          label: string
          labor_total?: number
          material_total?: number
          order_index?: number
          proposal_id: string
          saved_pricing_budget_id?: string | null
          units_count?: number | null
          units_label?: string | null
          updated_at?: string
        }
        Update: {
          amount_per_unit?: number | null
          created_at?: string
          grand_total?: number
          id?: string
          is_recommended?: boolean
          label?: string
          labor_total?: number
          material_total?: number
          order_index?: number
          proposal_id?: string
          saved_pricing_budget_id?: string | null
          units_count?: number | null
          units_label?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "proposal_pricing_options_proposal_id_fkey"
            columns: ["proposal_id"]
            isOneToOne: false
            referencedRelation: "proposals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proposal_pricing_options_saved_pricing_budget_id_fkey"
            columns: ["saved_pricing_budget_id"]
            isOneToOne: false
            referencedRelation: "saved_pricing_budgets"
            referencedColumns: ["id"]
          },
        ]
      }
      proposal_responsibility_items: {
        Row: {
          created_at: string
          description: string
          id: string
          order_index: number
          proposal_id: string
          responsible: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description: string
          id?: string
          order_index?: number
          proposal_id: string
          responsible: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string
          id?: string
          order_index?: number
          proposal_id?: string
          responsible?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "proposal_responsibility_items_proposal_id_fkey"
            columns: ["proposal_id"]
            isOneToOne: false
            referencedRelation: "proposals"
            referencedColumns: ["id"]
          },
        ]
      }
      proposal_schedule_rows: {
        Row: {
          created_at: string
          id: string
          marks: Json
          order_index: number
          proposal_id: string
          stage: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          marks?: Json
          order_index?: number
          proposal_id: string
          stage: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          marks?: Json
          order_index?: number
          proposal_id?: string
          stage?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "proposal_schedule_rows_proposal_id_fkey"
            columns: ["proposal_id"]
            isOneToOne: false
            referencedRelation: "proposals"
            referencedColumns: ["id"]
          },
        ]
      }
      proposal_sections: {
        Row: {
          content: Json | null
          created_at: string
          enabled: boolean
          id: string
          order_index: number
          proposal_id: string
          section_key: string
          title: string
          updated_at: string
        }
        Insert: {
          content?: Json | null
          created_at?: string
          enabled?: boolean
          id?: string
          order_index?: number
          proposal_id: string
          section_key: string
          title: string
          updated_at?: string
        }
        Update: {
          content?: Json | null
          created_at?: string
          enabled?: boolean
          id?: string
          order_index?: number
          proposal_id?: string
          section_key?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "proposal_sections_proposal_id_fkey"
            columns: ["proposal_id"]
            isOneToOne: false
            referencedRelation: "proposals"
            referencedColumns: ["id"]
          },
        ]
      }
      proposal_segment_totals: {
        Row: {
          created_at: string
          id: string
          label: string
          labor_amount: number
          material_amount: number
          order_index: number
          percent: number
          pricing_option_id: string
          proposal_id: string
          segment_id: string | null
          total_amount: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          label: string
          labor_amount?: number
          material_amount?: number
          order_index?: number
          percent?: number
          pricing_option_id: string
          proposal_id: string
          segment_id?: string | null
          total_amount?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          label?: string
          labor_amount?: number
          material_amount?: number
          order_index?: number
          percent?: number
          pricing_option_id?: string
          proposal_id?: string
          segment_id?: string | null
          total_amount?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "proposal_segment_totals_pricing_option_id_fkey"
            columns: ["pricing_option_id"]
            isOneToOne: false
            referencedRelation: "proposal_pricing_options"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proposal_segment_totals_proposal_id_fkey"
            columns: ["proposal_id"]
            isOneToOne: false
            referencedRelation: "proposals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proposal_segment_totals_segment_id_fkey"
            columns: ["segment_id"]
            isOneToOne: false
            referencedRelation: "work_segments"
            referencedColumns: ["id"]
          },
        ]
      }
      proposal_template_responsibility_items: {
        Row: {
          created_at: string
          description: string
          id: string
          order_index: number
          org_id: string
          responsible: string
          template_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          description: string
          id?: string
          order_index?: number
          org_id?: string
          responsible: string
          template_id: string
          updated_at?: string
          user_id?: string
        }
        Update: {
          created_at?: string
          description?: string
          id?: string
          order_index?: number
          org_id?: string
          responsible?: string
          template_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "proposal_template_responsibility_items_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proposal_template_responsibility_items_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "proposal_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      proposal_templates: {
        Row: {
          acceptance_closing_text: string | null
          billing_conditions: Json | null
          created_at: string
          default_sections: Json
          description: string | null
          final_considerations: Json
          id: string
          institutional: Json
          is_default: boolean
          name: string
          org_id: string
          scope_label: string
          updated_at: string
          user_id: string
        }
        Insert: {
          acceptance_closing_text?: string | null
          billing_conditions?: Json | null
          created_at?: string
          default_sections?: Json
          description?: string | null
          final_considerations?: Json
          id?: string
          institutional?: Json
          is_default?: boolean
          name: string
          org_id?: string
          scope_label?: string
          updated_at?: string
          user_id?: string
        }
        Update: {
          acceptance_closing_text?: string | null
          billing_conditions?: Json | null
          created_at?: string
          default_sections?: Json
          description?: string | null
          final_considerations?: Json
          id?: string
          institutional?: Json
          is_default?: boolean
          name?: string
          org_id?: string
          scope_label?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "proposal_templates_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      proposal_view_events: {
        Row: {
          created_at: string
          event_type: string
          id: string
          occurred_at: string
          payload: Json | null
          proposal_id: string
          section_key: string | null
          view_id: string
        }
        Insert: {
          created_at?: string
          event_type: string
          id?: string
          occurred_at?: string
          payload?: Json | null
          proposal_id: string
          section_key?: string | null
          view_id: string
        }
        Update: {
          created_at?: string
          event_type?: string
          id?: string
          occurred_at?: string
          payload?: Json | null
          proposal_id?: string
          section_key?: string | null
          view_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "proposal_view_events_proposal_id_fkey"
            columns: ["proposal_id"]
            isOneToOne: false
            referencedRelation: "proposals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proposal_view_events_view_id_fkey"
            columns: ["view_id"]
            isOneToOne: false
            referencedRelation: "proposal_views"
            referencedColumns: ["id"]
          },
        ]
      }
      proposal_views: {
        Row: {
          browser: string | null
          created_at: string
          device_type: string | null
          first_seen_at: string
          geo_city: string | null
          geo_country: string | null
          geo_region: string | null
          id: string
          ip_hash: string | null
          last_seen_at: string
          max_scroll_percent: number
          os: string | null
          proposal_id: string
          referrer: string | null
          session_id: string
          total_seconds: number
          user_agent: string | null
        }
        Insert: {
          browser?: string | null
          created_at?: string
          device_type?: string | null
          first_seen_at?: string
          geo_city?: string | null
          geo_country?: string | null
          geo_region?: string | null
          id?: string
          ip_hash?: string | null
          last_seen_at?: string
          max_scroll_percent?: number
          os?: string | null
          proposal_id: string
          referrer?: string | null
          session_id: string
          total_seconds?: number
          user_agent?: string | null
        }
        Update: {
          browser?: string | null
          created_at?: string
          device_type?: string | null
          first_seen_at?: string
          geo_city?: string | null
          geo_country?: string | null
          geo_region?: string | null
          id?: string
          ip_hash?: string | null
          last_seen_at?: string
          max_scroll_percent?: number
          os?: string | null
          proposal_id?: string
          referrer?: string | null
          session_id?: string
          total_seconds?: number
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "proposal_views_proposal_id_fkey"
            columns: ["proposal_id"]
            isOneToOne: false
            referencedRelation: "proposals"
            referencedColumns: ["id"]
          },
        ]
      }
      proposals: {
        Row: {
          abc_grand_total: number
          acceptance_closing_text: string | null
          accepted_at: string | null
          accepted_pricing_option_id: string | null
          activities: Json
          ai_prompt_version: string | null
          billing_conditions: Json | null
          budget_id: string
          city: string
          client_name: string
          created_at: string
          final_considerations: Json
          id: string
          institutional: Json
          issued_at: string
          materials_snapshot: Json
          org_id: string
          project_subtitle: string | null
          project_title: string
          proposal_number: number
          published_at: string | null
          revoked_at: string | null
          schedule_columns: Json
          schedule_footnote: string | null
          scope_label: string
          share_token: string
          status: string
          technical_responsible_id: string | null
          template_id: string | null
          units_count: number | null
          units_label: string | null
          updated_at: string
          user_id: string
          validity_date: string | null
          version: number
        }
        Insert: {
          abc_grand_total?: number
          acceptance_closing_text?: string | null
          accepted_at?: string | null
          accepted_pricing_option_id?: string | null
          activities?: Json
          ai_prompt_version?: string | null
          billing_conditions?: Json | null
          budget_id: string
          city?: string
          client_name?: string
          created_at?: string
          final_considerations?: Json
          id?: string
          institutional?: Json
          issued_at?: string
          materials_snapshot?: Json
          org_id?: string
          project_subtitle?: string | null
          project_title?: string
          proposal_number: number
          published_at?: string | null
          revoked_at?: string | null
          schedule_columns?: Json
          schedule_footnote?: string | null
          scope_label?: string
          share_token?: string
          status?: string
          technical_responsible_id?: string | null
          template_id?: string | null
          units_count?: number | null
          units_label?: string | null
          updated_at?: string
          user_id?: string
          validity_date?: string | null
          version?: number
        }
        Update: {
          abc_grand_total?: number
          acceptance_closing_text?: string | null
          accepted_at?: string | null
          accepted_pricing_option_id?: string | null
          activities?: Json
          ai_prompt_version?: string | null
          billing_conditions?: Json | null
          budget_id?: string
          city?: string
          client_name?: string
          created_at?: string
          final_considerations?: Json
          id?: string
          institutional?: Json
          issued_at?: string
          materials_snapshot?: Json
          org_id?: string
          project_subtitle?: string | null
          project_title?: string
          proposal_number?: number
          published_at?: string | null
          revoked_at?: string | null
          schedule_columns?: Json
          schedule_footnote?: string | null
          scope_label?: string
          share_token?: string
          status?: string
          technical_responsible_id?: string | null
          template_id?: string | null
          units_count?: number | null
          units_label?: string | null
          updated_at?: string
          user_id?: string
          validity_date?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "proposals_accepted_pricing_option_id_fkey"
            columns: ["accepted_pricing_option_id"]
            isOneToOne: false
            referencedRelation: "proposal_pricing_options"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proposals_budget_id_fkey"
            columns: ["budget_id"]
            isOneToOne: false
            referencedRelation: "budgets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proposals_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proposals_technical_responsible_id_fkey"
            columns: ["technical_responsible_id"]
            isOneToOne: false
            referencedRelation: "technical_responsibles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proposals_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "proposal_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_order_items: {
        Row: {
          created_at: string
          id: string
          material_id: string
          preco_unit: number
          purchase_order_id: string
          quantidade: number
        }
        Insert: {
          created_at?: string
          id?: string
          material_id: string
          preco_unit: number
          purchase_order_id: string
          quantidade: number
        }
        Update: {
          created_at?: string
          id?: string
          material_id?: string
          preco_unit?: number
          purchase_order_id?: string
          quantidade?: number
        }
        Relationships: [
          {
            foreignKeyName: "purchase_order_items_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "materials"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_order_items_purchase_order_id_fkey"
            columns: ["purchase_order_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_orders: {
        Row: {
          budget_id: string | null
          created_at: string
          delivery_date: string | null
          freight_type: string | null
          freight_value: number | null
          id: string
          items_value: number
          notes: string | null
          oc_number: string
          org_id: string
          session_id: string | null
          status: string
          supplier_id: string | null
          supplier_name: string
          updated_at: string
          user_id: string
        }
        Insert: {
          budget_id?: string | null
          created_at?: string
          delivery_date?: string | null
          freight_type?: string | null
          freight_value?: number | null
          id?: string
          items_value?: number
          notes?: string | null
          oc_number: string
          org_id?: string
          session_id?: string | null
          status?: string
          supplier_id?: string | null
          supplier_name: string
          updated_at?: string
          user_id?: string
        }
        Update: {
          budget_id?: string | null
          created_at?: string
          delivery_date?: string | null
          freight_type?: string | null
          freight_value?: number | null
          id?: string
          items_value?: number
          notes?: string | null
          oc_number?: string
          org_id?: string
          session_id?: string | null
          status?: string
          supplier_id?: string | null
          supplier_name?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "purchase_orders_budget_id_fkey"
            columns: ["budget_id"]
            isOneToOne: false
            referencedRelation: "budgets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_orders_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_orders_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "quotation_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_orders_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      quotation_session_notes: {
        Row: {
          author: string
          body: string
          created_at: string
          id: string
          session_id: string
          user_id: string
        }
        Insert: {
          author: string
          body: string
          created_at?: string
          id?: string
          session_id: string
          user_id?: string
        }
        Update: {
          author?: string
          body?: string
          created_at?: string
          id?: string
          session_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "quotation_session_notes_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "quotation_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      quotation_sessions: {
        Row: {
          budget_id: string | null
          created_at: string
          id: string
          org_id: string
          status: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          budget_id?: string | null
          created_at?: string
          id?: string
          org_id?: string
          status?: string
          title: string
          updated_at?: string
          user_id?: string
        }
        Update: {
          budget_id?: string | null
          created_at?: string
          id?: string
          org_id?: string
          status?: string
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "quotation_sessions_budget_id_fkey"
            columns: ["budget_id"]
            isOneToOne: false
            referencedRelation: "budgets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotation_sessions_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      saved_pricing_budgets: {
        Row: {
          budget_id: string
          budget_name: string
          city: string | null
          client_name: string | null
          cost_items: Json
          created_at: string
          id: string
          imposto_percent: number
          imposto_valor: number
          is_primary: boolean
          lucro_bruto: number
          lucro_liquido: number
          lucro_percent_input: number
          materials_snapshot: Json
          org_id: string
          percent_materiais_input: number
          preco_total_cliente: number
          pricing_input_mode: string
          result_snapshot: Json
          save_mode: string
          scenario_name: string
          total_custos: number
          updated_at: string
          user_id: string
          valor_materiais: number
          valor_servico: number
          valor_servico_input: number
        }
        Insert: {
          budget_id: string
          budget_name: string
          city?: string | null
          client_name?: string | null
          cost_items?: Json
          created_at?: string
          id?: string
          imposto_percent?: number
          imposto_valor?: number
          is_primary?: boolean
          lucro_bruto?: number
          lucro_liquido?: number
          lucro_percent_input?: number
          materials_snapshot?: Json
          org_id?: string
          percent_materiais_input?: number
          preco_total_cliente?: number
          pricing_input_mode: string
          result_snapshot?: Json
          save_mode: string
          scenario_name?: string
          total_custos?: number
          updated_at?: string
          user_id: string
          valor_materiais?: number
          valor_servico?: number
          valor_servico_input?: number
        }
        Update: {
          budget_id?: string
          budget_name?: string
          city?: string | null
          client_name?: string | null
          cost_items?: Json
          created_at?: string
          id?: string
          imposto_percent?: number
          imposto_valor?: number
          is_primary?: boolean
          lucro_bruto?: number
          lucro_liquido?: number
          lucro_percent_input?: number
          materials_snapshot?: Json
          org_id?: string
          percent_materiais_input?: number
          preco_total_cliente?: number
          pricing_input_mode?: string
          result_snapshot?: Json
          save_mode?: string
          scenario_name?: string
          total_custos?: number
          updated_at?: string
          user_id?: string
          valor_materiais?: number
          valor_servico?: number
          valor_servico_input?: number
        }
        Relationships: [
          {
            foreignKeyName: "saved_pricing_budgets_budget_id_fkey"
            columns: ["budget_id"]
            isOneToOne: false
            referencedRelation: "budgets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "saved_pricing_budgets_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      scenario_ideal_selections: {
        Row: {
          created_at: string
          id: string
          material_id: string
          org_id: string
          quote_id: string
          session_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          material_id: string
          org_id?: string
          quote_id: string
          session_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          material_id?: string
          org_id?: string
          quote_id?: string
          session_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "scenario_ideal_selections_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "materials"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scenario_ideal_selections_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scenario_ideal_selections_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "supplier_price_history"
            referencedColumns: ["quote_id"]
          },
          {
            foreignKeyName: "scenario_ideal_selections_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "supplier_quotes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scenario_ideal_selections_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "quotation_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      scenario_purchase_orders: {
        Row: {
          created_at: string
          id: string
          material_id: string
          oc_number: string
          org_id: string
          session_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          material_id: string
          oc_number: string
          org_id?: string
          session_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          material_id?: string
          oc_number?: string
          org_id?: string
          session_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "scenario_purchase_orders_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "materials"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scenario_purchase_orders_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scenario_purchase_orders_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "quotation_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      semantic_match_suggestions: {
        Row: {
          confidence_score: number
          created_at: string
          id: string
          model: string
          rationale: string | null
          reviewed_at: string | null
          status: string
          suggested_conversion_factor: number
          suggested_material_id: string
          supplier_quote_item_id: string
        }
        Insert: {
          confidence_score: number
          created_at?: string
          id?: string
          model?: string
          rationale?: string | null
          reviewed_at?: string | null
          status?: string
          suggested_conversion_factor?: number
          suggested_material_id: string
          supplier_quote_item_id: string
        }
        Update: {
          confidence_score?: number
          created_at?: string
          id?: string
          model?: string
          rationale?: string | null
          reviewed_at?: string | null
          status?: string
          suggested_conversion_factor?: number
          suggested_material_id?: string
          supplier_quote_item_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "semantic_match_suggestions_suggested_material_id_fkey"
            columns: ["suggested_material_id"]
            isOneToOne: false
            referencedRelation: "materials"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "semantic_match_suggestions_supplier_quote_item_id_fkey"
            columns: ["supplier_quote_item_id"]
            isOneToOne: false
            referencedRelation: "supplier_price_history"
            referencedColumns: ["item_id"]
          },
          {
            foreignKeyName: "semantic_match_suggestions_supplier_quote_item_id_fkey"
            columns: ["supplier_quote_item_id"]
            isOneToOne: false
            referencedRelation: "supplier_quote_items"
            referencedColumns: ["id"]
          },
        ]
      }
      session_material_exclusions: {
        Row: {
          created_at: string
          id: string
          material_id: string
          org_id: string
          session_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          material_id: string
          org_id?: string
          session_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          material_id?: string
          org_id?: string
          session_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "session_material_exclusions_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "materials"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "session_material_exclusions_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "session_material_exclusions_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "quotation_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      session_material_stock_inputs: {
        Row: {
          created_at: string
          id: string
          material_id: string
          org_id: string
          session_id: string
          stock_qty: number
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          material_id: string
          org_id?: string
          session_id: string
          stock_qty?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          material_id?: string
          org_id?: string
          session_id?: string
          stock_qty?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "session_material_stock_inputs_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "materials"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "session_material_stock_inputs_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "session_material_stock_inputs_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "quotation_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      supplier_material_mappings: {
        Row: {
          confidence_snapshot: number | null
          conversion_factor: number
          created_at: string
          id: string
          internal_material_id: string
          last_seen_at: string | null
          org_id: string
          source: string
          supplier_material_name: string
          supplier_name: string
          times_used: number
          updated_at: string
          user_id: string
        }
        Insert: {
          confidence_snapshot?: number | null
          conversion_factor?: number
          created_at?: string
          id?: string
          internal_material_id: string
          last_seen_at?: string | null
          org_id?: string
          source?: string
          supplier_material_name: string
          supplier_name: string
          times_used?: number
          updated_at?: string
          user_id?: string
        }
        Update: {
          confidence_snapshot?: number | null
          conversion_factor?: number
          created_at?: string
          id?: string
          internal_material_id?: string
          last_seen_at?: string | null
          org_id?: string
          source?: string
          supplier_material_name?: string
          supplier_name?: string
          times_used?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "supplier_material_mappings_internal_material_id_fkey"
            columns: ["internal_material_id"]
            isOneToOne: false
            referencedRelation: "materials"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_material_mappings_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      supplier_quote_items: {
        Row: {
          alerta: boolean
          conversion_factor: number
          created_at: string
          descricao: string
          id: string
          ipi_percent: number
          match_confidence: number | null
          match_level: number | null
          match_method: string | null
          match_status: string
          matched_material_id: string | null
          preco_negociado: number | null
          preco_unit: number
          preco_unit_desconto: number | null
          quantidade: number
          quote_id: string
          st_incluso: boolean
          total_item: number
          unidade: string
        }
        Insert: {
          alerta?: boolean
          conversion_factor?: number
          created_at?: string
          descricao: string
          id?: string
          ipi_percent?: number
          match_confidence?: number | null
          match_level?: number | null
          match_method?: string | null
          match_status?: string
          matched_material_id?: string | null
          preco_negociado?: number | null
          preco_unit?: number
          preco_unit_desconto?: number | null
          quantidade?: number
          quote_id: string
          st_incluso?: boolean
          total_item?: number
          unidade?: string
        }
        Update: {
          alerta?: boolean
          conversion_factor?: number
          created_at?: string
          descricao?: string
          id?: string
          ipi_percent?: number
          match_confidence?: number | null
          match_level?: number | null
          match_method?: string | null
          match_status?: string
          matched_material_id?: string | null
          preco_negociado?: number | null
          preco_unit?: number
          preco_unit_desconto?: number | null
          quantidade?: number
          quote_id?: string
          st_incluso?: boolean
          total_item?: number
          unidade?: string
        }
        Relationships: [
          {
            foreignKeyName: "supplier_quote_items_matched_material_id_fkey"
            columns: ["matched_material_id"]
            isOneToOne: false
            referencedRelation: "materials"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_quote_items_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "supplier_price_history"
            referencedColumns: ["quote_id"]
          },
          {
            foreignKeyName: "supplier_quote_items_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "supplier_quotes"
            referencedColumns: ["id"]
          },
        ]
      }
      supplier_quotes: {
        Row: {
          budget_id: string | null
          created_at: string
          display_name: string | null
          extraction_error_at: string | null
          extraction_error_message: string | null
          extraction_validated_at: string | null
          id: string
          observacoes_gerais: string | null
          org_id: string
          pdf_path: string
          quote_date: string | null
          raw_extraction: Json | null
          session_id: string | null
          status: string
          supplier_id: string | null
          supplier_name: string
          updated_at: string
          user_id: string
        }
        Insert: {
          budget_id?: string | null
          created_at?: string
          display_name?: string | null
          extraction_error_at?: string | null
          extraction_error_message?: string | null
          extraction_validated_at?: string | null
          id?: string
          observacoes_gerais?: string | null
          org_id?: string
          pdf_path: string
          quote_date?: string | null
          raw_extraction?: Json | null
          session_id?: string | null
          status?: string
          supplier_id?: string | null
          supplier_name: string
          updated_at?: string
          user_id?: string
        }
        Update: {
          budget_id?: string | null
          created_at?: string
          display_name?: string | null
          extraction_error_at?: string | null
          extraction_error_message?: string | null
          extraction_validated_at?: string | null
          id?: string
          observacoes_gerais?: string | null
          org_id?: string
          pdf_path?: string
          quote_date?: string | null
          raw_extraction?: Json | null
          session_id?: string | null
          status?: string
          supplier_id?: string | null
          supplier_name?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "supplier_quotes_budget_id_fkey"
            columns: ["budget_id"]
            isOneToOne: false
            referencedRelation: "budgets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_quotes_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_quotes_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "quotation_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_quotes_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      suppliers: {
        Row: {
          address: string | null
          cnpj: string | null
          created_at: string
          email: string | null
          id: string
          is_active: boolean
          name: string
          notes: string | null
          org_id: string
          payment_terms: string | null
          phone: string | null
          sales_contact: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          address?: string | null
          cnpj?: string | null
          created_at?: string
          email?: string | null
          id?: string
          is_active?: boolean
          name: string
          notes?: string | null
          org_id?: string
          payment_terms?: string | null
          phone?: string | null
          sales_contact?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          address?: string | null
          cnpj?: string | null
          created_at?: string
          email?: string | null
          id?: string
          is_active?: boolean
          name?: string
          notes?: string | null
          org_id?: string
          payment_terms?: string | null
          phone?: string | null
          sales_contact?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "suppliers_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      task_attachments: {
        Row: {
          created_at: string
          file_name: string
          file_size: number | null
          height: number | null
          id: string
          message_id: string | null
          mime_type: string | null
          org_id: string
          storage_path: string
          task_id: string
          uploaded_by: string
          width: number | null
        }
        Insert: {
          created_at?: string
          file_name: string
          file_size?: number | null
          height?: number | null
          id?: string
          message_id?: string | null
          mime_type?: string | null
          org_id?: string
          storage_path: string
          task_id: string
          uploaded_by?: string
          width?: number | null
        }
        Update: {
          created_at?: string
          file_name?: string
          file_size?: number | null
          height?: number | null
          id?: string
          message_id?: string | null
          mime_type?: string | null
          org_id?: string
          storage_path?: string
          task_id?: string
          uploaded_by?: string
          width?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "task_attachments_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "task_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_attachments_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      task_events: {
        Row: {
          actor_id: string | null
          created_at: string
          direction: string | null
          from_sector: string | null
          from_stage: string | null
          id: string
          kind: string
          note: string | null
          org_id: string
          task_id: string
          to_sector: string | null
          to_stage: string | null
        }
        Insert: {
          actor_id?: string | null
          created_at?: string
          direction?: string | null
          from_sector?: string | null
          from_stage?: string | null
          id?: string
          kind: string
          note?: string | null
          org_id: string
          task_id: string
          to_sector?: string | null
          to_stage?: string | null
        }
        Update: {
          actor_id?: string | null
          created_at?: string
          direction?: string | null
          from_sector?: string | null
          from_stage?: string | null
          id?: string
          kind?: string
          note?: string | null
          org_id?: string
          task_id?: string
          to_sector?: string | null
          to_stage?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "task_events_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      task_followers: {
        Row: {
          created_at: string
          org_id: string
          reason: string
          task_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          org_id?: string
          reason?: string
          task_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          org_id?: string
          reason?: string
          task_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_followers_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      task_messages: {
        Row: {
          body: string | null
          client_event_id: string | null
          created_at: string
          id: string
          org_id: string
          sender_id: string
          task_id: string
        }
        Insert: {
          body?: string | null
          client_event_id?: string | null
          created_at?: string
          id?: string
          org_id?: string
          sender_id: string
          task_id: string
        }
        Update: {
          body?: string | null
          client_event_id?: string | null
          created_at?: string
          id?: string
          org_id?: string
          sender_id?: string
          task_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_messages_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      tasks: {
        Row: {
          assigned_to: string | null
          blocked_reason: string | null
          budget_id: string | null
          client_name: string | null
          created_at: string
          created_by: string
          description: string | null
          due_date: string | null
          id: string
          last_activity_at: string
          org_id: string
          position: number
          sector: string
          stage: string | null
          title: string
          transition_note: string | null
          updated_at: string
          work_id: string | null
        }
        Insert: {
          assigned_to?: string | null
          blocked_reason?: string | null
          budget_id?: string | null
          client_name?: string | null
          created_at?: string
          created_by?: string
          description?: string | null
          due_date?: string | null
          id?: string
          last_activity_at?: string
          org_id?: string
          position?: number
          sector: string
          stage?: string | null
          title: string
          transition_note?: string | null
          updated_at?: string
          work_id?: string | null
        }
        Update: {
          assigned_to?: string | null
          blocked_reason?: string | null
          budget_id?: string | null
          client_name?: string | null
          created_at?: string
          created_by?: string
          description?: string | null
          due_date?: string | null
          id?: string
          last_activity_at?: string
          org_id?: string
          position?: number
          sector?: string
          stage?: string | null
          title?: string
          transition_note?: string | null
          updated_at?: string
          work_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tasks_budget_id_fkey"
            columns: ["budget_id"]
            isOneToOne: false
            referencedRelation: "budgets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_work_id_fkey"
            columns: ["work_id"]
            isOneToOne: false
            referencedRelation: "works"
            referencedColumns: ["id"]
          },
        ]
      }
      technical_responsibles: {
        Row: {
          crea: string
          created_at: string
          full_name: string
          id: string
          is_active: boolean
          order_index: number
          org_id: string
          signature_storage_path: string | null
          signature_url: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          crea: string
          created_at?: string
          full_name: string
          id?: string
          is_active?: boolean
          order_index?: number
          org_id?: string
          signature_storage_path?: string | null
          signature_url?: string | null
          updated_at?: string
          user_id?: string
        }
        Update: {
          crea?: string
          created_at?: string
          full_name?: string
          id?: string
          is_active?: boolean
          order_index?: number
          org_id?: string
          signature_storage_path?: string | null
          signature_url?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "technical_responsibles_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      template_materials: {
        Row: {
          material_id: string
          quantity: number
          template_id: string
        }
        Insert: {
          material_id: string
          quantity: number
          template_id: string
        }
        Update: {
          material_id?: string
          quantity?: number
          template_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "template_materials_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "materials"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "template_materials_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "item_group_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      tracked_post_photos: {
        Row: {
          description: string | null
          id: string
          photo_type: string | null
          tracked_post_id: string
          uploaded_at: string | null
          url: string
        }
        Insert: {
          description?: string | null
          id?: string
          photo_type?: string | null
          tracked_post_id: string
          uploaded_at?: string | null
          url: string
        }
        Update: {
          description?: string | null
          id?: string
          photo_type?: string | null
          tracked_post_id?: string
          uploaded_at?: string | null
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "tracked_post_photos_tracked_post_id_fkey"
            columns: ["tracked_post_id"]
            isOneToOne: false
            referencedRelation: "tracked_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      tracked_posts: {
        Row: {
          client_id: string | null
          completion_date: string | null
          created_at: string | null
          custom_name: string | null
          id: string
          installation_date: string | null
          is_visible: boolean
          name: string
          notes: string | null
          original_post_id: string
          status: string
          tracking_id: string
          updated_at: string | null
          x_coord: number
          y_coord: number
        }
        Insert: {
          client_id?: string | null
          completion_date?: string | null
          created_at?: string | null
          custom_name?: string | null
          id?: string
          installation_date?: string | null
          is_visible?: boolean
          name: string
          notes?: string | null
          original_post_id: string
          status?: string
          tracking_id: string
          updated_at?: string | null
          x_coord: number
          y_coord: number
        }
        Update: {
          client_id?: string | null
          completion_date?: string | null
          created_at?: string | null
          custom_name?: string | null
          id?: string
          installation_date?: string | null
          is_visible?: boolean
          name?: string
          notes?: string | null
          original_post_id?: string
          status?: string
          tracking_id?: string
          updated_at?: string | null
          x_coord?: number
          y_coord?: number
        }
        Relationships: [
          {
            foreignKeyName: "tracked_posts_tracking_id_fkey"
            columns: ["tracking_id"]
            isOneToOne: false
            referencedRelation: "work_trackings"
            referencedColumns: ["id"]
          },
        ]
      }
      user_module_seen: {
        Row: {
          created_at: string
          last_seen_at: string
          module_key: string
          scope_key: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          last_seen_at?: string
          module_key: string
          scope_key?: string
          updated_at?: string
          user_id?: string
        }
        Update: {
          created_at?: string
          last_seen_at?: string
          module_key?: string
          scope_key?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      utility_companies: {
        Row: {
          abbreviation: string | null
          created_at: string | null
          id: string
          name: string
          org_id: string
          user_id: string
        }
        Insert: {
          abbreviation?: string | null
          created_at?: string | null
          id?: string
          name: string
          org_id?: string
          user_id?: string
        }
        Update: {
          abbreviation?: string | null
          created_at?: string | null
          id?: string
          name?: string
          org_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "utility_companies_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      watchdog_log: {
        Row: {
          branch: string | null
          http_request_id: number | null
          id: number
          job_id: string | null
          ran_at: string
        }
        Insert: {
          branch?: string | null
          http_request_id?: number | null
          id?: never
          job_id?: string | null
          ran_at?: string
        }
        Update: {
          branch?: string | null
          http_request_id?: number | null
          id?: never
          job_id?: string | null
          ran_at?: string
        }
        Relationships: []
      }
      work_alert_media: {
        Row: {
          alert_id: string
          created_at: string
          duration_seconds: number | null
          height: number | null
          id: string
          kind: string
          mime_type: string | null
          size_bytes: number | null
          storage_path: string
          update_id: string | null
          width: number | null
          work_id: string
        }
        Insert: {
          alert_id: string
          created_at?: string
          duration_seconds?: number | null
          height?: number | null
          id?: string
          kind: string
          mime_type?: string | null
          size_bytes?: number | null
          storage_path: string
          update_id?: string | null
          width?: number | null
          work_id: string
        }
        Update: {
          alert_id?: string
          created_at?: string
          duration_seconds?: number | null
          height?: number | null
          id?: string
          kind?: string
          mime_type?: string | null
          size_bytes?: number | null
          storage_path?: string
          update_id?: string | null
          width?: number | null
          work_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "work_alert_media_alert_id_fkey"
            columns: ["alert_id"]
            isOneToOne: false
            referencedRelation: "work_alerts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_alert_media_update_id_fkey"
            columns: ["update_id"]
            isOneToOne: false
            referencedRelation: "work_alert_updates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_alert_media_work_id_fkey"
            columns: ["work_id"]
            isOneToOne: false
            referencedRelation: "works"
            referencedColumns: ["id"]
          },
        ]
      }
      work_alert_updates: {
        Row: {
          actor_id: string
          actor_role: string
          alert_id: string
          client_event_id: string | null
          created_at: string
          id: string
          notes: string | null
          update_type: string
          work_id: string
        }
        Insert: {
          actor_id: string
          actor_role: string
          alert_id: string
          client_event_id?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          update_type: string
          work_id: string
        }
        Update: {
          actor_id?: string
          actor_role?: string
          alert_id?: string
          client_event_id?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          update_type?: string
          work_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "work_alert_updates_alert_id_fkey"
            columns: ["alert_id"]
            isOneToOne: false
            referencedRelation: "work_alerts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_alert_updates_work_id_fkey"
            columns: ["work_id"]
            isOneToOne: false
            referencedRelation: "works"
            referencedColumns: ["id"]
          },
        ]
      }
      work_alerts: {
        Row: {
          category: string
          client_event_id: string
          closed_at: string | null
          closed_by: string | null
          closure_notes: string | null
          created_at: string
          created_by: string
          description: string
          field_resolution_at: string | null
          field_resolution_notes: string | null
          gps_accuracy_meters: number | null
          gps_lat: number | null
          gps_lng: number | null
          id: string
          severity: string
          status: string
          title: string
          updated_at: string
          work_id: string
        }
        Insert: {
          category: string
          client_event_id: string
          closed_at?: string | null
          closed_by?: string | null
          closure_notes?: string | null
          created_at?: string
          created_by: string
          description: string
          field_resolution_at?: string | null
          field_resolution_notes?: string | null
          gps_accuracy_meters?: number | null
          gps_lat?: number | null
          gps_lng?: number | null
          id?: string
          severity: string
          status?: string
          title: string
          updated_at?: string
          work_id: string
        }
        Update: {
          category?: string
          client_event_id?: string
          closed_at?: string | null
          closed_by?: string | null
          closure_notes?: string | null
          created_at?: string
          created_by?: string
          description?: string
          field_resolution_at?: string | null
          field_resolution_notes?: string | null
          gps_accuracy_meters?: number | null
          gps_lat?: number | null
          gps_lng?: number | null
          id?: string
          severity?: string
          status?: string
          title?: string
          updated_at?: string
          work_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "work_alerts_work_id_fkey"
            columns: ["work_id"]
            isOneToOne: false
            referencedRelation: "works"
            referencedColumns: ["id"]
          },
        ]
      }
      work_checklist_item_media: {
        Row: {
          created_at: string
          duration_seconds: number | null
          height: number | null
          id: string
          item_id: string
          kind: string
          mime_type: string | null
          size_bytes: number | null
          storage_path: string
          width: number | null
          work_checklist_id: string
          work_id: string
        }
        Insert: {
          created_at?: string
          duration_seconds?: number | null
          height?: number | null
          id?: string
          item_id: string
          kind: string
          mime_type?: string | null
          size_bytes?: number | null
          storage_path: string
          width?: number | null
          work_checklist_id: string
          work_id: string
        }
        Update: {
          created_at?: string
          duration_seconds?: number | null
          height?: number | null
          id?: string
          item_id?: string
          kind?: string
          mime_type?: string | null
          size_bytes?: number | null
          storage_path?: string
          width?: number | null
          work_checklist_id?: string
          work_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "work_checklist_item_media_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "work_checklist_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_checklist_item_media_work_checklist_id_fkey"
            columns: ["work_checklist_id"]
            isOneToOne: false
            referencedRelation: "work_checklists"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_checklist_item_media_work_id_fkey"
            columns: ["work_id"]
            isOneToOne: false
            referencedRelation: "works"
            referencedColumns: ["id"]
          },
        ]
      }
      work_checklist_items: {
        Row: {
          client_event_id: string | null
          completed_at: string | null
          completed_by: string | null
          created_at: string
          description: string | null
          id: string
          is_completed: boolean
          label: string
          notes: string | null
          order_index: number
          requires_photo: boolean
          updated_at: string
          work_checklist_id: string
        }
        Insert: {
          client_event_id?: string | null
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_completed?: boolean
          label: string
          notes?: string | null
          order_index: number
          requires_photo?: boolean
          updated_at?: string
          work_checklist_id: string
        }
        Update: {
          client_event_id?: string | null
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_completed?: boolean
          label?: string
          notes?: string | null
          order_index?: number
          requires_photo?: boolean
          updated_at?: string
          work_checklist_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "work_checklist_items_work_checklist_id_fkey"
            columns: ["work_checklist_id"]
            isOneToOne: false
            referencedRelation: "work_checklists"
            referencedColumns: ["id"]
          },
        ]
      }
      work_checklists: {
        Row: {
          assigned_by: string
          assigned_to: string | null
          created_at: string
          description: string | null
          due_date: string | null
          id: string
          name: string
          return_reason: string | null
          returned_at: string | null
          status: string
          template_id: string | null
          template_snapshot: Json
          updated_at: string
          validated_at: string | null
          validated_by: string | null
          work_id: string
        }
        Insert: {
          assigned_by: string
          assigned_to?: string | null
          created_at?: string
          description?: string | null
          due_date?: string | null
          id?: string
          name: string
          return_reason?: string | null
          returned_at?: string | null
          status?: string
          template_id?: string | null
          template_snapshot: Json
          updated_at?: string
          validated_at?: string | null
          validated_by?: string | null
          work_id: string
        }
        Update: {
          assigned_by?: string
          assigned_to?: string | null
          created_at?: string
          description?: string | null
          due_date?: string | null
          id?: string
          name?: string
          return_reason?: string | null
          returned_at?: string | null
          status?: string
          template_id?: string | null
          template_snapshot?: Json
          updated_at?: string
          validated_at?: string | null
          validated_by?: string | null
          work_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "work_checklists_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "checklist_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_checklists_work_id_fkey"
            columns: ["work_id"]
            isOneToOne: false
            referencedRelation: "works"
            referencedColumns: ["id"]
          },
        ]
      }
      work_daily_log_media: {
        Row: {
          created_at: string
          daily_log_id: string
          duration_seconds: number | null
          height: number | null
          id: string
          kind: string
          mime_type: string | null
          revision_id: string
          size_bytes: number | null
          storage_path: string
          width: number | null
          work_id: string
        }
        Insert: {
          created_at?: string
          daily_log_id: string
          duration_seconds?: number | null
          height?: number | null
          id?: string
          kind: string
          mime_type?: string | null
          revision_id: string
          size_bytes?: number | null
          storage_path: string
          width?: number | null
          work_id: string
        }
        Update: {
          created_at?: string
          daily_log_id?: string
          duration_seconds?: number | null
          height?: number | null
          id?: string
          kind?: string
          mime_type?: string | null
          revision_id?: string
          size_bytes?: number | null
          storage_path?: string
          width?: number | null
          work_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "work_daily_log_media_daily_log_id_fkey"
            columns: ["daily_log_id"]
            isOneToOne: false
            referencedRelation: "work_daily_logs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_daily_log_media_revision_id_fkey"
            columns: ["revision_id"]
            isOneToOne: false
            referencedRelation: "work_daily_log_revisions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_daily_log_media_work_id_fkey"
            columns: ["work_id"]
            isOneToOne: false
            referencedRelation: "works"
            referencedColumns: ["id"]
          },
        ]
      }
      work_daily_log_revisions: {
        Row: {
          activities: string
          client_event_id: string | null
          created_at: string
          crew_present: Json
          daily_log_id: string
          id: string
          incidents: string | null
          materials_consumed: Json
          meters_installed: Json
          posts_installed_count: number | null
          rejection_reason: string | null
          revision_number: number
        }
        Insert: {
          activities: string
          client_event_id?: string | null
          created_at?: string
          crew_present?: Json
          daily_log_id: string
          id?: string
          incidents?: string | null
          materials_consumed?: Json
          meters_installed?: Json
          posts_installed_count?: number | null
          rejection_reason?: string | null
          revision_number: number
        }
        Update: {
          activities?: string
          client_event_id?: string | null
          created_at?: string
          crew_present?: Json
          daily_log_id?: string
          id?: string
          incidents?: string | null
          materials_consumed?: Json
          meters_installed?: Json
          posts_installed_count?: number | null
          rejection_reason?: string | null
          revision_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "work_daily_log_revisions_daily_log_id_fkey"
            columns: ["daily_log_id"]
            isOneToOne: false
            referencedRelation: "work_daily_logs"
            referencedColumns: ["id"]
          },
        ]
      }
      work_daily_logs: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          created_at: string
          current_revision_id: string | null
          id: string
          log_date: string
          published_by: string
          rejected_at: string | null
          status: string
          updated_at: string
          work_id: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          current_revision_id?: string | null
          id?: string
          log_date: string
          published_by: string
          rejected_at?: string | null
          status?: string
          updated_at?: string
          work_id: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          current_revision_id?: string | null
          id?: string
          log_date?: string
          published_by?: string
          rejected_at?: string | null
          status?: string
          updated_at?: string
          work_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_current_revision"
            columns: ["current_revision_id"]
            isOneToOne: false
            referencedRelation: "work_daily_log_revisions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_daily_logs_work_id_fkey"
            columns: ["work_id"]
            isOneToOne: false
            referencedRelation: "works"
            referencedColumns: ["id"]
          },
        ]
      }
      work_dre: {
        Row: {
          budget_id: string
          closed_at: string | null
          contract_value: number
          created_at: string
          id: string
          org_id: string
          planned_snapshot: Json
          proposal_id: string | null
          revenue_source: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          budget_id: string
          closed_at?: string | null
          contract_value: number
          created_at?: string
          id?: string
          org_id?: string
          planned_snapshot: Json
          proposal_id?: string | null
          revenue_source: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Update: {
          budget_id?: string
          closed_at?: string | null
          contract_value?: number
          created_at?: string
          id?: string
          org_id?: string
          planned_snapshot?: Json
          proposal_id?: string | null
          revenue_source?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "work_dre_budget_id_fkey"
            columns: ["budget_id"]
            isOneToOne: false
            referencedRelation: "budgets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_dre_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_dre_proposal_id_fkey"
            columns: ["proposal_id"]
            isOneToOne: false
            referencedRelation: "proposals"
            referencedColumns: ["id"]
          },
        ]
      }
      work_members: {
        Row: {
          created_at: string
          org_id: string
          role: string
          user_id: string
          work_id: string
        }
        Insert: {
          created_at?: string
          org_id?: string
          role: string
          user_id: string
          work_id: string
        }
        Update: {
          created_at?: string
          org_id?: string
          role?: string
          user_id?: string
          work_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "work_members_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_members_work_id_fkey"
            columns: ["work_id"]
            isOneToOne: false
            referencedRelation: "works"
            referencedColumns: ["id"]
          },
        ]
      }
      work_message_attachments: {
        Row: {
          created_at: string
          duration_seconds: number | null
          height: number | null
          id: string
          kind: string
          message_id: string
          mime_type: string | null
          size_bytes: number | null
          storage_path: string
          thumbnail_path: string | null
          width: number | null
          work_id: string
        }
        Insert: {
          created_at?: string
          duration_seconds?: number | null
          height?: number | null
          id?: string
          kind: string
          message_id: string
          mime_type?: string | null
          size_bytes?: number | null
          storage_path: string
          thumbnail_path?: string | null
          width?: number | null
          work_id: string
        }
        Update: {
          created_at?: string
          duration_seconds?: number | null
          height?: number | null
          id?: string
          kind?: string
          message_id?: string
          mime_type?: string | null
          size_bytes?: number | null
          storage_path?: string
          thumbnail_path?: string | null
          width?: number | null
          work_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "work_message_attachments_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "work_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_message_attachments_work_id_fkey"
            columns: ["work_id"]
            isOneToOne: false
            referencedRelation: "works"
            referencedColumns: ["id"]
          },
        ]
      }
      work_messages: {
        Row: {
          body: string | null
          client_event_id: string | null
          created_at: string
          id: string
          read_by_engineer_at: string | null
          read_by_manager_at: string | null
          sender_id: string
          sender_role: string
          work_id: string
        }
        Insert: {
          body?: string | null
          client_event_id?: string | null
          created_at?: string
          id?: string
          read_by_engineer_at?: string | null
          read_by_manager_at?: string | null
          sender_id: string
          sender_role: string
          work_id: string
        }
        Update: {
          body?: string | null
          client_event_id?: string | null
          created_at?: string
          id?: string
          read_by_engineer_at?: string | null
          read_by_manager_at?: string | null
          sender_id?: string
          sender_role?: string
          work_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "work_messages_work_id_fkey"
            columns: ["work_id"]
            isOneToOne: false
            referencedRelation: "works"
            referencedColumns: ["id"]
          },
        ]
      }
      work_milestone_event_media: {
        Row: {
          created_at: string
          event_id: string
          height: number | null
          id: string
          kind: string
          milestone_id: string
          mime_type: string | null
          size_bytes: number | null
          storage_path: string
          width: number | null
          work_id: string
        }
        Insert: {
          created_at?: string
          event_id: string
          height?: number | null
          id?: string
          kind: string
          milestone_id: string
          mime_type?: string | null
          size_bytes?: number | null
          storage_path: string
          width?: number | null
          work_id: string
        }
        Update: {
          created_at?: string
          event_id?: string
          height?: number | null
          id?: string
          kind?: string
          milestone_id?: string
          mime_type?: string | null
          size_bytes?: number | null
          storage_path?: string
          width?: number | null
          work_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "work_milestone_event_media_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "work_milestone_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_milestone_event_media_milestone_id_fkey"
            columns: ["milestone_id"]
            isOneToOne: false
            referencedRelation: "work_milestones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_milestone_event_media_work_id_fkey"
            columns: ["work_id"]
            isOneToOne: false
            referencedRelation: "works"
            referencedColumns: ["id"]
          },
        ]
      }
      work_milestone_events: {
        Row: {
          actor_id: string
          actor_role: string
          client_event_id: string | null
          created_at: string
          event_type: string
          id: string
          milestone_id: string
          notes: string | null
          work_id: string
        }
        Insert: {
          actor_id: string
          actor_role: string
          client_event_id?: string | null
          created_at?: string
          event_type: string
          id?: string
          milestone_id: string
          notes?: string | null
          work_id: string
        }
        Update: {
          actor_id?: string
          actor_role?: string
          client_event_id?: string | null
          created_at?: string
          event_type?: string
          id?: string
          milestone_id?: string
          notes?: string | null
          work_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "work_milestone_events_milestone_id_fkey"
            columns: ["milestone_id"]
            isOneToOne: false
            referencedRelation: "work_milestones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_milestone_events_work_id_fkey"
            columns: ["work_id"]
            isOneToOne: false
            referencedRelation: "works"
            referencedColumns: ["id"]
          },
        ]
      }
      work_milestones: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          code: string
          created_at: string
          evidence_media_ids: Json
          id: string
          name: string
          notes: string | null
          order_index: number
          rejected_at: string | null
          rejection_reason: string | null
          reported_at: string | null
          reported_by: string | null
          status: string
          updated_at: string
          work_id: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          code: string
          created_at?: string
          evidence_media_ids?: Json
          id?: string
          name: string
          notes?: string | null
          order_index: number
          rejected_at?: string | null
          rejection_reason?: string | null
          reported_at?: string | null
          reported_by?: string | null
          status?: string
          updated_at?: string
          work_id: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          code?: string
          created_at?: string
          evidence_media_ids?: Json
          id?: string
          name?: string
          notes?: string | null
          order_index?: number
          rejected_at?: string | null
          rejection_reason?: string | null
          reported_at?: string | null
          reported_by?: string | null
          status?: string
          updated_at?: string
          work_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "work_milestones_work_id_fkey"
            columns: ["work_id"]
            isOneToOne: false
            referencedRelation: "works"
            referencedColumns: ["id"]
          },
        ]
      }
      work_pole_installation_media: {
        Row: {
          created_at: string
          duration_seconds: number | null
          height: number | null
          id: string
          installation_id: string
          is_primary: boolean
          kind: string
          mime_type: string | null
          size_bytes: number | null
          storage_path: string
          width: number | null
          work_id: string
        }
        Insert: {
          created_at?: string
          duration_seconds?: number | null
          height?: number | null
          id?: string
          installation_id: string
          is_primary?: boolean
          kind: string
          mime_type?: string | null
          size_bytes?: number | null
          storage_path: string
          width?: number | null
          work_id: string
        }
        Update: {
          created_at?: string
          duration_seconds?: number | null
          height?: number | null
          id?: string
          installation_id?: string
          is_primary?: boolean
          kind?: string
          mime_type?: string | null
          size_bytes?: number | null
          storage_path?: string
          width?: number | null
          work_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "work_pole_installation_media_installation_id_fkey"
            columns: ["installation_id"]
            isOneToOne: false
            referencedRelation: "work_pole_installations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_pole_installation_media_work_id_fkey"
            columns: ["work_id"]
            isOneToOne: false
            referencedRelation: "works"
            referencedColumns: ["id"]
          },
        ]
      }
      work_pole_installations: {
        Row: {
          client_event_id: string
          created_at: string
          created_by: string
          gps_accuracy_meters: number | null
          gps_lat: number | null
          gps_lng: number | null
          id: string
          installed_at: string
          notes: string | null
          numbering: string | null
          pole_type: string | null
          removed_at: string | null
          removed_by: string | null
          status: string
          updated_at: string
          work_id: string
          x_coord: number
          y_coord: number
        }
        Insert: {
          client_event_id: string
          created_at?: string
          created_by: string
          gps_accuracy_meters?: number | null
          gps_lat?: number | null
          gps_lng?: number | null
          id?: string
          installed_at: string
          notes?: string | null
          numbering?: string | null
          pole_type?: string | null
          removed_at?: string | null
          removed_by?: string | null
          status?: string
          updated_at?: string
          work_id: string
          x_coord: number
          y_coord: number
        }
        Update: {
          client_event_id?: string
          created_at?: string
          created_by?: string
          gps_accuracy_meters?: number | null
          gps_lat?: number | null
          gps_lng?: number | null
          id?: string
          installed_at?: string
          notes?: string | null
          numbering?: string | null
          pole_type?: string | null
          removed_at?: string | null
          removed_by?: string | null
          status?: string
          updated_at?: string
          work_id?: string
          x_coord?: number
          y_coord?: number
        }
        Relationships: [
          {
            foreignKeyName: "work_pole_installations_work_id_fkey"
            columns: ["work_id"]
            isOneToOne: false
            referencedRelation: "works"
            referencedColumns: ["id"]
          },
        ]
      }
      work_project_connections: {
        Row: {
          color: string | null
          created_at: string
          from_post_id: string
          id: string
          metadata: Json
          source_connection_id: string | null
          to_post_id: string
          work_id: string
        }
        Insert: {
          color?: string | null
          created_at?: string
          from_post_id: string
          id?: string
          metadata?: Json
          source_connection_id?: string | null
          to_post_id: string
          work_id: string
        }
        Update: {
          color?: string | null
          created_at?: string
          from_post_id?: string
          id?: string
          metadata?: Json
          source_connection_id?: string | null
          to_post_id?: string
          work_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "work_project_connections_from_post_id_fkey"
            columns: ["from_post_id"]
            isOneToOne: false
            referencedRelation: "work_project_posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_project_connections_to_post_id_fkey"
            columns: ["to_post_id"]
            isOneToOne: false
            referencedRelation: "work_project_posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_project_connections_work_id_fkey"
            columns: ["work_id"]
            isOneToOne: false
            referencedRelation: "works"
            referencedColumns: ["id"]
          },
        ]
      }
      work_project_posts: {
        Row: {
          created_at: string
          id: string
          metadata: Json
          numbering: string | null
          post_type: string | null
          source_post_id: string | null
          work_id: string
          x_coord: number
          y_coord: number
        }
        Insert: {
          created_at?: string
          id?: string
          metadata?: Json
          numbering?: string | null
          post_type?: string | null
          source_post_id?: string | null
          work_id: string
          x_coord: number
          y_coord: number
        }
        Update: {
          created_at?: string
          id?: string
          metadata?: Json
          numbering?: string | null
          post_type?: string | null
          source_post_id?: string | null
          work_id?: string
          x_coord?: number
          y_coord?: number
        }
        Relationships: [
          {
            foreignKeyName: "work_project_posts_work_id_fkey"
            columns: ["work_id"]
            isOneToOne: false
            referencedRelation: "works"
            referencedColumns: ["id"]
          },
        ]
      }
      work_project_snapshot: {
        Row: {
          created_at: string
          imported_at: string
          imported_by: string
          materials_planned: Json
          meters_planned: Json
          original_pdf_path: string | null
          pdf_num_pages: number | null
          pdf_storage_path: string | null
          render_version: number | null
          source_budget_id: string | null
          updated_at: string
          work_id: string
        }
        Insert: {
          created_at?: string
          imported_at?: string
          imported_by: string
          materials_planned?: Json
          meters_planned?: Json
          original_pdf_path?: string | null
          pdf_num_pages?: number | null
          pdf_storage_path?: string | null
          render_version?: number | null
          source_budget_id?: string | null
          updated_at?: string
          work_id: string
        }
        Update: {
          created_at?: string
          imported_at?: string
          imported_by?: string
          materials_planned?: Json
          meters_planned?: Json
          original_pdf_path?: string | null
          pdf_num_pages?: number | null
          pdf_storage_path?: string | null
          render_version?: number | null
          source_budget_id?: string | null
          updated_at?: string
          work_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "work_project_snapshot_source_budget_id_fkey"
            columns: ["source_budget_id"]
            isOneToOne: false
            referencedRelation: "budgets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_project_snapshot_work_id_fkey"
            columns: ["work_id"]
            isOneToOne: true
            referencedRelation: "works"
            referencedColumns: ["id"]
          },
        ]
      }
      work_segments: {
        Row: {
          created_at: string
          id: string
          is_default: boolean
          name: string
          order_index: number
          org_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_default?: boolean
          name: string
          order_index?: number
          org_id?: string
          updated_at?: string
          user_id?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_default?: boolean
          name?: string
          order_index?: number
          org_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "work_segments_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      work_team: {
        Row: {
          allocated_at: string
          created_at: string
          crew_member_id: string
          deallocated_at: string | null
          id: string
          role_in_work: string | null
          updated_at: string
          work_id: string
        }
        Insert: {
          allocated_at?: string
          created_at?: string
          crew_member_id: string
          deallocated_at?: string | null
          id?: string
          role_in_work?: string | null
          updated_at?: string
          work_id: string
        }
        Update: {
          allocated_at?: string
          created_at?: string
          crew_member_id?: string
          deallocated_at?: string | null
          id?: string
          role_in_work?: string | null
          updated_at?: string
          work_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "work_team_crew_member_id_fkey"
            columns: ["crew_member_id"]
            isOneToOne: false
            referencedRelation: "crew_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_team_work_id_fkey"
            columns: ["work_id"]
            isOneToOne: false
            referencedRelation: "works"
            referencedColumns: ["id"]
          },
        ]
      }
      work_team_attendance: {
        Row: {
          attendance_date: string
          created_at: string
          crew_member_id: string
          daily_log_id: string | null
          id: string
          work_id: string
        }
        Insert: {
          attendance_date: string
          created_at?: string
          crew_member_id: string
          daily_log_id?: string | null
          id?: string
          work_id: string
        }
        Update: {
          attendance_date?: string
          created_at?: string
          crew_member_id?: string
          daily_log_id?: string | null
          id?: string
          work_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "work_team_attendance_crew_member_id_fkey"
            columns: ["crew_member_id"]
            isOneToOne: false
            referencedRelation: "crew_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_team_attendance_daily_log_id_fkey"
            columns: ["daily_log_id"]
            isOneToOne: false
            referencedRelation: "work_daily_logs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_team_attendance_work_id_fkey"
            columns: ["work_id"]
            isOneToOne: false
            referencedRelation: "works"
            referencedColumns: ["id"]
          },
        ]
      }
      work_trackings: {
        Row: {
          actual_completion: string | null
          bt_extension_km: number | null
          budget_id: string
          city: string | null
          client_logo_url: string | null
          client_name: string | null
          created_at: string | null
          current_focus_description: string | null
          current_focus_title: string | null
          equipment_installed: number | null
          estimated_completion: string | null
          id: string
          mt_extension_km: number | null
          name: string
          network_extension_km: number | null
          notes: string | null
          plan_image_url: string | null
          planned_bt_meters: number | null
          planned_equipment: number | null
          planned_mt_meters: number | null
          planned_network_meters: number | null
          planned_poles: number | null
          planned_public_lighting: number | null
          poles_installed: number | null
          progress_percentage: number | null
          project_description: string | null
          public_id: string | null
          public_lighting_installed: number | null
          responsible_person: string | null
          start_date: string | null
          status: string
          timeline_milestones: Json | null
          updated_at: string | null
          work_images: Json | null
        }
        Insert: {
          actual_completion?: string | null
          bt_extension_km?: number | null
          budget_id: string
          city?: string | null
          client_logo_url?: string | null
          client_name?: string | null
          created_at?: string | null
          current_focus_description?: string | null
          current_focus_title?: string | null
          equipment_installed?: number | null
          estimated_completion?: string | null
          id?: string
          mt_extension_km?: number | null
          name: string
          network_extension_km?: number | null
          notes?: string | null
          plan_image_url?: string | null
          planned_bt_meters?: number | null
          planned_equipment?: number | null
          planned_mt_meters?: number | null
          planned_network_meters?: number | null
          planned_poles?: number | null
          planned_public_lighting?: number | null
          poles_installed?: number | null
          progress_percentage?: number | null
          project_description?: string | null
          public_id?: string | null
          public_lighting_installed?: number | null
          responsible_person?: string | null
          start_date?: string | null
          status?: string
          timeline_milestones?: Json | null
          updated_at?: string | null
          work_images?: Json | null
        }
        Update: {
          actual_completion?: string | null
          bt_extension_km?: number | null
          budget_id?: string
          city?: string | null
          client_logo_url?: string | null
          client_name?: string | null
          created_at?: string | null
          current_focus_description?: string | null
          current_focus_title?: string | null
          equipment_installed?: number | null
          estimated_completion?: string | null
          id?: string
          mt_extension_km?: number | null
          name?: string
          network_extension_km?: number | null
          notes?: string | null
          plan_image_url?: string | null
          planned_bt_meters?: number | null
          planned_equipment?: number | null
          planned_mt_meters?: number | null
          planned_network_meters?: number | null
          planned_poles?: number | null
          planned_public_lighting?: number | null
          poles_installed?: number | null
          progress_percentage?: number | null
          project_description?: string | null
          public_id?: string | null
          public_lighting_installed?: number | null
          responsible_person?: string | null
          start_date?: string | null
          status?: string
          timeline_milestones?: Json | null
          updated_at?: string | null
          work_images?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "work_trackings_budget_id_fkey"
            columns: ["budget_id"]
            isOneToOne: false
            referencedRelation: "budgets"
            referencedColumns: ["id"]
          },
        ]
      }
      works: {
        Row: {
          address: string | null
          budget_id: string | null
          client_name: string | null
          completed_at: string | null
          created_at: string
          engineer_id: string
          expected_end_at: string | null
          id: string
          last_activity_at: string
          manager_id: string | null
          name: string
          notes: string | null
          org_id: string
          started_at: string | null
          status: string
          updated_at: string
          utility_company: string | null
        }
        Insert: {
          address?: string | null
          budget_id?: string | null
          client_name?: string | null
          completed_at?: string | null
          created_at?: string
          engineer_id: string
          expected_end_at?: string | null
          id?: string
          last_activity_at?: string
          manager_id?: string | null
          name: string
          notes?: string | null
          org_id?: string
          started_at?: string | null
          status?: string
          updated_at?: string
          utility_company?: string | null
        }
        Update: {
          address?: string | null
          budget_id?: string | null
          client_name?: string | null
          completed_at?: string | null
          created_at?: string
          engineer_id?: string
          expected_end_at?: string | null
          id?: string
          last_activity_at?: string
          manager_id?: string | null
          name?: string
          notes?: string | null
          org_id?: string
          started_at?: string | null
          status?: string
          updated_at?: string
          utility_company?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "works_budget_id_fkey"
            columns: ["budget_id"]
            isOneToOne: false
            referencedRelation: "budgets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "works_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      supplier_price_history: {
        Row: {
          conversion_factor: number | null
          item_id: string | null
          match_method: string | null
          material_code: string | null
          material_id: string | null
          material_name: string | null
          material_unit: string | null
          preco_normalizado: number | null
          preco_unit: number | null
          quantidade: number | null
          quote_id: string | null
          quoted_at: string | null
          session_id: string | null
          supplier_id: string | null
          supplier_name: string | null
          supplier_unit: string | null
        }
        Relationships: [
          {
            foreignKeyName: "supplier_quote_items_matched_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "materials"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_quotes_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "quotation_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_quotes_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      current_module_access: { Args: never; Returns: Json }
      current_org_id: { Args: never; Returns: string }
      current_org_sector: { Args: never; Returns: string }
      current_share_token: { Args: never; Returns: string }
      delete_all_materials: { Args: never; Returns: Json }
      drive_stuck_conciliation_jobs: { Args: never; Returns: undefined }
      drive_stuck_extraction_jobs: { Args: never; Returns: undefined }
      finalize_budget: { Args: { p_budget_id: string }; Returns: undefined }
      generate_proposal_share_token: { Args: never; Returns: string }
      get_budget_material_ids: {
        Args: { p_budget_id: string }
        Returns: {
          material_id: string
        }[]
      }
      get_existing_material_codes: {
        Args: { codes_to_check: string[] }
        Returns: {
          code: string
        }[]
      }
      import_materials_ignore_duplicates: {
        Args: { materials_data: Json }
        Returns: Json
      }
      is_org_admin: { Args: { _org_id: string }; Returns: boolean }
      is_org_member: { Args: { _org_id: string }; Returns: boolean }
      is_platform_admin: { Args: never; Returns: boolean }
      is_profile_creator: {
        Args: { _actor: string; _target_user: string }
        Returns: boolean
      }
      is_work_member: {
        Args: { _user_id: string; _work_id: string }
        Returns: boolean
      }
      match_materials_by_vector: {
        Args: {
          current_budget_id?: string
          current_user_id: string
          match_count: number
          match_threshold: number
          query_embedding: string
        }
        Returns: {
          code: string
          id: string
          name: string
          price: number
          similarity: number
          unit: string
        }[]
      }
      proposal_default_sections: { Args: never; Returns: Json }
      proposal_is_owned: { Args: { _proposal_id: string }; Returns: boolean }
      proposal_is_publicly_shared: {
        Args: { _proposal_id: string }
        Returns: boolean
      }
      rebalance_task_positions: {
        Args: { _sector?: string; _stage: string }
        Returns: undefined
      }
      rpc_add_alert_comment: { Args: { input: Json }; Returns: Json }
      rpc_mark_checklist_item: { Args: { input: Json }; Returns: Json }
      rpc_open_alert: { Args: { input: Json }; Returns: Json }
      rpc_publish_daily_log: { Args: { input: Json }; Returns: Json }
      rpc_record_pole_installation: { Args: { input: Json }; Returns: Json }
      rpc_report_milestone: { Args: { input: Json }; Returns: Json }
      rpc_resolve_alert_in_field: { Args: { input: Json }; Returns: Json }
      rpc_send_work_message: { Args: { input: Json }; Returns: Json }
      shares_org_with: { Args: { _user_id: string }; Returns: boolean }
      task_stage_label: { Args: { _stage: string }; Returns: string }
      task_stage_order: { Args: { _stage: string }; Returns: number }
      task_stage_sector: { Args: { _stage: string }; Returns: string }
      track_proposal_view: {
        Args: {
          p_browser?: string
          p_device_type?: string
          p_geo_city?: string
          p_geo_country?: string
          p_geo_region?: string
          p_ip_hash?: string
          p_max_scroll_percent?: number
          p_os?: string
          p_referrer?: string
          p_session_id: string
          p_share_token: string
          p_total_seconds?: number
          p_user_agent?: string
        }
        Returns: string
      }
      track_proposal_view_event: {
        Args: {
          p_event_type: string
          p_occurred_at?: string
          p_payload?: Json
          p_section_key?: string
          p_session_id: string
          p_share_token: string
        }
        Returns: string
      }
      user_org_ids: { Args: never; Returns: string[] }
    }
    Enums: {
      dre_group:
        | "material"
        | "mao_de_obra"
        | "imposto"
        | "frete"
        | "comissao"
        | "adicional"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      dre_group: [
        "material",
        "mao_de_obra",
        "imposto",
        "frete",
        "comissao",
        "adicional",
      ],
    },
  },
} as const
