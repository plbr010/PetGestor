/**
 * Tipos do banco Supabase — PetGestor (Etapa 3)
 *
 * Modelados manualmente com base na migration auth_multi_tenant.
 * Futuramente substituir por geração automática:
 *   npx supabase gen types typescript --project-id <id> > src/types/database.types.ts
 */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type CompanyRole = "owner" | "admin" | "staff";
export type PetSpecies = "dog" | "cat" | "other";
export type PetSex = "male" | "female" | "unknown";
export type ServicePricingMode = "fixed" | "by_size";
export type PetSize = "small" | "medium" | "large" | "giant";
export type AppointmentStatus =
  | "scheduled"
  | "confirmed"
  | "in_progress"
  | "completed"
  | "cancelled"
  | "no_show";
export type ServiceOrderStatus =
  | "waiting"
  | "in_progress"
  | "ready"
  | "completed"
  | "cancelled";
export type SubscriptionStatus = "trialing" | "active" | "past_due" | "cancelled";
export type PlatformAdminRole = "platform_owner";
export type FinancialEntryType = "income" | "expense";
export type FinancialEntryStatus = "pending" | "partially_paid" | "paid" | "cancelled";
export type FinancialSourceType = "service_order" | "manual" | "service_package" | "sale";
export type SaleStatus = "open" | "completed" | "partially_paid" | "cancelled";
export type DiscountType = "fixed" | "percent";
export type CustomerPackageStatus = "active" | "expired" | "fully_used" | "cancelled";
export type PackageUsageStatus = "consumed" | "reversed";
export type PaymentMethod =
  | "cash"
  | "pix"
  | "debit_card"
  | "credit_card"
  | "bank_transfer"
  | "other";
export type NotificationType =
  | "appointment_confirmation"
  | "appointment_reminder_24h"
  | "appointment_reminder_2h"
  | "customer_same_day_reminder"
  | "pet_ready"
  | "employee_same_day_reminder"
  | "employee_2h_reminder";
export type NotificationRecipientType = "customer" | "employee";
export type NotificationStatus =
  | "pending"
  | "processing"
  | "sent"
  | "failed"
  | "cancelled"
  | "simulated";
export type ProductUnit = "unit" | "kg" | "g" | "ml" | "l" | "pack" | "box" | "other";
export type StockMovementType =
  | "entry"
  | "exit"
  | "adjustment"
  | "loss"
  | "internal_use"
  | "return"
  | "sale";
