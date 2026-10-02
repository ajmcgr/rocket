export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.4";
  };
  public: {
    Tables: {
      app_owners: {
        Row: {
          app_id: string;
          user_id: string;
          verification_level: string;
          revoked_at: string | null;
        };
        Insert: {
          app_id: string;
          user_id: string;
          verification_level: string;
          revoked_at?: string | null;
        };
        Update: {
          app_id?: string;
          user_id?: string;
          verification_level?: string;
          revoked_at?: string | null;
        };
        Relationships: [];
      };
      saved_apps: {
        Row: { user_id: string; app_id: string; saved_at: string };
        Insert: { user_id: string; app_id: string; saved_at?: string };
        Update: { user_id?: string; app_id?: string; saved_at?: string };
        Relationships: [];
      };
      public_app_revenue: {
        Row: {
          app_id: string;
          currency: string;
          metric_type: string;
          visibility: string;
          mrr_minor: number | null;
          range_lower_minor: number | null;
          range_upper_minor: number | null;
          observed_at: string;
          last_verified_at: string;
          provider: string;
        };
        Insert: {
          app_id: string;
          currency: string;
          metric_type: string;
          visibility: string;
          mrr_minor?: number | null;
          range_lower_minor?: number | null;
          range_upper_minor?: number | null;
          observed_at: string;
          last_verified_at: string;
          provider: string;
        };
        Update: {
          app_id?: string;
          currency?: string;
          metric_type?: string;
          visibility?: string;
          mrr_minor?: number | null;
          range_lower_minor?: number | null;
          range_upper_minor?: number | null;
          observed_at?: string;
          last_verified_at?: string;
          provider?: string;
        };
        Relationships: [];
      };
      public_app_traction: {
        Row: {
          app_id: string;
          metric_type: string;
          visibility: string;
          value: number | null;
          value_range: string | null;
          metric_date: string;
          provider: string;
          last_verified_at: string;
        };
        Insert: {
          app_id: string;
          metric_type: string;
          visibility: string;
          value?: number | null;
          value_range?: string | null;
          metric_date: string;
          provider: string;
          last_verified_at: string;
        };
        Update: {
          app_id?: string;
          metric_type?: string;
          visibility?: string;
          value?: number | null;
          value_range?: string | null;
          metric_date?: string;
          provider?: string;
          last_verified_at?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      public_app_media: {
        Row: {
          id: string;
          app_id: string;
          media_type: string;
          source_url: string;
          sort_order: number;
          source_type: string;
          first_seen_at: string;
        };
        Relationships: [];
      };
      public_app_media_covers: {
        Row: {
          id: string;
          app_id: string;
          media_type: string;
          source_url: string;
          sort_order: number;
          source_type: string;
        };
        Relationships: [];
      };
      public_app_reviews: {
        Row: {
          id: string;
          app_id: string;
          user_id: string;
          rating: number;
          body: string;
          created_at: string;
          updated_at: string;
        };
        Relationships: [];
      };
      public_app_review_summary: {
        Row: { app_id: string; rating_count: number; average_rating: number };
        Relationships: [];
      };
      public_app_presentation: {
        Row: {
          app_id: string;
          pricing_display: string | null;
          public_links: string[];
          updated_at: string;
          developer_handle: string | null;
        };
        Relationships: [];
      };
      public_app_card_metadata: {
        Row: {
          app_id: string;
          save_count: number;
          rating_count: number;
          developer_handle: string | null;
        };
        Relationships: [];
      };
      public_app_trust: {
        Row: {
          app_id: string;
          claimed: boolean;
          domain_verified: boolean;
          traffic_verified: boolean;
          revenue_verified: boolean;
        };
        Relationships: [];
      };
      public_app_intelligence: {
        Row: {
          app_id: string;
          signal_type: string;
          evidence_source: string;
          net_votes: number;
          age_band: string;
          cohort_category: string | null;
          cohort_size: number;
          percentile_rank: number;
          category_median_votes: number | null;
          source_updated_at: string;
          calculated_at: string;
          calculation_version: number;
        };
        Relationships: [];
      };
      public_discoverable_app_intelligence: {
        Row: {
          app_id: string;
          signal_type: string;
          evidence_source: string;
          net_votes: number;
          age_band: string;
          cohort_category: string | null;
          cohort_size: number;
          percentile_rank: number;
          category_median_votes: number | null;
          source_updated_at: string;
          calculated_at: string;
          calculation_version: number;
        };
        Relationships: [];
      };
      public_app_rankings: {
        Row: {
          app_id: string;
          categories: string[];
          launched_at: string | null;
          rocket_view_count: number;
          last_viewed_at: string | null;
        };
        Relationships: [];
      };
      public_ranking_categories: {
        Row: { category: string; app_count: number };
        Relationships: [];
      };
      public_category_intelligence: {
        Row: {
          category: string;
          recent_launches: number;
          previous_launches: number;
          launch_volume_change_pct: number | null;
          median_recent_votes: number | null;
          top_decile_recent_count: number;
          recent_catalogue_share_pct: number;
          window_ends_at: string;
          calculated_at: string;
          calculation_version: number;
        };
        Relationships: [];
      };
      public_apps: {
        Row: {
          id: string;
          slug: string;
          name: string;
          tagline: string | null;
          description: string | null;
          website_url: string;
          canonical_host: string;
          logo_url: string | null;
          categories: string[];
          tags: string[];
          platforms: string[];
          launched_at: string | null;
          discovered_at: string;
          launch_url: string | null;
          claim_state: string;
        };
        Relationships: [];
      };
      public_discoverable_apps: {
        Row: {
          id: string;
          slug: string;
          name: string;
          tagline: string | null;
          description: string | null;
          website_url: string;
          canonical_host: string;
          logo_url: string | null;
          categories: string[];
          tags: string[];
          platforms: string[];
          launched_at: string | null;
          discovered_at: string;
          launch_url: string | null;
          claim_state: string;
        };
        Relationships: [];
      };
      public_app_sources: {
        Row: {
          app_id: string;
          source_type: string;
          source_url: string;
          first_seen_at: string;
          last_seen_at: string;
        };
        Relationships: [];
      };
      public_app_categories: {
        Row: { category: string; app_count: number };
        Relationships: [];
      };
    };
    Functions: {
      upsert_app_review: {
        Args: { p_app_id: string; p_rating: number; p_body: string };
        Returns: string;
      };
      delete_app_review: { Args: { p_app_id: string }; Returns: boolean };
      report_app_review: {
        Args: { p_review_id: string; p_reason: string };
        Returns: boolean;
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<
  keyof Database,
  "public"
>];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {},
  },
} as const;
