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
export type FinancialEntryStatus = "pending" | "paid" | "cancelled";
export type FinancialSourceType = "service_order" | "manual";
export type PaymentMethod =
  | "cash"
  | "pix"
  | "debit_card"
  | "credit_card"
  | "bank_transfer"
  | "other";

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          full_name: string;
          phone: string | null;
          avatar_url: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          full_name: string;
          phone?: string | null;
          avatar_url?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          full_name?: string;
          phone?: string | null;
          avatar_url?: string | null;
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
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          timezone?: string;
          created_by: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          timezone?: string;
          created_by?: string;
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
        };
        Insert: {
          company_id: string;
          user_id: string;
          role: CompanyRole;
          created_at?: string;
        };
        Update: {
          company_id?: string;
          user_id?: string;
          role?: CompanyRole;
          created_at?: string;
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
      financial_entries: {
        Row: {
          id: string;
          company_id: string;
          entry_type: FinancialEntryType;
          status: FinancialEntryStatus;
          source_type: FinancialSourceType;
          service_order_id: string | null;
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
    };
    Views: Record<string, never>;
    Functions: {
      complete_onboarding: {
        Args: {
          p_full_name: string;
          p_company_name: string;
          p_phone?: string | null;
        };
        Returns: string;
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