export type StockStatus = "normal" | "low" | "out" | "archived";

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          full_name: string;
          phone: string | null;
          avatar_url: string | null;
          onboarding_tutorial_completed_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          full_name: string;
          phone?: string | null;
          avatar_url?: string | null;
          onboarding_tutorial_completed_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          full_name?: string;
          phone?: string | null;
          avatar_url?: string | null;
          onboarding_tutorial_completed_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "profiles_id_fkey";
            columns: ["id"];
            isOneToOne: true;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      companies: {
        Row: {
          id: string;
          name: string;
          timezone: string;
          created_by: string;
          billing_exempt: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          timezone?: string;
          created_by: string;
          billing_exempt?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          timezone?: string;
          created_by?: string;
          billing_exempt?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "companies_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      company_members: {
        Row: {
          company_id: string;
          user_id: string;
          role: CompanyRole;
          created_at: string;
          access_profile: string | null;
          permissions: Json;
          employee_id: string | null;
          access_revoked_at: string | null;
          own_schedule_only: boolean;
          updated_at: string;
        };
        Insert: {
          company_id: string;
          user_id: string;
          role: CompanyRole;
          created_at?: string;
          access_profile?: string | null;
          permissions?: Json;
          employee_id?: string | null;
          access_revoked_at?: string | null;
          own_schedule_only?: boolean;
          updated_at?: string;
        };
        Update: {
          company_id?: string;
          user_id?: string;
          role?: CompanyRole;
          created_at?: string;
          access_profile?: string | null;
          permissions?: Json;
          employee_id?: string | null;
          access_revoked_at?: string | null;
          own_schedule_only?: boolean;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "company_members_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "company_members_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      company_member_invites: {
        Row: {
          id: string;
          company_id: string;
          employee_id: string;
          email: string;
          access_profile: string;
          permissions: Json;
          own_schedule_only: boolean;
          invited_by: string;
          status: string;
          accepted_at: string | null;
          revoked_at: string | null;
          created_at: string;
          expires_at: string;
        };
        Insert: {
          id?: string;
          company_id: string;
          employee_id: string;
          email: string;
          access_profile: string;
          permissions?: Json;
          own_schedule_only?: boolean;
          invited_by: string;
          status?: string;
          accepted_at?: string | null;
          revoked_at?: string | null;
          created_at?: string;
          expires_at?: string;
        };
        Update: {
          id?: string;
          company_id?: string;
          employee_id?: string;
          email?: string;
          access_profile?: string;
          permissions?: Json;
          own_schedule_only?: boolean;
          invited_by?: string;
          status?: string;
          accepted_at?: string | null;
          revoked_at?: string | null;
          created_at?: string;
          expires_at?: string;
        };
        Relationships: [];
      };
      customers: {
        Row: {
          id: string;
          company_id: string;
          name: string;
          phone: string;
          email: string | null;
          notes: string | null;
          created_by: string;
          created_at: string;
          updated_at: string;
          deleted_at: string | null;
        };
        Insert: {
          id?: string;
          company_id: string;
          name: string;
          phone: string;
          email?: string | null;
          notes?: string | null;
          created_by: string;
          created_at?: string;
          updated_at?: string;
          deleted_at?: string | null;
        };
        Update: {
          id?: string;
          company_id?: string;
          name?: string;
          phone?: string;
          email?: string | null;
          notes?: string | null;
          created_by?: string;
          created_at?: string;
          updated_at?: string;
          deleted_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "customers_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "customers_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      pets: {
        Row: {
          id: string;
          company_id: string;
          customer_id: string;
          name: string;
          species: PetSpecies;
          breed: string | null;
          sex: PetSex;
          birth_date: string | null;
          weight_kg: number | null;
          color: string | null;
          allergies: string | null;
          notes: string | null;
          important_notes: string | null;
          photo_storage_path: string | null;
          photo_thumb_path: string | null;
          photo_updated_at: string | null;
          created_by: string;
          created_at: string;
          updated_at: string;
          deleted_at: string | null;
        };
        Insert: {
          id?: string;
          company_id: string;
          customer_id: string;
          name: string;
          species: PetSpecies;
          breed?: string | null;
          sex?: PetSex;
          birth_date?: string | null;
          weight_kg?: number | null;
          color?: string | null;
          allergies?: string | null;
          notes?: string | null;
          important_notes?: string | null;
          photo_storage_path?: string | null;
          photo_thumb_path?: string | null;
          photo_updated_at?: string | null;
          created_by: string;
          created_at?: string;
          updated_at?: string;
          deleted_at?: string | null;
        };
        Update: {
          id?: string;
          company_id?: string;
          customer_id?: string;
          name?: string;
          species?: PetSpecies;
          breed?: string | null;
          sex?: PetSex;
          birth_date?: string | null;
          weight_kg?: number | null;
          color?: string | null;
          allergies?: string | null;
          notes?: string | null;
          important_notes?: string | null;
          photo_storage_path?: string | null;
          photo_thumb_path?: string | null;
          photo_updated_at?: string | null;
          created_by?: string;
          created_at?: string;
          updated_at?: string;
          deleted_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "pets_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "pets_customer_company_fkey";
            columns: ["customer_id", "company_id"];
            isOneToOne: false;
            referencedRelation: "customers";
            referencedColumns: ["id", "company_id"];
          },
          {
            foreignKeyName: "pets_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      services: {
        Row: {
          id: string;
          company_id: string;
          name: string;
          description: string | null;
          pricing_mode: ServicePricingMode;
          price_cents: number | null;
          duration_minutes: number;
          active: boolean;
          created_by: string;
          created_at: string;
          updated_at: string;
          deleted_at: string | null;
        };
        Insert: {
          id?: string;
          company_id: string;
          name: string;
          description?: string | null;
          pricing_mode?: ServicePricingMode;
          price_cents?: number | null;
          duration_minutes: number;
          active?: boolean;
          created_by: string;
          created_at?: string;
          updated_at?: string;
          deleted_at?: string | null;
        };
        Update: {
          id?: string;
          company_id?: string;
          name?: string;
          description?: string | null;
          pricing_mode?: ServicePricingMode;
          price_cents?: number | null;
          duration_minutes?: number;
          active?: boolean;
          created_by?: string;
          created_at?: string;
          updated_at?: string;
          deleted_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "services_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "services_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      service_size_prices: {
        Row: {
          id: string;
          company_id: string;
          service_id: string;
          size: PetSize;
          price_cents: number;
          duration_minutes: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          company_id: string;
          service_id: string;
          size: PetSize;
          price_cents: number;
          duration_minutes: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          company_id?: string;
          service_id?: string;
          size?: PetSize;
          price_cents?: number;
          duration_minutes?: number;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "service_size_prices_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "service_size_prices_service_company_fkey";
            columns: ["service_id", "company_id"];
            isOneToOne: false;
            referencedRelation: "services";
            referencedColumns: ["id", "company_id"];
          },
        ];
      };
      employees: {
        Row: {
          id: string;
          company_id: string;
          name: string;
          phone: string | null;
          email: string | null;
          job_title: string | null;
          notes: string | null;
          active: boolean;
          can_be_scheduled: boolean;
          user_id: string | null;
          created_by: string;
          created_at: string;
          updated_at: string;
          deleted_at: string | null;
        };
        Insert: {
          id?: string;
          company_id: string;
          name: string;
          phone?: string | null;
          email?: string | null;
          job_title?: string | null;
          notes?: string | null;
          active?: boolean;
          can_be_scheduled?: boolean;
          created_by: string;
          created_at?: string;
          updated_at?: string;
          deleted_at?: string | null;
        };
        Update: {
          id?: string;
          company_id?: string;
          name?: string;
          phone?: string | null;
          email?: string | null;
          job_title?: string | null;
          notes?: string | null;
          active?: boolean;
          can_be_scheduled?: boolean;
          created_by?: string;
          created_at?: string;
          updated_at?: string;
          deleted_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "employees_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "employees_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      employee_services: {
        Row: {
          company_id: string;
          employee_id: string;
          service_id: string;
          created_at: string;
        };
        Insert: {
          company_id: string;
          employee_id: string;
          service_id: string;
          created_at?: string;
        };
        Update: {
          company_id?: string;
          employee_id?: string;
          service_id?: string;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "employee_services_employee_company_fkey";
            columns: ["employee_id", "company_id"];
            isOneToOne: false;
            referencedRelation: "employees";
            referencedColumns: ["id", "company_id"];
          },
          {
            foreignKeyName: "employee_services_service_company_fkey";
            columns: ["service_id", "company_id"];
            isOneToOne: false;
            referencedRelation: "services";
            referencedColumns: ["id", "company_id"];
          },
        ];
      };
      employee_working_hours: {
        Row: {
          id: string;
          company_id: string;
          employee_id: string;
          weekday: number;
          enabled: boolean;
          start_time: string | null;
          end_time: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          company_id: string;
          employee_id: string;
          weekday: number;
          enabled?: boolean;
          start_time?: string | null;
          end_time?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          company_id?: string;
          employee_id?: string;
          weekday?: number;
          enabled?: boolean;
          start_time?: string | null;
          end_time?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "employee_working_hours_employee_company_fkey";
            columns: ["employee_id", "company_id"];
            isOneToOne: false;
            referencedRelation: "employees";
            referencedColumns: ["id", "company_id"];
          },
        ];
      };
      appointments: {
        Row: {
          id: string;
          company_id: string;
          customer_id: string;
          pet_id: string;
          service_id: string;
          employee_id: string;
          scheduled_start: string;
          scheduled_end: string;
          status: AppointmentStatus;
          pet_size: PetSize | null;
          service_name_snapshot: string;
          price_cents_snapshot: number;
          duration_minutes_snapshot: number;
          notes: string | null;
          cancellation_reason: string | null;
          recurrence_id: string | null;
          recurrence_index: number | null;
          created_by: string;
          created_at: string;
          updated_at: string;
          deleted_at: string | null;
        };
        Insert: {
          id?: string;
          company_id: string;
          customer_id: string;
          pet_id: string;
          service_id: string;
          employee_id: string;
          scheduled_start: string;
          scheduled_end: string;
          status?: AppointmentStatus;
          pet_size?: PetSize | null;
          service_name_snapshot: string;
          price_cents_snapshot: number;
          duration_minutes_snapshot: number;
          notes?: string | null;
          cancellation_reason?: string | null;
          recurrence_id?: string | null;
          recurrence_index?: number | null;
          created_by: string;
          created_at?: string;
          updated_at?: string;
          deleted_at?: string | null;
        };
        Update: {
          id?: string;
          company_id?: string;
          customer_id?: string;
          pet_id?: string;
          service_id?: string;
          employee_id?: string;
          scheduled_start?: string;
          scheduled_end?: string;
          status?: AppointmentStatus;
          pet_size?: PetSize | null;
          service_name_snapshot?: string;
          price_cents_snapshot?: number;
          duration_minutes_snapshot?: number;
          notes?: string | null;
          cancellation_reason?: string | null;
          recurrence_id?: string | null;
          recurrence_index?: number | null;
          created_by?: string;
          created_at?: string;
          updated_at?: string;
          deleted_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "appointments_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "appointments_customer_company_fkey";
            columns: ["customer_id", "company_id"];
            isOneToOne: false;
            referencedRelation: "customers";
            referencedColumns: ["id", "company_id"];
          },
          {
            foreignKeyName: "appointments_pet_customer_company_fkey";
            columns: ["pet_id", "customer_id", "company_id"];
            isOneToOne: false;
            referencedRelation: "pets";
            referencedColumns: ["id", "customer_id", "company_id"];
          },
          {
            foreignKeyName: "appointments_service_company_fkey";
            columns: ["service_id", "company_id"];
            isOneToOne: false;
            referencedRelation: "services";
            referencedColumns: ["id", "company_id"];
          },
          {
            foreignKeyName: "appointments_employee_company_fkey";
            columns: ["employee_id", "company_id"];
            isOneToOne: false;
            referencedRelation: "employees";
            referencedColumns: ["id", "company_id"];
          },
          {
            foreignKeyName: "appointments_recurrence_id_fkey";
            columns: ["recurrence_id"];
            isOneToOne: false;
            referencedRelation: "appointment_recurrences";
            referencedColumns: ["id"];
          },
        ];
      };
      appointment_recurrences: {
        Row: {
          id: string;
          company_id: string;
          source_appointment_id: string | null;
          frequency: "weekly" | "biweekly" | "monthly" | "custom_days";
          interval_value: number;
          ends_at: string | null;
          max_occurrences: number | null;
          active: boolean;
          created_by: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          company_id: string;
          source_appointment_id?: string | null;
          frequency: "weekly" | "biweekly" | "monthly" | "custom_days";
          interval_value?: number;
          ends_at?: string | null;
          max_occurrences?: number | null;
          active?: boolean;
          created_by: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          company_id?: string;
          source_appointment_id?: string | null;
          frequency?: "weekly" | "biweekly" | "monthly" | "custom_days";
          interval_value?: number;
          ends_at?: string | null;
          max_occurrences?: number | null;
          active?: boolean;
          created_by?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "appointment_recurrences_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
        ];
      };
      appointment_waitlist: {
        Row: {
          id: string;
          company_id: string;
          customer_id: string;
          pet_id: string;
          service_id: string;
          preferred_employee_id: string | null;
          preferred_date: string | null;
          preferred_period: "morning" | "afternoon" | "evening" | "any" | null;
          preferred_time_start: string | null;
          preferred_time_end: string | null;
          notes: string | null;
          status: "waiting" | "contacted" | "converted" | "cancelled";
          appointment_id: string | null;
          contacted_at: string | null;
          created_by: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          company_id: string;
          customer_id: string;
          pet_id: string;
          service_id: string;
          preferred_employee_id?: string | null;
          preferred_date?: string | null;
          preferred_period?: "morning" | "afternoon" | "evening" | "any" | null;
          preferred_time_start?: string | null;
          preferred_time_end?: string | null;
          notes?: string | null;
          status?: "waiting" | "contacted" | "converted" | "cancelled";
          appointment_id?: string | null;
          contacted_at?: string | null;
          created_by: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          company_id?: string;
          customer_id?: string;
          pet_id?: string;
          service_id?: string;
          preferred_employee_id?: string | null;
          preferred_date?: string | null;
          preferred_period?: "morning" | "afternoon" | "evening" | "any" | null;
          preferred_time_start?: string | null;
          preferred_time_end?: string | null;
          notes?: string | null;
          status?: "waiting" | "contacted" | "converted" | "cancelled";
          appointment_id?: string | null;
          contacted_at?: string | null;
          created_by?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      schedule_time_blocks: {
        Row: {
          id: string;
          company_id: string;
          employee_id: string | null;
          block_start: string;
          block_end: string;
          reason: string;
          created_by: string;
          created_at: string;
          updated_at: string;
          deleted_at: string | null;
        };
        Insert: {
          id?: string;
          company_id: string;
          employee_id?: string | null;
          block_start: string;
          block_end: string;
          reason: string;
          created_by: string;
          created_at?: string;
          updated_at?: string;
          deleted_at?: string | null;
        };
        Update: {
          id?: string;
          company_id?: string;
          employee_id?: string | null;
          block_start?: string;
          block_end?: string;
          reason?: string;
          created_by?: string;
          created_at?: string;
          updated_at?: string;
          deleted_at?: string | null;
        };
        Relationships: [];
      };
      company_notification_settings: {
        Row: {
          company_id: string;
          appointment_confirmation_enabled: boolean;
          reminder_24h_enabled: boolean;
          reminder_2h_enabled: boolean;
          pet_ready_enabled: boolean;
          customer_same_day_reminder_enabled: boolean;
          employee_same_day_reminder_enabled: boolean;
          employee_reminder_2h_enabled: boolean;
          same_day_reminder_time: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          company_id: string;
          appointment_confirmation_enabled?: boolean;
          reminder_24h_enabled?: boolean;
          reminder_2h_enabled?: boolean;
          pet_ready_enabled?: boolean;
          customer_same_day_reminder_enabled?: boolean;
          employee_same_day_reminder_enabled?: boolean;
          employee_reminder_2h_enabled?: boolean;
          same_day_reminder_time?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          company_id?: string;
          appointment_confirmation_enabled?: boolean;
          reminder_24h_enabled?: boolean;
          reminder_2h_enabled?: boolean;
          pet_ready_enabled?: boolean;
          customer_same_day_reminder_enabled?: boolean;
          employee_same_day_reminder_enabled?: boolean;
          employee_reminder_2h_enabled?: boolean;
          same_day_reminder_time?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "company_notification_settings_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: true;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
        ];
      };
      notification_queue: {
        Row: {
          id: string;
          company_id: string;
          customer_id: string;
          pet_id: string;
          appointment_id: string | null;
          service_order_id: string | null;
          type: NotificationType;
          recipient_type: NotificationRecipientType;
          employee_id: string | null;
          destination_phone: string;
          message_body: string;
          scheduled_for: string;
          status: NotificationStatus;
          attempts: number;
          last_error: string | null;
          sent_at: string | null;
          provider: string;
          provider_message_id: string | null;
          accepted_at: string | null;
          delivered_at: string | null;
          read_at: string | null;
          failed_at: string | null;
          provider_error_code: string | null;
          provider_error_message: string | null;
          next_attempt_at: string | null;
          max_attempts: number;
          claimed_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          company_id: string;
          customer_id: string;
          pet_id: string;
          appointment_id?: string | null;
          service_order_id?: string | null;
          type: NotificationType;
          recipient_type?: NotificationRecipientType;
          employee_id?: string | null;
          destination_phone: string;
          message_body: string;
          scheduled_for?: string;
          status?: NotificationStatus;
          attempts?: number;
          last_error?: string | null;
          sent_at?: string | null;
          provider?: string;
          provider_message_id?: string | null;
          accepted_at?: string | null;
          delivered_at?: string | null;
          read_at?: string | null;
          failed_at?: string | null;
          provider_error_code?: string | null;
          provider_error_message?: string | null;
          next_attempt_at?: string | null;
          max_attempts?: number;
          claimed_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          company_id?: string;
          customer_id?: string;
          pet_id?: string;
          appointment_id?: string | null;
          service_order_id?: string | null;
          type?: NotificationType;
          recipient_type?: NotificationRecipientType;
          employee_id?: string | null;
          destination_phone?: string;
          message_body?: string;
          scheduled_for?: string;
          status?: NotificationStatus;
          attempts?: number;
          last_error?: string | null;
          sent_at?: string | null;
          provider?: string;
          provider_message_id?: string | null;
          accepted_at?: string | null;
          delivered_at?: string | null;
          read_at?: string | null;
          failed_at?: string | null;
          provider_error_code?: string | null;
          provider_error_message?: string | null;
          next_attempt_at?: string | null;
          max_attempts?: number;
          claimed_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "notification_queue_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "notification_queue_customer_company_fkey";
            columns: ["customer_id", "company_id"];
            isOneToOne: false;
            referencedRelation: "customers";
            referencedColumns: ["id", "company_id"];
          },
          {
            foreignKeyName: "notification_queue_pet_customer_company_fkey";
            columns: ["pet_id", "customer_id", "company_id"];
            isOneToOne: false;
            referencedRelation: "pets";
            referencedColumns: ["id", "customer_id", "company_id"];
          },
          {
            foreignKeyName: "notification_queue_appointment_id_fkey";
            columns: ["appointment_id"];
            isOneToOne: false;
            referencedRelation: "appointments";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "notification_queue_employee_company_fkey";
            columns: ["employee_id", "company_id"];
            isOneToOne: false;
            referencedRelation: "employees";
            referencedColumns: ["id", "company_id"];
          },
        ];
      };
      service_orders: {
        Row: {
          id: string;
          company_id: string;
          appointment_id: string;
          status: ServiceOrderStatus;
          check_in_at: string;
          started_at: string | null;
          ready_at: string | null;
          completed_at: string | null;
          intake_notes: string | null;
          internal_notes: string | null;
          completion_notes: string | null;
          created_by: string;
          created_at: string;
          updated_at: string;
          deleted_at: string | null;
        };
        Insert: {
          id?: string;
          company_id: string;
          appointment_id: string;
          status?: ServiceOrderStatus;
          check_in_at?: string;
          started_at?: string | null;
          ready_at?: string | null;
          completed_at?: string | null;
          intake_notes?: string | null;
          internal_notes?: string | null;
          completion_notes?: string | null;
          created_by: string;
          created_at?: string;
          updated_at?: string;
          deleted_at?: string | null;
        };
        Update: {
          id?: string;
          company_id?: string;
          appointment_id?: string;
          status?: ServiceOrderStatus;
          check_in_at?: string;
          started_at?: string | null;
          ready_at?: string | null;
          completed_at?: string | null;
          intake_notes?: string | null;
          internal_notes?: string | null;
          completion_notes?: string | null;
          created_by?: string;
          created_at?: string;
          updated_at?: string;
          deleted_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "service_orders_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "service_orders_appointment_company_fkey";
            columns: ["appointment_id", "company_id"];
            isOneToOne: false;
            referencedRelation: "appointments";
            referencedColumns: ["id", "company_id"];
          },
        ];
      };
      company_subscriptions: {
        Row: {
          company_id: string;
          plan_code: string;
          status: SubscriptionStatus;
          trial_started_at: string;
          trial_ends_at: string;
          provider: string | null;
          provider_subscription_id: string | null;
          provider_status: string | null;
          provider_checkout_url: string | null;
          checkout_started_at: string | null;
          subscribed_at: string | null;
          next_payment_at: string | null;
          last_payment_at: string | null;
          last_payment_status: string | null;
          cancelled_at: string | null;
          current_period_start: string | null;
          current_period_end: string | null;
          cancel_at_period_end: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          company_id: string;
          plan_code?: string;
          status?: SubscriptionStatus;
          trial_started_at: string;
          trial_ends_at: string;
          provider?: string | null;
          provider_subscription_id?: string | null;
          provider_status?: string | null;
          provider_checkout_url?: string | null;
          checkout_started_at?: string | null;
          subscribed_at?: string | null;
          next_payment_at?: string | null;
          last_payment_at?: string | null;
          last_payment_status?: string | null;
          cancelled_at?: string | null;
          current_period_start?: string | null;
          current_period_end?: string | null;
          cancel_at_period_end?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          company_id?: string;
          plan_code?: string;
          status?: SubscriptionStatus;
          trial_started_at?: string;
          trial_ends_at?: string;
          provider?: string | null;
          provider_subscription_id?: string | null;
          provider_status?: string | null;
          provider_checkout_url?: string | null;
          checkout_started_at?: string | null;
          subscribed_at?: string | null;
          next_payment_at?: string | null;
          last_payment_at?: string | null;
          last_payment_status?: string | null;
          cancelled_at?: string | null;
          current_period_start?: string | null;
          current_period_end?: string | null;
          cancel_at_period_end?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "company_subscriptions_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: true;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
        ];
      };
      billing_webhook_events: {
        Row: {
          id: string;
          provider: string;
          provider_event_id: string;
          event_type: string;
          action: string | null;
          resource_id: string | null;
          received_at: string;
          processed_at: string | null;
          processing_status: string;
          error_message: string | null;
        };
        Insert: {
          id?: string;
          provider?: string;
          provider_event_id: string;
          event_type: string;
          action?: string | null;
          resource_id?: string | null;
          received_at?: string;
          processed_at?: string | null;
          processing_status?: string;
          error_message?: string | null;
        };
        Update: {
          id?: string;
          provider?: string;
          provider_event_id?: string;
          event_type?: string;
          action?: string | null;
          resource_id?: string | null;
          received_at?: string;
          processed_at?: string | null;
          processing_status?: string;
          error_message?: string | null;
        };
        Relationships: [];
      };
      platform_admins: {
        Row: {
          user_id: string;
          role: PlatformAdminRole;
          created_at: string;
        };
        Insert: {
          user_id: string;
          role?: PlatformAdminRole;
          created_at?: string;
        };
        Update: {
          user_id?: string;
          role?: PlatformAdminRole;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "platform_admins_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: true;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      service_packages: {
        Row: {
          id: string;
          company_id: string;
          name: string;
          description: string | null;
          price_cents: number;
          validity_days: number;
          active: boolean;
          created_by: string;
          created_at: string;
          updated_at: string;
          deleted_at: string | null;
        };
        Insert: {
          id?: string;
          company_id: string;
          name: string;
          description?: string | null;
          price_cents: number;
          validity_days: number;
          active?: boolean;
          created_by: string;
          created_at?: string;
          updated_at?: string;
          deleted_at?: string | null;
        };
        Update: {
          id?: string;
          company_id?: string;
          name?: string;
          description?: string | null;
          price_cents?: number;
          validity_days?: number;
          active?: boolean;
          created_by?: string;
          created_at?: string;
          updated_at?: string;
          deleted_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "service_packages_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
        ];
      };
      service_package_items: {
        Row: {
          id: string;
          company_id: string;
          package_id: string;
          service_id: string;
          quantity: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          company_id: string;
          package_id: string;
          service_id: string;
          quantity: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          company_id?: string;
          package_id?: string;
          service_id?: string;
          quantity?: number;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "service_package_items_package_company_fkey";
            columns: ["package_id", "company_id"];
            isOneToOne: false;
            referencedRelation: "service_packages";
            referencedColumns: ["id", "company_id"];
          },
          {
            foreignKeyName: "service_package_items_service_company_fkey";
            columns: ["service_id", "company_id"];
            isOneToOne: false;
            referencedRelation: "services";
            referencedColumns: ["id", "company_id"];
          },
        ];
      };
      customer_service_packages: {
        Row: {
          id: string;
          company_id: string;
          customer_id: string;
          pet_id: string;
          package_id: string | null;
          package_name_snapshot: string;
          purchased_at: string;
          starts_at: string;
          expires_at: string;
          status: CustomerPackageStatus;
          price_cents_snapshot: number;
          financial_entry_id: string | null;
          created_by: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          company_id: string;
          customer_id: string;
          pet_id: string;
          package_id?: string | null;
          package_name_snapshot: string;
          purchased_at?: string;
          starts_at: string;
          expires_at: string;
          status?: CustomerPackageStatus;
          price_cents_snapshot: number;
          financial_entry_id?: string | null;
          created_by: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          company_id?: string;
          customer_id?: string;
          pet_id?: string;
          package_id?: string | null;
          package_name_snapshot?: string;
          purchased_at?: string;
          starts_at?: string;
          expires_at?: string;
          status?: CustomerPackageStatus;
          price_cents_snapshot?: number;
          financial_entry_id?: string | null;
          created_by?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      customer_service_package_items: {
        Row: {
          id: string;
          company_id: string;
          customer_package_id: string;
          service_id: string;
          service_name_snapshot: string;
          quantity_total: number;
          quantity_used: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          company_id: string;
          customer_package_id: string;
          service_id: string;
          service_name_snapshot: string;
          quantity_total: number;
          quantity_used?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          company_id?: string;
          customer_package_id?: string;
          service_id?: string;
          service_name_snapshot?: string;
          quantity_total?: number;
          quantity_used?: number;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      customer_service_package_usages: {
        Row: {
          id: string;
          company_id: string;
          customer_package_id: string;
          customer_package_item_id: string;
          service_id: string;
          appointment_id: string;
          service_order_id: string;
          quantity: number;
          status: PackageUsageStatus;
          original_price_cents_snapshot: number;
          used_at: string;
          reversed_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          company_id: string;
          customer_package_id: string;
          customer_package_item_id: string;
          service_id: string;
          appointment_id: string;
          service_order_id: string;
          quantity?: number;
          status?: PackageUsageStatus;
          original_price_cents_snapshot: number;
          used_at?: string;
          reversed_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          company_id?: string;
          customer_package_id?: string;
          customer_package_item_id?: string;
          service_id?: string;
          appointment_id?: string;
          service_order_id?: string;
          quantity?: number;
          status?: PackageUsageStatus;
          original_price_cents_snapshot?: number;
          used_at?: string;
          reversed_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      financial_entries: {
        Row: {
          id: string;
          company_id: string;
          entry_type: FinancialEntryType;
          status: FinancialEntryStatus;
          source_type: FinancialSourceType;
          service_order_id: string | null;
          customer_service_package_id: string | null;
          sale_id: string | null;
          description: string;
          category: string | null;
          amount_cents: number;
          due_date: string | null;
          paid_at: string | null;
          payment_method: PaymentMethod | null;
          notes: string | null;
          created_by: string;
          created_at: string;
          updated_at: string;
          cancelled_at: string | null;
          deleted_at: string | null;
        };
        Insert: {
          id?: string;
          company_id: string;
          entry_type: FinancialEntryType;
          status?: FinancialEntryStatus;
          source_type?: FinancialSourceType;
          service_order_id?: string | null;
          customer_service_package_id?: string | null;
          sale_id?: string | null;
          description: string;
          category?: string | null;
          amount_cents: number;
          due_date?: string | null;
          paid_at?: string | null;
          payment_method?: PaymentMethod | null;
          notes?: string | null;
          created_by: string;
          created_at?: string;
          updated_at?: string;
          cancelled_at?: string | null;
          deleted_at?: string | null;
        };
        Update: {
          id?: string;
          company_id?: string;
          entry_type?: FinancialEntryType;
          status?: FinancialEntryStatus;
          source_type?: FinancialSourceType;
          service_order_id?: string | null;
          customer_service_package_id?: string | null;
          sale_id?: string | null;
          description?: string;
          category?: string | null;
          amount_cents?: number;
          due_date?: string | null;
          paid_at?: string | null;
          payment_method?: PaymentMethod | null;
          notes?: string | null;
          created_by?: string;
          created_at?: string;
          updated_at?: string;
          cancelled_at?: string | null;
          deleted_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "financial_entries_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "financial_entries_service_order_company_fkey";
            columns: ["service_order_id", "company_id"];
            isOneToOne: false;
            referencedRelation: "service_orders";
            referencedColumns: ["id", "company_id"];
          },
        ];
      };
      financial_payments: {
        Row: {
          id: string;
          company_id: string;
          financial_entry_id: string;
          amount_cents: number;
          payment_method: PaymentMethod;
          paid_at: string;
          notes: string | null;
          idempotency_key: string | null;
          created_by: string;
          created_at: string;
          cancelled_at: string | null;
          cancelled_by: string | null;
        };
        Insert: {
          id?: string;
          company_id: string;
          financial_entry_id: string;
          amount_cents: number;
          payment_method: PaymentMethod;
          paid_at?: string;
          notes?: string | null;
          idempotency_key?: string | null;
          created_by: string;
          created_at?: string;
          cancelled_at?: string | null;
          cancelled_by?: string | null;
        };
        Update: {
          id?: string;
          company_id?: string;
          financial_entry_id?: string;
          amount_cents?: number;
          payment_method?: PaymentMethod;
          paid_at?: string;
          notes?: string | null;
          idempotency_key?: string | null;
          created_by?: string;
          created_at?: string;
          cancelled_at?: string | null;
          cancelled_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "financial_payments_entry_company_fkey";
            columns: ["financial_entry_id", "company_id"];
            isOneToOne: false;
            referencedRelation: "financial_entries";
            referencedColumns: ["id", "company_id"];
          },
        ];
      };
      product_categories: {
        Row: {
          id: string;
          company_id: string;
          name: string;
          archived_at: string | null;
          created_at: string;
          updated_at: string;
          created_by: string;
        };
        Insert: {
          id?: string;
          company_id: string;
          name: string;
          archived_at?: string | null;
          created_at?: string;
          updated_at?: string;
          created_by: string;
        };
        Update: {
          id?: string;
          company_id?: string;
          name?: string;
          archived_at?: string | null;
          created_at?: string;
          updated_at?: string;
          created_by?: string;
        };
        Relationships: [
          {
            foreignKeyName: "product_categories_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
        ];
      };
      inventory_suppliers: {
        Row: {
          id: string;
          company_id: string;
          name: string;
          contact_name: string | null;
          phone: string | null;
          email: string | null;
          document: string | null;
          notes: string | null;
          active: boolean;
          archived_at: string | null;
          created_at: string;
          updated_at: string;
          created_by: string;
        };
        Insert: {
          id?: string;
          company_id: string;
          name: string;
          contact_name?: string | null;
          phone?: string | null;
          email?: string | null;
          document?: string | null;
          notes?: string | null;
          active?: boolean;
          archived_at?: string | null;
          created_at?: string;
          updated_at?: string;
          created_by: string;
        };
        Update: {
          id?: string;
          company_id?: string;
          name?: string;
          contact_name?: string | null;
          phone?: string | null;
          email?: string | null;
          document?: string | null;
          notes?: string | null;
          active?: boolean;
          archived_at?: string | null;
          created_at?: string;
          updated_at?: string;
          created_by?: string;
        };
        Relationships: [
          {
            foreignKeyName: "inventory_suppliers_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
        ];
      };
      products: {
        Row: {
          id: string;
          company_id: string;
          name: string;
          sku: string | null;
          barcode: string | null;
          category_id: string | null;
          description: string | null;
          unit: ProductUnit;
          cost_price_cents: number;
          sale_price_cents: number | null;
          current_stock: number;
          minimum_stock: number;
          active: boolean;
          track_stock: boolean;
          created_at: string;
          updated_at: string;
          archived_at: string | null;
          created_by: string;
          stock_status: StockStatus;
        };
        Insert: {
          id?: string;
          company_id: string;
          name: string;
          sku?: string | null;
          barcode?: string | null;
          category_id?: string | null;
          description?: string | null;
          unit?: ProductUnit;
          cost_price_cents?: number;
          sale_price_cents?: number | null;
          current_stock?: number;
          minimum_stock?: number;
          active?: boolean;
          track_stock?: boolean;
          created_at?: string;
          updated_at?: string;
          archived_at?: string | null;
          created_by: string;
        };
        Update: {
          id?: string;
          company_id?: string;
          name?: string;
          sku?: string | null;
          barcode?: string | null;
          category_id?: string | null;
          description?: string | null;
          unit?: ProductUnit;
          cost_price_cents?: number;
          sale_price_cents?: number | null;
          current_stock?: number;
          minimum_stock?: number;
          active?: boolean;
          track_stock?: boolean;
          created_at?: string;
          updated_at?: string;
          archived_at?: string | null;
          created_by?: string;
        };
        Relationships: [
          {
            foreignKeyName: "products_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "products_category_company_fkey";
            columns: ["category_id", "company_id"];
            isOneToOne: false;
            referencedRelation: "product_categories";
            referencedColumns: ["id", "company_id"];
          },
        ];
      };
      product_batches: {
        Row: {
          id: string;
          company_id: string;
          product_id: string;
          batch_code: string | null;
          quantity_remaining: number;
          expiration_date: string | null;
          unit_cost_cents: number | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          company_id: string;
          product_id: string;
          batch_code?: string | null;
          quantity_remaining?: number;
          expiration_date?: string | null;
          unit_cost_cents?: number | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          company_id?: string;
          product_id?: string;
          batch_code?: string | null;
          quantity_remaining?: number;
          expiration_date?: string | null;
          unit_cost_cents?: number | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "product_batches_product_company_fkey";
            columns: ["product_id", "company_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["id", "company_id"];
          },
        ];
      };
      stock_movements: {
        Row: {
          id: string;
          company_id: string;
          product_id: string;
          type: StockMovementType;
          quantity: number;
          previous_quantity: number;
          new_quantity: number;
          unit_cost_cents: number | null;
          reason: string | null;
          reference_type: string | null;
          reference_id: string | null;
          notes: string | null;
          supplier_id: string | null;
          batch_id: string | null;
          idempotency_key: string;
          created_by: string;
          created_by_name: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          company_id: string;
          product_id: string;
          type: StockMovementType;
          quantity: number;
          previous_quantity: number;
          new_quantity: number;
          unit_cost_cents?: number | null;
          reason?: string | null;
          reference_type?: string | null;
          reference_id?: string | null;
          notes?: string | null;
          supplier_id?: string | null;
          batch_id?: string | null;
          idempotency_key: string;
          created_by: string;
          created_by_name: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          company_id?: string;
          product_id?: string;
          type?: StockMovementType;
          quantity?: number;
          previous_quantity?: number;
          new_quantity?: number;
          unit_cost_cents?: number | null;
          reason?: string | null;
          reference_type?: string | null;
          reference_id?: string | null;
          notes?: string | null;
          supplier_id?: string | null;
          batch_id?: string | null;
          idempotency_key?: string;
          created_by?: string;
          created_by_name?: string;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "stock_movements_product_company_fkey";
            columns: ["product_id", "company_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["id", "company_id"];
          },
          {
            foreignKeyName: "stock_movements_supplier_company_fkey";
            columns: ["supplier_id", "company_id"];
            isOneToOne: false;
            referencedRelation: "inventory_suppliers";
            referencedColumns: ["id", "company_id"];
          },
        ];
      };
      pet_attachments: {
        Row: {
          id: string;
          company_id: string;
          pet_id: string;
          file_path: string;
          thumb_path: string | null;
          file_name: string;
          mime_type: string;
          size_bytes: number;
          category: string;
          description: string | null;
          uploaded_by: string;
          uploaded_by_name: string;
          created_at: string;
          archived_at: string | null;
          archived_by: string | null;
        };
        Insert: {
          id?: string;
          company_id: string;
          pet_id: string;
          file_path: string;
          thumb_path?: string | null;
          file_name: string;
          mime_type: string;
          size_bytes: number;
          category: string;
          description?: string | null;
          uploaded_by: string;
          uploaded_by_name: string;
          created_at?: string;
          archived_at?: string | null;
          archived_by?: string | null;
        };
        Update: {
          id?: string;
          company_id?: string;
          pet_id?: string;
          file_path?: string;
          thumb_path?: string | null;
          file_name?: string;
          mime_type?: string;
          size_bytes?: number;
          category?: string;
          description?: string | null;
          uploaded_by?: string;
          uploaded_by_name?: string;
          created_at?: string;
          archived_at?: string | null;
          archived_by?: string | null;
        };
        Relationships: [];
      };
      service_order_attachments: {
        Row: {
          id: string;
          company_id: string;
          service_order_id: string;
          pet_id: string;
          file_path: string;
          thumb_path: string | null;
          file_name: string;
          mime_type: string;
          size_bytes: number;
          category: string;
          phase: string | null;
          description: string | null;
          uploaded_by: string;
          uploaded_by_name: string;
          created_at: string;
          archived_at: string | null;
          archived_by: string | null;
        };
        Insert: {
          id?: string;
          company_id: string;
          service_order_id: string;
          pet_id: string;
          file_path: string;
          thumb_path?: string | null;
          file_name: string;
          mime_type: string;
          size_bytes: number;
          category: string;
          phase?: string | null;
          description?: string | null;
          uploaded_by: string;
          uploaded_by_name: string;
          created_at?: string;
          archived_at?: string | null;
          archived_by?: string | null;
        };
        Update: {
          id?: string;
          company_id?: string;
          service_order_id?: string;
          pet_id?: string;
          file_path?: string;
          thumb_path?: string | null;
          file_name?: string;
          mime_type?: string;
          size_bytes?: number;
          category?: string;
          phase?: string | null;
          description?: string | null;
          uploaded_by?: string;
          uploaded_by_name?: string;
          created_at?: string;
          archived_at?: string | null;
          archived_by?: string | null;
        };
        Relationships: [];
      };
      service_product_recipes: {
        Row: {
          id: string;
          company_id: string;
          service_id: string;
          product_id: string;
          quantity: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          company_id: string;
          service_id: string;
          product_id: string;
          quantity: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          company_id?: string;
          service_id?: string;
          product_id?: string;
          quantity?: number;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "service_product_recipes_service_company_fkey";
            columns: ["service_id", "company_id"];
            isOneToOne: false;
            referencedRelation: "services";
            referencedColumns: ["id", "company_id"];
          },
          {
            foreignKeyName: "service_product_recipes_product_company_fkey";
            columns: ["product_id", "company_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["id", "company_id"];
          },
        ];
      };
      sales: {
        Row: {
          id: string;
          company_id: string;
          sale_number: number;
          customer_id: string | null;
          status: SaleStatus;
          subtotal_cents: number;
          discount_cents: number;
          discount_type: DiscountType | null;
          discount_percent: number | null;
          total_cents: number;
          paid_cents: number;
          change_cents: number;
          financial_entry_id: string | null;
          sold_at: string;
          idempotency_key: string;
          created_by: string;
          created_by_name: string;
          discount_applied_by: string | null;
          cancelled_by: string | null;
          cancel_reason: string | null;
          created_at: string;
          updated_at: string;
          cancelled_at: string | null;
        };
        Insert: {
          id?: string;
          company_id: string;
          sale_number: number;
          customer_id?: string | null;
          status?: SaleStatus;
          subtotal_cents: number;
          discount_cents?: number;
          discount_type?: DiscountType | null;
          discount_percent?: number | null;
          total_cents: number;
          paid_cents?: number;
          change_cents?: number;
          financial_entry_id?: string | null;
          sold_at?: string;
          idempotency_key: string;
          created_by: string;
          created_by_name: string;
          discount_applied_by?: string | null;
          cancelled_by?: string | null;
          cancel_reason?: string | null;
          created_at?: string;
          updated_at?: string;
          cancelled_at?: string | null;
        };
        Update: {
          id?: string;
          company_id?: string;
          sale_number?: number;
          customer_id?: string | null;
          status?: SaleStatus;
          subtotal_cents?: number;
          discount_cents?: number;
          discount_type?: DiscountType | null;
          discount_percent?: number | null;
          total_cents?: number;
          paid_cents?: number;
          change_cents?: number;
          financial_entry_id?: string | null;
          sold_at?: string;
          idempotency_key?: string;
          created_by?: string;
          created_by_name?: string;
          discount_applied_by?: string | null;
          cancelled_by?: string | null;
          cancel_reason?: string | null;
          created_at?: string;
          updated_at?: string;
          cancelled_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "sales_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
        ];
      };
      sale_items: {
        Row: {
          id: string;
          company_id: string;
          sale_id: string;
          product_id: string;
          product_name_snapshot: string;
          quantity: number;
          unit_price_cents: number;
          cost_price_cents_snapshot: number;
          subtotal_cents: number;
          discount_cents: number;
          total_cents: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          company_id: string;
          sale_id: string;
          product_id: string;
          product_name_snapshot: string;
          quantity: number;
          unit_price_cents: number;
          cost_price_cents_snapshot: number;
          subtotal_cents: number;
          discount_cents?: number;
          total_cents: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          company_id?: string;
          sale_id?: string;
          product_id?: string;
          product_name_snapshot?: string;
          quantity?: number;
          unit_price_cents?: number;
          cost_price_cents_snapshot?: number;
          subtotal_cents?: number;
          discount_cents?: number;
          total_cents?: number;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "sale_items_sale_company_fkey";
            columns: ["sale_id", "company_id"];
            isOneToOne: false;
            referencedRelation: "sales";
            referencedColumns: ["id", "company_id"];
          },
        ];
      };
    };
    Views: Record<string, never>;
    Functions: {
      claim_due_notifications: {
        Args: {
          p_limit?: number;
          p_now?: string;
        };
        Returns: Json;
      };
      complete_onboarding: {
        Args: {
          p_full_name: string;
          p_company_name: string;
          p_phone?: string | null;
        };
        Returns: string;
      };
      complete_onboarding_tutorial: {
        Args: Record<string, never>;
        Returns: undefined;
      };
      create_service_with_prices: {
        Args: {
          p_name: string;
          p_description: string | null;
          p_pricing_mode: ServicePricingMode;
          p_price_cents: number | null;
          p_duration_minutes: number;
          p_active?: boolean;
          p_size_prices?: Json | null;
        };
        Returns: string;
      };
      update_service_with_prices: {
        Args: {
          p_service_id: string;
          p_name: string;
          p_description: string | null;
          p_pricing_mode: ServicePricingMode;
          p_price_cents: number | null;
          p_duration_minutes: number;
          p_active: boolean;
          p_size_prices?: Json | null;
        };
        Returns: string;
      };
      grant_employee_access: {
        Args: {
          p_employee_id: string;
          p_email: string;
          p_access_profile: string;
          p_permissions: Json;
          p_own_schedule_only?: boolean;
        };
        Returns: Json;
      };
      update_employee_access: {
        Args: {
          p_employee_id: string;
          p_access_profile: string;
          p_permissions: Json;
          p_own_schedule_only?: boolean;
        };
        Returns: undefined;
      };
      revoke_employee_access: {
        Args: {
          p_employee_id: string;
        };
        Returns: undefined;
      };
      create_employee_with_schedule: {
        Args: {
          p_name: string;
          p_phone: string | null;
          p_email: string | null;
          p_job_title: string | null;
          p_notes: string | null;
          p_active?: boolean;
          p_can_be_scheduled?: boolean;
          p_service_ids?: string[];
          p_working_hours?: Json;
        };
        Returns: string;
      };
      update_employee_with_schedule: {
        Args: {
          p_employee_id: string;
          p_name: string;
          p_phone: string | null;
          p_email: string | null;
          p_job_title: string | null;
          p_notes: string | null;
          p_active: boolean;
          p_can_be_scheduled: boolean;
          p_service_ids?: string[];
          p_working_hours?: Json;
        };
        Returns: string;
      };
      create_appointment: {
        Args: {
          p_pet_id: string;
          p_service_id: string;
          p_employee_id: string;
          p_scheduled_start: string;
          p_pet_size?: string | null;
          p_notes?: string | null;
        };
        Returns: string;
      };
      accept_pending_invite: {
        Args: Record<string, never>;
        Returns: Json;
      };
      peek_pending_invite: {
        Args: Record<string, never>;
        Returns: Json;
      };
      lookup_pending_invite_by_email: {
        Args: { p_email: string };
        Returns: Json;
      };
      update_appointment: {
        Args: {
          p_appointment_id: string;
          p_pet_id: string;
          p_service_id: string;
          p_employee_id: string;
          p_scheduled_start: string;
          p_pet_size?: string | null;
          p_notes?: string | null;
        };
        Returns: string;
      };
      check_in_appointment: {
        Args: {
          p_appointment_id: string;
          p_intake_notes?: string | null;
        };
        Returns: string;
      };
      start_service_order: {
        Args: { p_service_order_id: string };
        Returns: string;
      };
      mark_service_order_ready: {
        Args: { p_service_order_id: string };
        Returns: string;
      };
      complete_service_order: {
        Args: {
          p_service_order_id: string;
          p_completion_notes?: string | null;
        };
        Returns: string;
      };
      cancel_service_order: {
        Args: { p_service_order_id: string };
        Returns: string;
      };
      update_service_order_notes: {
        Args: {
          p_service_order_id: string;
          p_intake_notes?: string | null;
          p_internal_notes?: string | null;
          p_completion_notes?: string | null;
        };
        Returns: string;
      };
      mark_financial_entry_paid: {
        Args: {
          p_entry_id: string;
          p_payment_method: PaymentMethod;
          p_paid_at?: string | null;
        };
        Returns: string;
      };
      reopen_financial_entry: {
        Args: { p_entry_id: string };
        Returns: string;
      };
      cancel_financial_entry: {
        Args: { p_entry_id: string };
        Returns: string;
      };
      create_service_package_with_items: {
        Args: {
          p_name: string;
          p_description: string | null;
          p_price_cents: number;
          p_validity_days: number;
          p_active?: boolean;
          p_items?: Json;
        };
        Returns: string;
      };
      update_service_package_with_items: {
        Args: {
          p_package_id: string;
          p_name: string;
          p_description: string | null;
          p_price_cents: number;
          p_validity_days: number;
          p_active: boolean;
          p_items: Json;
        };
        Returns: string;
      };
      sell_customer_service_package: {
        Args: {
          p_package_id: string;
          p_customer_id: string;
          p_pet_id: string;
          p_starts_at: string;
          p_financial_status?: string;
          p_payment_method?: string | null;
        };
        Returns: string;
      };
      consume_customer_service_package: {
        Args: {
          p_service_order_id: string;
          p_customer_package_id: string;
        };
        Returns: string;
      };
      reverse_customer_service_package_usage: {
        Args: { p_service_order_id: string };
        Returns: string;
      };
      cancel_customer_service_package: {
        Args: { p_customer_package_id: string };
        Returns: string;
      };
      register_stock_movement: {
        Args: {
          p_product_id: string;
          p_type: StockMovementType;
          p_quantity: number;
          p_idempotency_key: string;
          p_unit_cost_cents?: number | null;
          p_reason?: string | null;
          p_notes?: string | null;
          p_supplier_id?: string | null;
          p_batch_code?: string | null;
          p_expiration_date?: string | null;
          p_counted_stock?: number | null;
          p_reference_type?: string | null;
          p_reference_id?: string | null;
        };
        Returns: string;
      };
      complete_product_sale: {
        Args: {
          p_idempotency_key: string;
          p_items: Json;
          p_payments: Json;
          p_customer_id?: string | null;
          p_discount_type?: string | null;
          p_discount_fixed_cents?: number;
          p_discount_percent?: number | null;
          p_cash_received_cents?: number | null;
        };
        Returns: string;
      };
      cancel_product_sale: {
        Args: {
          p_sale_id: string;
          p_reason: string;
        };
        Returns: string;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};

export type Profile = Database["public"]["Tables"]["profiles"]["Row"];
export type Company = Database["public"]["Tables"]["companies"]["Row"];
export type CompanyMember = Database["public"]["Tables"]["company_members"]["Row"];
export type Customer = Database["public"]["Tables"]["customers"]["Row"];
export type Pet = Database["public"]["Tables"]["pets"]["Row"];
export type Service = Database["public"]["Tables"]["services"]["Row"];
export type ServiceSizePrice = Database["public"]["Tables"]["service_size_prices"]["Row"];
export type Employee = Database["public"]["Tables"]["employees"]["Row"];
export type EmployeeService = Database["public"]["Tables"]["employee_services"]["Row"];
export type EmployeeWorkingHour = Database["public"]["Tables"]["employee_working_hours"]["Row"];
export type Appointment = Database["public"]["Tables"]["appointments"]["Row"];
export type ServiceOrder = Database["public"]["Tables"]["service_orders"]["Row"];
export type CompanySubscription = Database["public"]["Tables"]["company_subscriptions"]["Row"];
export type BillingWebhookEvent = Database["public"]["Tables"]["billing_webhook_events"]["Row"];
export type PlatformAdmin = Database["public"]["Tables"]["platform_admins"]["Row"];
export type FinancialEntry = Database["public"]["Tables"]["financial_entries"]["Row"];
export type ServicePackage = Database["public"]["Tables"]["service_packages"]["Row"];
export type ServicePackageItem = Database["public"]["Tables"]["service_package_items"]["Row"];
export type CustomerServicePackage =
  Database["public"]["Tables"]["customer_service_packages"]["Row"];
export type CustomerServicePackageItem =
  Database["public"]["Tables"]["customer_service_package_items"]["Row"];
export type CustomerServicePackageUsage =
  Database["public"]["Tables"]["customer_service_package_usages"]["Row"];
export type ProductCategory = Database["public"]["Tables"]["product_categories"]["Row"];
export type InventorySupplier = Database["public"]["Tables"]["inventory_suppliers"]["Row"];
export type Product = Database["public"]["Tables"]["products"]["Row"];
export type ProductBatch = Database["public"]["Tables"]["product_batches"]["Row"];
export type StockMovement = Database["public"]["Tables"]["stock_movements"]["Row"];
export type PetAttachment = Database["public"]["Tables"]["pet_attachments"]["Row"];
export type ServiceOrderAttachment =
  Database["public"]["Tables"]["service_order_attachments"]["Row"];
export type FinancialPayment = Database["public"]["Tables"]["financial_payments"]["Row"];
export type Sale = Database["public"]["Tables"]["sales"]["Row"];
export type SaleItem = Database["public"]["Tables"]["sale_items"]["Row"];
