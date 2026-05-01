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
      child_settings: {
        Row: {
          child_id: string
          max_wake_window_minutes: number
          min_wake_window_minutes: number
          night_end_time: string
          night_start_time: string
          show_falling_asleep_method: boolean
          show_interruptions: boolean
          show_sleep_place: boolean
          split_night_sleep_by_date: boolean
          updated_at: string
          use_age_default_wake_window: boolean
        }
        Insert: {
          child_id: string
          max_wake_window_minutes?: number
          min_wake_window_minutes?: number
          night_end_time?: string
          night_start_time?: string
          show_falling_asleep_method?: boolean
          show_interruptions?: boolean
          show_sleep_place?: boolean
          split_night_sleep_by_date?: boolean
          updated_at?: string
          use_age_default_wake_window?: boolean
        }
        Update: {
          child_id?: string
          max_wake_window_minutes?: number
          min_wake_window_minutes?: number
          night_end_time?: string
          night_start_time?: string
          show_falling_asleep_method?: boolean
          show_interruptions?: boolean
          show_sleep_place?: boolean
          split_night_sleep_by_date?: boolean
          updated_at?: string
          use_age_default_wake_window?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "child_settings_child_id_fkey"
            columns: ["child_id"]
            isOneToOne: true
            referencedRelation: "children"
            referencedColumns: ["id"]
          },
        ]
      }
      child_users: {
        Row: {
          child_id: string
          created_at: string
          custom_relation_name: string | null
          id: string
          relation_type: Database["public"]["Enums"]["relation_type"]
          user_id: string
        }
        Insert: {
          child_id: string
          created_at?: string
          custom_relation_name?: string | null
          id?: string
          relation_type?: Database["public"]["Enums"]["relation_type"]
          user_id: string
        }
        Update: {
          child_id?: string
          created_at?: string
          custom_relation_name?: string | null
          id?: string
          relation_type?: Database["public"]["Enums"]["relation_type"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "child_users_child_id_fkey"
            columns: ["child_id"]
            isOneToOne: false
            referencedRelation: "children"
            referencedColumns: ["id"]
          },
        ]
      }
      children: {
        Row: {
          birth_date: string | null
          created_at: string
          gender: Database["public"]["Enums"]["gender_type"] | null
          id: string
          name: string
          photo_url: string | null
          updated_at: string
        }
        Insert: {
          birth_date?: string | null
          created_at?: string
          gender?: Database["public"]["Enums"]["gender_type"] | null
          id?: string
          name: string
          photo_url?: string | null
          updated_at?: string
        }
        Update: {
          birth_date?: string | null
          created_at?: string
          gender?: Database["public"]["Enums"]["gender_type"] | null
          id?: string
          name?: string
          photo_url?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          display_name: string | null
          id: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          id: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      settling_methods: {
        Row: {
          child_id: string
          created_at: string
          id: string
          name: string
        }
        Insert: {
          child_id: string
          created_at?: string
          id?: string
          name: string
        }
        Update: {
          child_id?: string
          created_at?: string
          id?: string
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "settling_methods_child_id_fkey"
            columns: ["child_id"]
            isOneToOne: false
            referencedRelation: "children"
            referencedColumns: ["id"]
          },
        ]
      }
      sleep_interruptions: {
        Row: {
          comment: string | null
          created_at: string
          created_by_user_id: string | null
          end_time: string | null
          id: string
          sleep_session_id: string
          start_time: string
        }
        Insert: {
          comment?: string | null
          created_at?: string
          created_by_user_id?: string | null
          end_time?: string | null
          id?: string
          sleep_session_id: string
          start_time: string
        }
        Update: {
          comment?: string | null
          created_at?: string
          created_by_user_id?: string | null
          end_time?: string | null
          id?: string
          sleep_session_id?: string
          start_time?: string
        }
        Relationships: [
          {
            foreignKeyName: "sleep_interruptions_sleep_session_id_fkey"
            columns: ["sleep_session_id"]
            isOneToOne: false
            referencedRelation: "sleep_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      sleep_places: {
        Row: {
          child_id: string
          created_at: string
          id: string
          name: string
        }
        Insert: {
          child_id: string
          created_at?: string
          id?: string
          name: string
        }
        Update: {
          child_id?: string
          created_at?: string
          id?: string
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "sleep_places_child_id_fkey"
            columns: ["child_id"]
            isOneToOne: false
            referencedRelation: "children"
            referencedColumns: ["id"]
          },
        ]
      }
      sleep_sessions: {
        Row: {
          child_id: string
          comment: string | null
          created_at: string
          created_by_user_id: string | null
          end_time: string | null
          id: string
          settling_method_id: string | null
          sleep_place_id: string | null
          sleep_type: Database["public"]["Enums"]["sleep_type"]
          start_time: string
          updated_at: string
          updated_by_user_id: string | null
        }
        Insert: {
          child_id: string
          comment?: string | null
          created_at?: string
          created_by_user_id?: string | null
          end_time?: string | null
          id?: string
          settling_method_id?: string | null
          sleep_place_id?: string | null
          sleep_type?: Database["public"]["Enums"]["sleep_type"]
          start_time: string
          updated_at?: string
          updated_by_user_id?: string | null
        }
        Update: {
          child_id?: string
          comment?: string | null
          created_at?: string
          created_by_user_id?: string | null
          end_time?: string | null
          id?: string
          settling_method_id?: string | null
          sleep_place_id?: string | null
          sleep_type?: Database["public"]["Enums"]["sleep_type"]
          start_time?: string
          updated_at?: string
          updated_by_user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sleep_sessions_child_id_fkey"
            columns: ["child_id"]
            isOneToOne: false
            referencedRelation: "children"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sleep_sessions_settling_method_id_fkey"
            columns: ["settling_method_id"]
            isOneToOne: false
            referencedRelation: "settling_methods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sleep_sessions_sleep_place_id_fkey"
            columns: ["sleep_place_id"]
            isOneToOne: false
            referencedRelation: "sleep_places"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      create_child_with_link:
        | {
            Args: {
              _birth_date: string
              _gender: Database["public"]["Enums"]["gender_type"]
              _name: string
              _relation: Database["public"]["Enums"]["relation_type"]
            }
            Returns: string
          }
        | {
            Args: {
              _birth_date: string
              _custom_relation_name?: string
              _gender: Database["public"]["Enums"]["gender_type"]
              _name: string
              _relation: Database["public"]["Enums"]["relation_type"]
            }
            Returns: string
          }
      user_has_child_access: {
        Args: { _child_id: string; _user_id: string }
        Returns: boolean
      }
      user_has_session_access: {
        Args: { _session_id: string; _user_id: string }
        Returns: boolean
      }
    }
    Enums: {
      gender_type: "male" | "female" | "other"
      relation_type: "mother" | "father" | "other"
      sleep_type: "day" | "night"
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
      gender_type: ["male", "female", "other"],
      relation_type: ["mother", "father", "other"],
      sleep_type: ["day", "night"],
    },
  },
} as const
