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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      assignment_proposal_items: {
        Row: {
          companion_index: number | null
          created_at: string
          id: string
          is_companion: boolean
          participant_id: string
          proposal_id: string
          reason: string | null
          row_label: string | null
          seat_id: string | null
          seat_number: string | null
          unassigned_reason: string | null
          zone_id: string | null
          zone_name: string | null
        }
        Insert: {
          companion_index?: number | null
          created_at?: string
          id?: string
          is_companion?: boolean
          participant_id: string
          proposal_id: string
          reason?: string | null
          row_label?: string | null
          seat_id?: string | null
          seat_number?: string | null
          unassigned_reason?: string | null
          zone_id?: string | null
          zone_name?: string | null
        }
        Update: {
          companion_index?: number | null
          created_at?: string
          id?: string
          is_companion?: boolean
          participant_id?: string
          proposal_id?: string
          reason?: string | null
          row_label?: string | null
          seat_id?: string | null
          seat_number?: string | null
          unassigned_reason?: string | null
          zone_id?: string | null
          zone_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "assignment_proposal_items_participant_id_fkey"
            columns: ["participant_id"]
            isOneToOne: false
            referencedRelation: "event_participants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assignment_proposal_items_proposal_id_fkey"
            columns: ["proposal_id"]
            isOneToOne: false
            referencedRelation: "assignment_proposals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assignment_proposal_items_seat_id_fkey"
            columns: ["seat_id"]
            isOneToOne: false
            referencedRelation: "venue_seats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assignment_proposal_items_zone_id_fkey"
            columns: ["zone_id"]
            isOneToOne: false
            referencedRelation: "venue_zones"
            referencedColumns: ["id"]
          },
        ]
      }
      assignment_proposals: {
        Row: {
          applied_at: string | null
          applied_by: string | null
          created_at: string
          created_by: string | null
          id: string
          plan_id: string
          session_id: string
          status: string
          summary: Json
          total_assigned: number
          total_participants: number
          total_unassigned: number
          updated_at: string
        }
        Insert: {
          applied_at?: string | null
          applied_by?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          plan_id: string
          session_id: string
          status?: string
          summary?: Json
          total_assigned?: number
          total_participants?: number
          total_unassigned?: number
          updated_at?: string
        }
        Update: {
          applied_at?: string | null
          applied_by?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          plan_id?: string
          session_id?: string
          status?: string
          summary?: Json
          total_assigned?: number
          total_participants?: number
          total_unassigned?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "assignment_proposals_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "venue_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assignment_proposals_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "event_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assignment_proposals_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "event_sessions_public"
            referencedColumns: ["id"]
          },
        ]
      }
      assignment_rules: {
        Row: {
          allow_split_if_full: boolean
          attendee_type: Database["public"]["Enums"]["attendee_type"]
          avoid_categories: string[]
          created_at: string
          id: string
          keep_companions_together: boolean
          notes: string | null
          plan_id: string
          preferred_zone_ids: string[]
          priority: number
          updated_at: string
        }
        Insert: {
          allow_split_if_full?: boolean
          attendee_type: Database["public"]["Enums"]["attendee_type"]
          avoid_categories?: string[]
          created_at?: string
          id?: string
          keep_companions_together?: boolean
          notes?: string | null
          plan_id: string
          preferred_zone_ids?: string[]
          priority?: number
          updated_at?: string
        }
        Update: {
          allow_split_if_full?: boolean
          attendee_type?: Database["public"]["Enums"]["attendee_type"]
          avoid_categories?: string[]
          created_at?: string
          id?: string
          keep_companions_together?: boolean
          notes?: string | null
          plan_id?: string
          preferred_zone_ids?: string[]
          priority?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "assignment_rules_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "venue_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          actor_email: string | null
          actor_id: string | null
          changes: Json | null
          created_at: string
          entity_id: string | null
          entity_type: string
          event_id: string | null
          id: string
          ip_address: unknown
          session_id: string | null
          user_agent: string | null
        }
        Insert: {
          action: string
          actor_email?: string | null
          actor_id?: string | null
          changes?: Json | null
          created_at?: string
          entity_id?: string | null
          entity_type: string
          event_id?: string | null
          id?: string
          ip_address?: unknown
          session_id?: string | null
          user_agent?: string | null
        }
        Update: {
          action?: string
          actor_email?: string | null
          actor_id?: string | null
          changes?: Json | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string
          event_id?: string | null
          id?: string
          ip_address?: unknown
          session_id?: string | null
          user_agent?: string | null
        }
        Relationships: []
      }
      brand_profiles: {
        Row: {
          client_id: string | null
          cover_url: string | null
          created_at: string
          created_by: string | null
          event_id: string | null
          id: string
          logo_url: string | null
          name: string
          primary_color: string
          secondary_color: string
          updated_at: string
        }
        Insert: {
          client_id?: string | null
          cover_url?: string | null
          created_at?: string
          created_by?: string | null
          event_id?: string | null
          id?: string
          logo_url?: string | null
          name: string
          primary_color?: string
          secondary_color?: string
          updated_at?: string
        }
        Update: {
          client_id?: string | null
          cover_url?: string | null
          created_at?: string
          created_by?: string | null
          event_id?: string | null
          id?: string
          logo_url?: string | null
          name?: string
          primary_color?: string
          secondary_color?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "brand_profiles_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "brand_profiles_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      checkins: {
        Row: {
          checked_in_at: string
          companions_validated: number
          device_info: string | null
          event_id: string
          id: string
          notes: string | null
          participant_id: string
          result: Database["public"]["Enums"]["checkin_result"]
          session_id: string
          ticket_id: string | null
          validator_id: string | null
        }
        Insert: {
          checked_in_at?: string
          companions_validated?: number
          device_info?: string | null
          event_id: string
          id?: string
          notes?: string | null
          participant_id: string
          result?: Database["public"]["Enums"]["checkin_result"]
          session_id: string
          ticket_id?: string | null
          validator_id?: string | null
        }
        Update: {
          checked_in_at?: string
          companions_validated?: number
          device_info?: string | null
          event_id?: string
          id?: string
          notes?: string | null
          participant_id?: string
          result?: Database["public"]["Enums"]["checkin_result"]
          session_id?: string
          ticket_id?: string | null
          validator_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "checkins_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checkins_participant_id_fkey"
            columns: ["participant_id"]
            isOneToOne: false
            referencedRelation: "event_participants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checkins_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "event_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checkins_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "event_sessions_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checkins_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      client_users: {
        Row: {
          client_id: string
          created_at: string
          id: string
          user_id: string
        }
        Insert: {
          client_id: string
          created_at?: string
          id?: string
          user_id: string
        }
        Update: {
          client_id?: string
          created_at?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_users_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      clients: {
        Row: {
          contact_email: string | null
          contact_phone: string | null
          created_at: string
          id: string
          is_active: boolean
          legal_name: string | null
          name: string
          notes: string | null
          tax_id: string | null
          updated_at: string
          visibility_permissions: Json
        }
        Insert: {
          contact_email?: string | null
          contact_phone?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          legal_name?: string | null
          name: string
          notes?: string | null
          tax_id?: string | null
          updated_at?: string
          visibility_permissions?: Json
        }
        Update: {
          contact_email?: string | null
          contact_phone?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          legal_name?: string | null
          name?: string
          notes?: string | null
          tax_id?: string | null
          updated_at?: string
          visibility_permissions?: Json
        }
        Relationships: []
      }
      communication_logs: {
        Row: {
          archived_at: string | null
          archived_by: string | null
          batch_id: string | null
          body: string | null
          channel: Database["public"]["Enums"]["communication_channel"]
          created_at: string
          created_by: string | null
          error_message: string | null
          event_id: string | null
          id: string
          metadata: Json
          participant_id: string | null
          person_id: string | null
          sent_at: string | null
          session_id: string | null
          status: Database["public"]["Enums"]["communication_status"]
          subject: string | null
          template_id: string | null
          to_address: string | null
          wati_local_message_id: string | null
          whatsapp_estado: string | null
          whatsapp_failed_code: string | null
          whatsapp_failed_detail: string | null
          whatsapp_last_event_at: string | null
        }
        Insert: {
          archived_at?: string | null
          archived_by?: string | null
          batch_id?: string | null
          body?: string | null
          channel: Database["public"]["Enums"]["communication_channel"]
          created_at?: string
          created_by?: string | null
          error_message?: string | null
          event_id?: string | null
          id?: string
          metadata?: Json
          participant_id?: string | null
          person_id?: string | null
          sent_at?: string | null
          session_id?: string | null
          status?: Database["public"]["Enums"]["communication_status"]
          subject?: string | null
          template_id?: string | null
          to_address?: string | null
          wati_local_message_id?: string | null
          whatsapp_estado?: string | null
          whatsapp_failed_code?: string | null
          whatsapp_failed_detail?: string | null
          whatsapp_last_event_at?: string | null
        }
        Update: {
          archived_at?: string | null
          archived_by?: string | null
          batch_id?: string | null
          body?: string | null
          channel?: Database["public"]["Enums"]["communication_channel"]
          created_at?: string
          created_by?: string | null
          error_message?: string | null
          event_id?: string | null
          id?: string
          metadata?: Json
          participant_id?: string | null
          person_id?: string | null
          sent_at?: string | null
          session_id?: string | null
          status?: Database["public"]["Enums"]["communication_status"]
          subject?: string | null
          template_id?: string | null
          to_address?: string | null
          wati_local_message_id?: string | null
          whatsapp_estado?: string | null
          whatsapp_failed_code?: string | null
          whatsapp_failed_detail?: string | null
          whatsapp_last_event_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "communication_logs_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "import_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "communication_logs_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "communication_logs_participant_id_fkey"
            columns: ["participant_id"]
            isOneToOne: false
            referencedRelation: "event_participants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "communication_logs_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "communication_logs_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "event_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "communication_logs_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "event_sessions_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "communication_logs_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "communication_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      communication_templates: {
        Row: {
          body: string
          channel: Database["public"]["Enums"]["communication_channel"]
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          name: string
          subject: string | null
          updated_at: string
          variables: Json
        }
        Insert: {
          body: string
          channel: Database["public"]["Enums"]["communication_channel"]
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          name: string
          subject?: string | null
          updated_at?: string
          variables?: Json
        }
        Update: {
          body?: string
          channel?: Database["public"]["Enums"]["communication_channel"]
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          name?: string
          subject?: string | null
          updated_at?: string
          variables?: Json
        }
        Relationships: []
      }
      companions: {
        Row: {
          age: number | null
          created_at: string
          dni: string | null
          email: string | null
          first_name: string | null
          id: string
          last_name: string | null
          notes: string | null
          participant_id: string
          phone: string | null
          seat_number: string | null
          seat_row: string | null
          seat_zone: string | null
        }
        Insert: {
          age?: number | null
          created_at?: string
          dni?: string | null
          email?: string | null
          first_name?: string | null
          id?: string
          last_name?: string | null
          notes?: string | null
          participant_id: string
          phone?: string | null
          seat_number?: string | null
          seat_row?: string | null
          seat_zone?: string | null
        }
        Update: {
          age?: number | null
          created_at?: string
          dni?: string | null
          email?: string | null
          first_name?: string | null
          id?: string
          last_name?: string | null
          notes?: string | null
          participant_id?: string
          phone?: string | null
          seat_number?: string | null
          seat_row?: string | null
          seat_zone?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "companions_participant_id_fkey"
            columns: ["participant_id"]
            isOneToOne: false
            referencedRelation: "event_participants"
            referencedColumns: ["id"]
          },
        ]
      }
      consent_records: {
        Row: {
          accepted: boolean
          accepted_at: string
          consent_kind: Database["public"]["Enums"]["consent_kind"]
          id: string
          ip_address: unknown
          legal_text_id: string
          participant_id: string | null
          person_id: string
          submission_id: string | null
          user_agent: string | null
        }
        Insert: {
          accepted: boolean
          accepted_at?: string
          consent_kind: Database["public"]["Enums"]["consent_kind"]
          id?: string
          ip_address?: unknown
          legal_text_id: string
          participant_id?: string | null
          person_id: string
          submission_id?: string | null
          user_agent?: string | null
        }
        Update: {
          accepted?: boolean
          accepted_at?: string
          consent_kind?: Database["public"]["Enums"]["consent_kind"]
          id?: string
          ip_address?: unknown
          legal_text_id?: string
          participant_id?: string | null
          person_id?: string
          submission_id?: string | null
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "consent_records_legal_text_id_fkey"
            columns: ["legal_text_id"]
            isOneToOne: false
            referencedRelation: "legal_texts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consent_records_participant_id_fkey"
            columns: ["participant_id"]
            isOneToOne: false
            referencedRelation: "event_participants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consent_records_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consent_records_submission_id_fkey"
            columns: ["submission_id"]
            isOneToOne: false
            referencedRelation: "form_submissions"
            referencedColumns: ["id"]
          },
        ]
      }
      event_assignments: {
        Row: {
          client_id: string | null
          created_at: string
          event_id: string
          filter_config: Json
          id: string
          role: Database["public"]["Enums"]["assignment_role"]
          session_id: string | null
          user_id: string | null
        }
        Insert: {
          client_id?: string | null
          created_at?: string
          event_id: string
          filter_config?: Json
          id?: string
          role: Database["public"]["Enums"]["assignment_role"]
          session_id?: string | null
          user_id?: string | null
        }
        Update: {
          client_id?: string | null
          created_at?: string
          event_id?: string
          filter_config?: Json
          id?: string
          role?: Database["public"]["Enums"]["assignment_role"]
          session_id?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "event_assignments_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_assignments_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_assignments_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "event_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_assignments_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "event_sessions_public"
            referencedColumns: ["id"]
          },
        ]
      }
      event_participants: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          attendee_type: Database["public"]["Enums"]["attendee_type"]
          cancellation_reason: string | null
          cancellation_reason_by_attendee: string | null
          cancelled_at: string | null
          companions_count: number
          confirmation_token: string | null
          confirmed_at: string | null
          created_at: string
          event_id: string
          id: string
          import_batch_id: string | null
          internal_notes: string | null
          person_id: string
          public_form_id: string | null
          seat_locked: boolean
          seat_number: string | null
          seat_row: string | null
          seat_zone: string | null
          session_id: string
          status: Database["public"]["Enums"]["participant_status"]
          submission_id: string | null
          updated_at: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          attendee_type?: Database["public"]["Enums"]["attendee_type"]
          cancellation_reason?: string | null
          cancellation_reason_by_attendee?: string | null
          cancelled_at?: string | null
          companions_count?: number
          confirmation_token?: string | null
          confirmed_at?: string | null
          created_at?: string
          event_id: string
          id?: string
          import_batch_id?: string | null
          internal_notes?: string | null
          person_id: string
          public_form_id?: string | null
          seat_locked?: boolean
          seat_number?: string | null
          seat_row?: string | null
          seat_zone?: string | null
          session_id: string
          status?: Database["public"]["Enums"]["participant_status"]
          submission_id?: string | null
          updated_at?: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          attendee_type?: Database["public"]["Enums"]["attendee_type"]
          cancellation_reason?: string | null
          cancellation_reason_by_attendee?: string | null
          cancelled_at?: string | null
          companions_count?: number
          confirmation_token?: string | null
          confirmed_at?: string | null
          created_at?: string
          event_id?: string
          id?: string
          import_batch_id?: string | null
          internal_notes?: string | null
          person_id?: string
          public_form_id?: string | null
          seat_locked?: boolean
          seat_number?: string | null
          seat_row?: string | null
          seat_zone?: string | null
          session_id?: string
          status?: Database["public"]["Enums"]["participant_status"]
          submission_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_participants_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_participants_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_participants_public_form_id_fkey"
            columns: ["public_form_id"]
            isOneToOne: false
            referencedRelation: "public_forms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_participants_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "event_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_participants_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "event_sessions_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_participants_submission_fk"
            columns: ["submission_id"]
            isOneToOne: false
            referencedRelation: "form_submissions"
            referencedColumns: ["id"]
          },
        ]
      }
      event_sessions: {
        Row: {
          access_time: string | null
          allow_companions: boolean
          capacity: number
          companions_qr_mode: Database["public"]["Enums"]["companions_qr_mode"]
          created_at: string
          description: string | null
          doors_open_at: string | null
          end_time_estimate: string | null
          ends_at: string | null
          event_id: string
          field_requirements: Json
          id: string
          inherit_event_fields: boolean
          location_address: string | null
          location_name: string | null
          max_companions_per_participant: number
          max_validators: number
          min_age: number
          name: string
          notes: string | null
          public_form_enabled: boolean
          specific_instructions: string | null
          starts_at: string
          status: Database["public"]["Enums"]["session_status"]
          updated_at: string
          user_selectable: boolean
          venue_address: string | null
          venue_plan_id: string | null
          waitlist_enabled: boolean
        }
        Insert: {
          access_time?: string | null
          allow_companions?: boolean
          capacity?: number
          companions_qr_mode?: Database["public"]["Enums"]["companions_qr_mode"]
          created_at?: string
          description?: string | null
          doors_open_at?: string | null
          end_time_estimate?: string | null
          ends_at?: string | null
          event_id: string
          field_requirements?: Json
          id?: string
          inherit_event_fields?: boolean
          location_address?: string | null
          location_name?: string | null
          max_companions_per_participant?: number
          max_validators?: number
          min_age?: number
          name: string
          notes?: string | null
          public_form_enabled?: boolean
          specific_instructions?: string | null
          starts_at: string
          status?: Database["public"]["Enums"]["session_status"]
          updated_at?: string
          user_selectable?: boolean
          venue_address?: string | null
          venue_plan_id?: string | null
          waitlist_enabled?: boolean
        }
        Update: {
          access_time?: string | null
          allow_companions?: boolean
          capacity?: number
          companions_qr_mode?: Database["public"]["Enums"]["companions_qr_mode"]
          created_at?: string
          description?: string | null
          doors_open_at?: string | null
          end_time_estimate?: string | null
          ends_at?: string | null
          event_id?: string
          field_requirements?: Json
          id?: string
          inherit_event_fields?: boolean
          location_address?: string | null
          location_name?: string | null
          max_companions_per_participant?: number
          max_validators?: number
          min_age?: number
          name?: string
          notes?: string | null
          public_form_enabled?: boolean
          specific_instructions?: string | null
          starts_at?: string
          status?: Database["public"]["Enums"]["session_status"]
          updated_at?: string
          user_selectable?: boolean
          venue_address?: string | null
          venue_plan_id?: string | null
          waitlist_enabled?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "event_sessions_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_sessions_venue_plan_id_fkey"
            columns: ["venue_plan_id"]
            isOneToOne: false
            referencedRelation: "venue_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      events: {
        Row: {
          brand_color: string | null
          city: string | null
          client_id: string | null
          cover_image_url: string | null
          created_at: string
          created_by: string | null
          default_allow_companions: boolean
          default_companions_qr_mode: Database["public"]["Enums"]["companions_qr_mode"]
          default_max_companions: number
          default_min_age: number
          default_waitlist_enabled: boolean
          description: string | null
          ends_at: string | null
          event_type: Database["public"]["Enums"]["event_type"]
          field_requirements: Json
          general_instructions: string | null
          id: string
          location_address: string | null
          location_name: string | null
          logo_url: string | null
          name: string
          province: string | null
          public_registration_enabled: boolean
          requires_approval: boolean
          requires_confirmation: boolean
          requires_image_consent: boolean
          requires_recording: boolean
          slug: string | null
          starts_at: string | null
          status: Database["public"]["Enums"]["event_status"]
          ticket_design: Json
          updated_at: string
          user_can_choose_session: boolean
        }
        Insert: {
          brand_color?: string | null
          city?: string | null
          client_id?: string | null
          cover_image_url?: string | null
          created_at?: string
          created_by?: string | null
          default_allow_companions?: boolean
          default_companions_qr_mode?: Database["public"]["Enums"]["companions_qr_mode"]
          default_max_companions?: number
          default_min_age?: number
          default_waitlist_enabled?: boolean
          description?: string | null
          ends_at?: string | null
          event_type?: Database["public"]["Enums"]["event_type"]
          field_requirements?: Json
          general_instructions?: string | null
          id?: string
          location_address?: string | null
          location_name?: string | null
          logo_url?: string | null
          name: string
          province?: string | null
          public_registration_enabled?: boolean
          requires_approval?: boolean
          requires_confirmation?: boolean
          requires_image_consent?: boolean
          requires_recording?: boolean
          slug?: string | null
          starts_at?: string | null
          status?: Database["public"]["Enums"]["event_status"]
          ticket_design?: Json
          updated_at?: string
          user_can_choose_session?: boolean
        }
        Update: {
          brand_color?: string | null
          city?: string | null
          client_id?: string | null
          cover_image_url?: string | null
          created_at?: string
          created_by?: string | null
          default_allow_companions?: boolean
          default_companions_qr_mode?: Database["public"]["Enums"]["companions_qr_mode"]
          default_max_companions?: number
          default_min_age?: number
          default_waitlist_enabled?: boolean
          description?: string | null
          ends_at?: string | null
          event_type?: Database["public"]["Enums"]["event_type"]
          field_requirements?: Json
          general_instructions?: string | null
          id?: string
          location_address?: string | null
          location_name?: string | null
          logo_url?: string | null
          name?: string
          province?: string | null
          public_registration_enabled?: boolean
          requires_approval?: boolean
          requires_confirmation?: boolean
          requires_image_consent?: boolean
          requires_recording?: boolean
          slug?: string | null
          starts_at?: string | null
          status?: Database["public"]["Enums"]["event_status"]
          ticket_design?: Json
          updated_at?: string
          user_can_choose_session?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "events_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      form_submissions: {
        Row: {
          event_id: string
          form_id: string
          id: string
          ip_address: unknown
          payload: Json
          person_id: string | null
          processed: boolean
          processed_at: string | null
          session_id: string | null
          submitted_at: string
          user_agent: string | null
        }
        Insert: {
          event_id: string
          form_id: string
          id?: string
          ip_address?: unknown
          payload?: Json
          person_id?: string | null
          processed?: boolean
          processed_at?: string | null
          session_id?: string | null
          submitted_at?: string
          user_agent?: string | null
        }
        Update: {
          event_id?: string
          form_id?: string
          id?: string
          ip_address?: unknown
          payload?: Json
          person_id?: string | null
          processed?: boolean
          processed_at?: string | null
          session_id?: string | null
          submitted_at?: string
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "form_submissions_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "form_submissions_form_id_fkey"
            columns: ["form_id"]
            isOneToOne: false
            referencedRelation: "public_forms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "form_submissions_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "form_submissions_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "event_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "form_submissions_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "event_sessions_public"
            referencedColumns: ["id"]
          },
        ]
      }
      import_batches: {
        Row: {
          completed_at: string | null
          created_at: string
          created_by: string | null
          error_rows: number
          errors: Json
          event_id: string | null
          filename: string
          id: string
          imported_rows: number
          session_id: string | null
          source: string | null
          status: Database["public"]["Enums"]["import_status"]
          total_rows: number
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          error_rows?: number
          errors?: Json
          event_id?: string | null
          filename: string
          id?: string
          imported_rows?: number
          session_id?: string | null
          source?: string | null
          status?: Database["public"]["Enums"]["import_status"]
          total_rows?: number
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          error_rows?: number
          errors?: Json
          event_id?: string | null
          filename?: string
          id?: string
          imported_rows?: number
          session_id?: string | null
          source?: string | null
          status?: Database["public"]["Enums"]["import_status"]
          total_rows?: number
        }
        Relationships: [
          {
            foreignKeyName: "import_batches_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "import_batches_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "event_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "import_batches_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "event_sessions_public"
            referencedColumns: ["id"]
          },
        ]
      }
      import_mappings: {
        Row: {
          batch_id: string
          created_at: string
          id: string
          source_column: string
          target_field: string
          transform: string | null
        }
        Insert: {
          batch_id: string
          created_at?: string
          id?: string
          source_column: string
          target_field: string
          transform?: string | null
        }
        Update: {
          batch_id?: string
          created_at?: string
          id?: string
          source_column?: string
          target_field?: string
          transform?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "import_mappings_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "import_batches"
            referencedColumns: ["id"]
          },
        ]
      }
      import_row_results: {
        Row: {
          batch_id: string
          created_at: string
          error_message: string | null
          id: string
          match_reason: string | null
          outcome: string
          participant_id: string | null
          raw_row: Json
          row_number: number
        }
        Insert: {
          batch_id: string
          created_at?: string
          error_message?: string | null
          id?: string
          match_reason?: string | null
          outcome: string
          participant_id?: string | null
          raw_row?: Json
          row_number: number
        }
        Update: {
          batch_id?: string
          created_at?: string
          error_message?: string | null
          id?: string
          match_reason?: string | null
          outcome?: string
          participant_id?: string | null
          raw_row?: Json
          row_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "import_row_results_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "import_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "import_row_results_participant_id_fkey"
            columns: ["participant_id"]
            isOneToOne: false
            referencedRelation: "event_participants"
            referencedColumns: ["id"]
          },
        ]
      }
      incidents: {
        Row: {
          assigned_to: string | null
          category: Database["public"]["Enums"]["incident_category"]
          created_at: string
          description: string | null
          event_id: string | null
          id: string
          incident_type: Database["public"]["Enums"]["incident_type"]
          participant_id: string | null
          reported_by: string | null
          resolution: string | null
          resolved_at: string | null
          resolved_by: string | null
          session_id: string | null
          severity: Database["public"]["Enums"]["incident_severity"]
          status: Database["public"]["Enums"]["incident_status"]
          title: string
          updated_at: string
          walk_in_companions: number
          walk_in_dni: string | null
          walk_in_first_name: string | null
          walk_in_last_name: string | null
        }
        Insert: {
          assigned_to?: string | null
          category?: Database["public"]["Enums"]["incident_category"]
          created_at?: string
          description?: string | null
          event_id?: string | null
          id?: string
          incident_type?: Database["public"]["Enums"]["incident_type"]
          participant_id?: string | null
          reported_by?: string | null
          resolution?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          session_id?: string | null
          severity?: Database["public"]["Enums"]["incident_severity"]
          status?: Database["public"]["Enums"]["incident_status"]
          title: string
          updated_at?: string
          walk_in_companions?: number
          walk_in_dni?: string | null
          walk_in_first_name?: string | null
          walk_in_last_name?: string | null
        }
        Update: {
          assigned_to?: string | null
          category?: Database["public"]["Enums"]["incident_category"]
          created_at?: string
          description?: string | null
          event_id?: string | null
          id?: string
          incident_type?: Database["public"]["Enums"]["incident_type"]
          participant_id?: string | null
          reported_by?: string | null
          resolution?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          session_id?: string | null
          severity?: Database["public"]["Enums"]["incident_severity"]
          status?: Database["public"]["Enums"]["incident_status"]
          title?: string
          updated_at?: string
          walk_in_companions?: number
          walk_in_dni?: string | null
          walk_in_first_name?: string | null
          walk_in_last_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "incidents_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "incidents_participant_id_fkey"
            columns: ["participant_id"]
            isOneToOne: false
            referencedRelation: "event_participants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "incidents_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "event_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "incidents_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "event_sessions_public"
            referencedColumns: ["id"]
          },
        ]
      }
      legal_texts: {
        Row: {
          body: string
          created_at: string
          created_by: string | null
          effective_from: string
          id: string
          is_active: boolean
          kind: Database["public"]["Enums"]["legal_text_kind"]
          title: string
          version: string
        }
        Insert: {
          body: string
          created_at?: string
          created_by?: string | null
          effective_from?: string
          id?: string
          is_active?: boolean
          kind: Database["public"]["Enums"]["legal_text_kind"]
          title: string
          version: string
        }
        Update: {
          body?: string
          created_at?: string
          created_by?: string | null
          effective_from?: string
          id?: string
          is_active?: boolean
          kind?: Database["public"]["Enums"]["legal_text_kind"]
          title?: string
          version?: string
        }
        Relationships: []
      }
      people: {
        Row: {
          birth_date: string | null
          blocked_reason: string | null
          city: string | null
          country: string | null
          created_at: string
          created_by: string | null
          dni: string | null
          email: string | null
          first_name: string
          gender: string | null
          id: string
          is_blocked: boolean
          last_name: string | null
          notes: string | null
          phone: string | null
          province: string | null
          source: string | null
          updated_at: string
        }
        Insert: {
          birth_date?: string | null
          blocked_reason?: string | null
          city?: string | null
          country?: string | null
          created_at?: string
          created_by?: string | null
          dni?: string | null
          email?: string | null
          first_name: string
          gender?: string | null
          id?: string
          is_blocked?: boolean
          last_name?: string | null
          notes?: string | null
          phone?: string | null
          province?: string | null
          source?: string | null
          updated_at?: string
        }
        Update: {
          birth_date?: string | null
          blocked_reason?: string | null
          city?: string | null
          country?: string | null
          created_at?: string
          created_by?: string | null
          dni?: string | null
          email?: string | null
          first_name?: string
          gender?: string | null
          id?: string
          is_blocked?: boolean
          last_name?: string | null
          notes?: string | null
          phone?: string | null
          province?: string | null
          source?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          email: string | null
          full_name: string | null
          id: string
          is_active: boolean
          phone: string | null
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id: string
          is_active?: boolean
          phone?: string | null
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          is_active?: boolean
          phone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      public_forms: {
        Row: {
          attendee_type: Database["public"]["Enums"]["attendee_type"]
          closed_for_capacity: boolean
          closes_at: string | null
          created_at: string
          created_by: string | null
          description: string | null
          event_id: string
          field_config: Json
          fields_schema: Json
          header_image_url: string | null
          id: string
          intro_text: string | null
          max_submissions: number | null
          offers_future_processes_consent: boolean
          opens_at: string | null
          requires_image_consent: boolean
          requires_privacy_consent: boolean
          session_id: string | null
          slug: string
          status: Database["public"]["Enums"]["form_status"]
          title: string
          updated_at: string
        }
        Insert: {
          attendee_type?: Database["public"]["Enums"]["attendee_type"]
          closed_for_capacity?: boolean
          closes_at?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          event_id: string
          field_config?: Json
          fields_schema?: Json
          header_image_url?: string | null
          id?: string
          intro_text?: string | null
          max_submissions?: number | null
          offers_future_processes_consent?: boolean
          opens_at?: string | null
          requires_image_consent?: boolean
          requires_privacy_consent?: boolean
          session_id?: string | null
          slug: string
          status?: Database["public"]["Enums"]["form_status"]
          title: string
          updated_at?: string
        }
        Update: {
          attendee_type?: Database["public"]["Enums"]["attendee_type"]
          closed_for_capacity?: boolean
          closes_at?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          event_id?: string
          field_config?: Json
          fields_schema?: Json
          header_image_url?: string | null
          id?: string
          intro_text?: string | null
          max_submissions?: number | null
          offers_future_processes_consent?: boolean
          opens_at?: string | null
          requires_image_consent?: boolean
          requires_privacy_consent?: boolean
          session_id?: string | null
          slug?: string
          status?: Database["public"]["Enums"]["form_status"]
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "public_forms_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "public_forms_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "event_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "public_forms_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "event_sessions_public"
            referencedColumns: ["id"]
          },
        ]
      }
      session_seat_overrides: {
        Row: {
          category: Database["public"]["Enums"]["seat_override_category"]
          color: string | null
          created_at: string
          created_by: string | null
          id: string
          notes: string | null
          seat_number: string
          seat_row: string
          seat_zone: string
          session_id: string
          updated_at: string
        }
        Insert: {
          category: Database["public"]["Enums"]["seat_override_category"]
          color?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          seat_number: string
          seat_row: string
          seat_zone: string
          session_id: string
          updated_at?: string
        }
        Update: {
          category?: Database["public"]["Enums"]["seat_override_category"]
          color?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          seat_number?: string
          seat_row?: string
          seat_zone?: string
          session_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "session_seat_overrides_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "event_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "session_seat_overrides_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "event_sessions_public"
            referencedColumns: ["id"]
          },
        ]
      }
      ticket_designs: {
        Row: {
          created_at: string
          created_by: string | null
          design: Json
          id: string
          is_global_default: boolean
          name: string
          scope_event_id: string | null
          scope_session_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          design?: Json
          id?: string
          is_global_default?: boolean
          name: string
          scope_event_id?: string | null
          scope_session_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          design?: Json
          id?: string
          is_global_default?: boolean
          name?: string
          scope_event_id?: string | null
          scope_session_id?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      tickets: {
        Row: {
          companion_id: string | null
          created_at: string
          event_id: string
          expires_at: string | null
          id: string
          issued_at: string
          participant_id: string
          qr_payload: Json
          qr_token: string
          revoked: boolean
          revoked_at: string | null
          revoked_reason: string | null
          session_id: string
        }
        Insert: {
          companion_id?: string | null
          created_at?: string
          event_id: string
          expires_at?: string | null
          id?: string
          issued_at?: string
          participant_id: string
          qr_payload?: Json
          qr_token: string
          revoked?: boolean
          revoked_at?: string | null
          revoked_reason?: string | null
          session_id: string
        }
        Update: {
          companion_id?: string | null
          created_at?: string
          event_id?: string
          expires_at?: string | null
          id?: string
          issued_at?: string
          participant_id?: string
          qr_payload?: Json
          qr_token?: string
          revoked?: boolean
          revoked_at?: string | null
          revoked_reason?: string | null
          session_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tickets_companion_id_fkey"
            columns: ["companion_id"]
            isOneToOne: false
            referencedRelation: "companions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_participant_id_fkey"
            columns: ["participant_id"]
            isOneToOne: false
            referencedRelation: "event_participants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "event_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "event_sessions_public"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      venue_plans: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          name: string
          notes: string | null
          updated_at: string
          venue_id: string
          version: number
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          notes?: string | null
          updated_at?: string
          venue_id: string
          version?: number
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          notes?: string | null
          updated_at?: string
          venue_id?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "venue_plans_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      venue_seats: {
        Row: {
          col_index: number
          created_at: string
          default_category: string
          id: string
          is_active: boolean
          notes: string | null
          plan_id: string
          row_index: number
          row_label: string
          seat_number: string
          updated_at: string
          zone_id: string
        }
        Insert: {
          col_index?: number
          created_at?: string
          default_category?: string
          id?: string
          is_active?: boolean
          notes?: string | null
          plan_id: string
          row_index?: number
          row_label: string
          seat_number: string
          updated_at?: string
          zone_id: string
        }
        Update: {
          col_index?: number
          created_at?: string
          default_category?: string
          id?: string
          is_active?: boolean
          notes?: string | null
          plan_id?: string
          row_index?: number
          row_label?: string
          seat_number?: string
          updated_at?: string
          zone_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "venue_seats_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "venue_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "venue_seats_zone_id_fkey"
            columns: ["zone_id"]
            isOneToOne: false
            referencedRelation: "venue_zones"
            referencedColumns: ["id"]
          },
        ]
      }
      venue_zones: {
        Row: {
          color: string
          created_at: string
          display_order: number
          id: string
          name: string
          plan_id: string
          updated_at: string
        }
        Insert: {
          color?: string
          created_at?: string
          display_order?: number
          id?: string
          name: string
          plan_id: string
          updated_at?: string
        }
        Update: {
          color?: string
          created_at?: string
          display_order?: number
          id?: string
          name?: string
          plan_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "venue_zones_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "venue_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      venues: {
        Row: {
          city: string | null
          created_at: string
          id: string
          name: string
          notes: string | null
          updated_at: string
        }
        Insert: {
          city?: string | null
          created_at?: string
          id?: string
          name: string
          notes?: string | null
          updated_at?: string
        }
        Update: {
          city?: string | null
          created_at?: string
          id?: string
          name?: string
          notes?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      whatsapp_drain_locks: {
        Row: {
          acquired_at: string
          acquired_by: string | null
          expires_at: string
          lock_key: string
        }
        Insert: {
          acquired_at?: string
          acquired_by?: string | null
          expires_at: string
          lock_key: string
        }
        Update: {
          acquired_at?: string
          acquired_by?: string | null
          expires_at?: string
          lock_key?: string
        }
        Relationships: []
      }
    }
    Views: {
      event_sessions_public: {
        Row: {
          allow_companions: boolean | null
          capacity: number | null
          companions_qr_mode:
            | Database["public"]["Enums"]["companions_qr_mode"]
            | null
          created_at: string | null
          description: string | null
          doors_open_at: string | null
          ends_at: string | null
          event_id: string | null
          field_requirements: Json | null
          id: string | null
          inherit_event_fields: boolean | null
          location_address: string | null
          location_name: string | null
          max_companions_per_participant: number | null
          min_age: number | null
          name: string | null
          public_form_enabled: boolean | null
          starts_at: string | null
          status: Database["public"]["Enums"]["session_status"] | null
          updated_at: string | null
          user_selectable: boolean | null
          waitlist_enabled: boolean | null
        }
        Insert: {
          allow_companions?: boolean | null
          capacity?: number | null
          companions_qr_mode?:
            | Database["public"]["Enums"]["companions_qr_mode"]
            | null
          created_at?: string | null
          description?: string | null
          doors_open_at?: string | null
          ends_at?: string | null
          event_id?: string | null
          field_requirements?: Json | null
          id?: string | null
          inherit_event_fields?: boolean | null
          location_address?: string | null
          location_name?: string | null
          max_companions_per_participant?: number | null
          min_age?: number | null
          name?: string | null
          public_form_enabled?: boolean | null
          starts_at?: string | null
          status?: Database["public"]["Enums"]["session_status"] | null
          updated_at?: string | null
          user_selectable?: boolean | null
          waitlist_enabled?: boolean | null
        }
        Update: {
          allow_companions?: boolean | null
          capacity?: number | null
          companions_qr_mode?:
            | Database["public"]["Enums"]["companions_qr_mode"]
            | null
          created_at?: string | null
          description?: string | null
          doors_open_at?: string | null
          ends_at?: string | null
          event_id?: string | null
          field_requirements?: Json | null
          id?: string | null
          inherit_event_fields?: boolean | null
          location_address?: string | null
          location_name?: string | null
          max_companions_per_participant?: number | null
          min_age?: number | null
          name?: string | null
          public_form_enabled?: boolean | null
          starts_at?: string | null
          status?: Database["public"]["Enums"]["session_status"] | null
          updated_at?: string | null
          user_selectable?: boolean | null
          waitlist_enabled?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "event_sessions_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      admin_archive_communication_logs: {
        Args: { _log_ids: string[] }
        Returns: Json
      }
      admin_delete_communication_logs: {
        Args: { _log_ids: string[] }
        Returns: Json
      }
      admin_delete_import_batch: {
        Args: { _batch_id: string; _delete_participants?: boolean }
        Returns: Json
      }
      admin_delete_participants: {
        Args: { _participant_ids: string[] }
        Returns: Json
      }
      admin_delete_tickets: { Args: { _ticket_ids: string[] }; Returns: Json }
      anonymize_person: {
        Args: { _person_id: string; _reason?: string }
        Returns: undefined
      }
      client_user_has_event: {
        Args: { _event_id: string; _user_id: string }
        Returns: boolean
      }
      get_my_roles: {
        Args: never
        Returns: {
          role: Database["public"]["Enums"]["app_role"]
        }[]
      }
      has_any_assignment: { Args: { _user_id: string }; Returns: boolean }
      has_any_role: {
        Args: {
          _roles: Database["public"]["Enums"]["app_role"][]
          _user_id: string
        }
        Returns: boolean
      }
      has_event_assignment: {
        Args: {
          _event_id: string
          _role: Database["public"]["Enums"]["assignment_role"]
          _user_id: string
        }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      has_session_assignment: {
        Args: {
          _role: Database["public"]["Enums"]["assignment_role"]
          _session_id: string
          _user_id: string
        }
        Returns: boolean
      }
      is_admin: { Args: { _user_id: string }; Returns: boolean }
      log_audit: {
        Args: {
          _action: string
          _changes?: Json
          _entity_id: string
          _entity_type: string
          _event_id?: string
          _session_id?: string
        }
        Returns: string
      }
      submit_public_form: { Args: { _payload: Json }; Returns: Json }
    }
    Enums: {
      app_role:
        | "superadmin"
        | "admin_figurarte"
        | "coordinador"
        | "validador"
        | "cliente_productora"
      assignment_role: "coordinador" | "validador" | "cliente_productora"
      attendee_type:
        | "publico"
        | "figurante"
        | "casting"
        | "vip"
        | "prensa"
        | "equipo"
        | "acompanante"
        | "otro"
      checkin_result:
        | "ok"
        | "duplicado"
        | "no_valido"
        | "cancelado"
        | "fuera_de_horario"
        | "incidencia"
      communication_channel:
        | "email"
        | "whatsapp_asistido"
        | "sms"
        | "manual"
        | "whatsapp_business"
      communication_status:
        | "pendiente"
        | "enviado"
        | "fallido"
        | "programado"
        | "cancelado"
      companions_qr_mode: "mismo_qr" | "qr_propio"
      consent_kind: "privacidad" | "imagen" | "futuros_procesos"
      event_status:
        | "borrador"
        | "publicado"
        | "cerrado"
        | "cancelado"
        | "archivado"
      event_type:
        | "publico_tv"
        | "grabacion"
        | "casting"
        | "premiere"
        | "produccion"
        | "otro"
        | "evento_privado"
      form_status: "borrador" | "publicado" | "cerrado" | "archivado"
      import_status:
        | "pendiente"
        | "procesando"
        | "completada"
        | "completada_con_errores"
        | "fallida"
      incident_category: "entrada" | "otra"
      incident_severity: "baja" | "media" | "alta" | "critica"
      incident_status: "abierta" | "en_proceso" | "resuelta" | "descartada"
      incident_type:
        | "qr_ya_usado"
        | "qr_no_valido"
        | "sin_dni"
        | "dni_no_coincide"
        | "no_aparece_lista"
        | "no_confirmado"
        | "acompanante_no_registrado"
        | "menor_sin_autorizacion"
        | "fuera_horario"
        | "cambio_sesion"
        | "vip_especial"
        | "persona_bloqueada"
        | "problema_tecnico"
        | "manual"
        | "no_recibio_qr"
        | "sin_movil"
        | "invitado_extra"
        | "perdida_objeto"
        | "problema_salud"
        | "conflicto_personal"
        | "queja"
        | "otro"
      legal_text_kind:
        | "privacidad"
        | "imagen"
        | "futuros_procesos"
        | "terminos"
        | "otro"
      participant_status:
        | "solicitud_recibida"
        | "pendiente_revision"
        | "aprobado"
        | "rechazado"
        | "lista_espera"
        | "invitacion_enviada"
        | "pendiente_confirmacion"
        | "confirmado"
        | "cancelado_asistente"
        | "cancelado_figurarte"
        | "qr_generado"
        | "acceso_validado"
        | "no_presentado"
        | "incidencia"
        | "bloqueado"
        | "aceptado_pendiente_envio"
      seat_override_category:
        | "reservado_camaras"
        | "bloqueado"
        | "movilidad_reducida"
        | "acompanante_mr"
        | "visibilidad_reducida"
      session_status:
        | "programada"
        | "abierta"
        | "cerrada"
        | "cancelada"
        | "completada"
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
      app_role: [
        "superadmin",
        "admin_figurarte",
        "coordinador",
        "validador",
        "cliente_productora",
      ],
      assignment_role: ["coordinador", "validador", "cliente_productora"],
      attendee_type: [
        "publico",
        "figurante",
        "casting",
        "vip",
        "prensa",
        "equipo",
        "acompanante",
        "otro",
      ],
      checkin_result: [
        "ok",
        "duplicado",
        "no_valido",
        "cancelado",
        "fuera_de_horario",
        "incidencia",
      ],
      communication_channel: [
        "email",
        "whatsapp_asistido",
        "sms",
        "manual",
        "whatsapp_business",
      ],
      communication_status: [
        "pendiente",
        "enviado",
        "fallido",
        "programado",
        "cancelado",
      ],
      companions_qr_mode: ["mismo_qr", "qr_propio"],
      consent_kind: ["privacidad", "imagen", "futuros_procesos"],
      event_status: [
        "borrador",
        "publicado",
        "cerrado",
        "cancelado",
        "archivado",
      ],
      event_type: [
        "publico_tv",
        "grabacion",
        "casting",
        "premiere",
        "produccion",
        "otro",
        "evento_privado",
      ],
      form_status: ["borrador", "publicado", "cerrado", "archivado"],
      import_status: [
        "pendiente",
        "procesando",
        "completada",
        "completada_con_errores",
        "fallida",
      ],
      incident_category: ["entrada", "otra"],
      incident_severity: ["baja", "media", "alta", "critica"],
      incident_status: ["abierta", "en_proceso", "resuelta", "descartada"],
      incident_type: [
        "qr_ya_usado",
        "qr_no_valido",
        "sin_dni",
        "dni_no_coincide",
        "no_aparece_lista",
        "no_confirmado",
        "acompanante_no_registrado",
        "menor_sin_autorizacion",
        "fuera_horario",
        "cambio_sesion",
        "vip_especial",
        "persona_bloqueada",
        "problema_tecnico",
        "manual",
        "no_recibio_qr",
        "sin_movil",
        "invitado_extra",
        "perdida_objeto",
        "problema_salud",
        "conflicto_personal",
        "queja",
        "otro",
      ],
      legal_text_kind: [
        "privacidad",
        "imagen",
        "futuros_procesos",
        "terminos",
        "otro",
      ],
      participant_status: [
        "solicitud_recibida",
        "pendiente_revision",
        "aprobado",
        "rechazado",
        "lista_espera",
        "invitacion_enviada",
        "pendiente_confirmacion",
        "confirmado",
        "cancelado_asistente",
        "cancelado_figurarte",
        "qr_generado",
        "acceso_validado",
        "no_presentado",
        "incidencia",
        "bloqueado",
        "aceptado_pendiente_envio",
      ],
      seat_override_category: [
        "reservado_camaras",
        "bloqueado",
        "movilidad_reducida",
        "acompanante_mr",
        "visibilidad_reducida",
      ],
      session_status: [
        "programada",
        "abierta",
        "cerrada",
        "cancelada",
        "completada",
      ],
    },
  },
} as const
