export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      chat_messages: {
        Row: {
          body: string
          created_at: string
          id: string
          room_id: string
          sender_display_name: string
          user_id: string | null
        }
        Insert: {
          body: string
          created_at?: string
          id?: string
          room_id: string
          sender_display_name: string
          user_id?: string | null
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          room_id?: string
          sender_display_name?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "chat_messages_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      media_items: {
        Row: {
          created_at: string
          created_by: string
          id: string
          queue_position: number
          room_id: string
          source_revision: number
          source_type: Database["public"]["Enums"]["media_source_type"]
          source_url: string | null
          title: string
          torrent_file_index: number | null
          torrent_file_name: string | null
          torrent_file_path: string | null
          torrent_file_size: number | null
          torrent_info_hash: string | null
          torrent_input_kind:
            | Database["public"]["Enums"]["torrent_input_kind"]
            | null
          torrent_magnet_uri: string | null
          torrent_metadata_path: string | null
          torrent_name: string | null
          updated_at: string
          youtube_video_id: string | null
        }
        Insert: {
          created_at?: string
          created_by: string
          id?: string
          queue_position: number
          room_id: string
          source_revision?: number
          source_type?: Database["public"]["Enums"]["media_source_type"]
          source_url?: string | null
          title: string
          torrent_file_index?: number | null
          torrent_file_name?: string | null
          torrent_file_path?: string | null
          torrent_file_size?: number | null
          torrent_info_hash?: string | null
          torrent_input_kind?:
            | Database["public"]["Enums"]["torrent_input_kind"]
            | null
          torrent_magnet_uri?: string | null
          torrent_metadata_path?: string | null
          torrent_name?: string | null
          updated_at?: string
          youtube_video_id?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          queue_position?: number
          room_id?: string
          source_revision?: number
          source_type?: Database["public"]["Enums"]["media_source_type"]
          source_url?: string | null
          title?: string
          torrent_file_index?: number | null
          torrent_file_name?: string | null
          torrent_file_path?: string | null
          torrent_file_size?: number | null
          torrent_info_hash?: string | null
          torrent_input_kind?:
            | Database["public"]["Enums"]["torrent_input_kind"]
            | null
          torrent_magnet_uri?: string | null
          torrent_metadata_path?: string | null
          torrent_name?: string | null
          updated_at?: string
          youtube_video_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "media_items_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      room_playback_state: {
        Row: {
          anchor_position_sec: number
          anchor_server_time: string
          current_media_id: string | null
          room_id: string
          state_version: number
          status: Database["public"]["Enums"]["playback_status"]
          updated_at: string
        }
        Insert: {
          anchor_position_sec?: number
          anchor_server_time?: string
          current_media_id?: string | null
          room_id: string
          state_version?: number
          status?: Database["public"]["Enums"]["playback_status"]
          updated_at?: string
        }
        Update: {
          anchor_position_sec?: number
          anchor_server_time?: string
          current_media_id?: string | null
          room_id?: string
          state_version?: number
          status?: Database["public"]["Enums"]["playback_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "room_playback_state_current_media_fkey"
            columns: ["room_id", "current_media_id"]
            isOneToOne: false
            referencedRelation: "media_items"
            referencedColumns: ["room_id", "id"]
          },
          {
            foreignKeyName: "room_playback_state_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: true
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      room_sessions: {
        Row: {
          display_name: string
          id: string
          joined_at: string
          room_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          display_name: string
          id?: string
          joined_at?: string
          room_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          display_name?: string
          id?: string
          joined_at?: string
          room_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "room_sessions_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      rooms: {
        Row: {
          created_at: string
          deactivated_at: string | null
          id: string
          name: string
          owner_user_id: string
          status: Database["public"]["Enums"]["room_status"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          deactivated_at?: string | null
          id?: string
          name: string
          owner_user_id: string
          status?: Database["public"]["Enums"]["room_status"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          deactivated_at?: string | null
          id?: string
          name?: string
          owner_user_id?: string
          status?: Database["public"]["Enums"]["room_status"]
          updated_at?: string
        }
        Relationships: []
      }
      subtitles: {
        Row: {
          created_at: string
          created_by: string
          format: string
          id: string
          label: string
          language_code: string | null
          media_id: string
          room_id: string
          storage_path: string
        }
        Insert: {
          created_at?: string
          created_by: string
          format?: string
          id?: string
          label: string
          language_code?: string | null
          media_id: string
          room_id: string
          storage_path: string
        }
        Update: {
          created_at?: string
          created_by?: string
          format?: string
          id?: string
          label?: string
          language_code?: string | null
          media_id?: string
          room_id?: string
          storage_path?: string
        }
        Relationships: [
          {
            foreignKeyName: "subtitles_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subtitles_room_media_fkey"
            columns: ["room_id", "media_id"]
            isOneToOne: false
            referencedRelation: "media_items"
            referencedColumns: ["room_id", "id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      add_local_p2p_media_item: {
        Args: {
          p_file_name: string
          p_file_size: number
          p_info_hash: string
          p_magnet_uri: string
          p_media_id: string
          p_room_id: string
          p_title: string
        }
        Returns: {
          created_at: string
          created_by: string
          id: string
          queue_position: number
          room_id: string
          source_revision: number
          source_type: Database["public"]["Enums"]["media_source_type"]
          source_url: string | null
          title: string
          torrent_file_index: number | null
          torrent_file_name: string | null
          torrent_file_path: string | null
          torrent_file_size: number | null
          torrent_info_hash: string | null
          torrent_input_kind:
            | Database["public"]["Enums"]["torrent_input_kind"]
            | null
          torrent_magnet_uri: string | null
          torrent_metadata_path: string | null
          torrent_name: string | null
          updated_at: string
          youtube_video_id: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "media_items"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      add_media_item: {
        Args: {
          p_media_id?: string
          p_room_id: string
          p_source_type?: Database["public"]["Enums"]["media_source_type"]
          p_source_url?: string
          p_title: string
          p_torrent_file_index?: number
          p_torrent_file_name?: string
          p_torrent_file_path?: string
          p_torrent_file_size?: number
          p_torrent_info_hash?: string
          p_torrent_input_kind?: Database["public"]["Enums"]["torrent_input_kind"]
          p_torrent_magnet_uri?: string
          p_torrent_metadata_path?: string
          p_torrent_name?: string
          p_youtube_video_id?: string
        }
        Returns: {
          created_at: string
          created_by: string
          id: string
          queue_position: number
          room_id: string
          source_revision: number
          source_type: Database["public"]["Enums"]["media_source_type"]
          source_url: string | null
          title: string
          torrent_file_index: number | null
          torrent_file_name: string | null
          torrent_file_path: string | null
          torrent_file_size: number | null
          torrent_info_hash: string | null
          torrent_input_kind:
            | Database["public"]["Enums"]["torrent_input_kind"]
            | null
          torrent_magnet_uri: string | null
          torrent_metadata_path: string | null
          torrent_name: string | null
          updated_at: string
          youtube_video_id: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "media_items"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      create_room: {
        Args: { p_name: string }
        Returns: {
          anchor_position_sec: number
          anchor_server_time: string
          created_at: string
          owner_user_id: string
          playback_status: Database["public"]["Enums"]["playback_status"]
          room_id: string
          room_name: string
          state_version: number
          updated_at: string
        }[]
      }
      create_subtitle_metadata: {
        Args: {
          p_label: string
          p_language_code?: string
          p_media_id: string
          p_room_id: string
          p_subtitle_id: string
        }
        Returns: {
          created_at: string
          created_by: string
          format: string
          id: string
          label: string
          language_code: string
          media_id: string
          room_id: string
          storage_path: string
        }[]
      }
      deactivate_room: {
        Args: { p_room_id: string }
        Returns: {
          created_at: string
          deactivated_at: string
          id: string
          name: string
          owner_user_id: string
          status: Database["public"]["Enums"]["room_status"]
          updated_at: string
        }[]
      }
      delete_subtitle_metadata: {
        Args: { p_room_id: string; p_subtitle_id: string }
        Returns: {
          created_at: string
          created_by: string
          format: string
          id: string
          label: string
          language_code: string
          media_id: string
          room_id: string
          storage_path: string
        }[]
      }
      edit_local_p2p_media_item: {
        Args: {
          p_file_name: string
          p_file_size: number
          p_info_hash: string
          p_magnet_uri: string
          p_media_id: string
          p_room_id: string
          p_title: string
        }
        Returns: {
          created_at: string
          created_by: string
          id: string
          queue_position: number
          room_id: string
          source_revision: number
          source_type: Database["public"]["Enums"]["media_source_type"]
          source_url: string | null
          title: string
          torrent_file_index: number | null
          torrent_file_name: string | null
          torrent_file_path: string | null
          torrent_file_size: number | null
          torrent_info_hash: string | null
          torrent_input_kind:
            | Database["public"]["Enums"]["torrent_input_kind"]
            | null
          torrent_magnet_uri: string | null
          torrent_metadata_path: string | null
          torrent_name: string | null
          updated_at: string
          youtube_video_id: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "media_items"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      edit_media_item: {
        Args: {
          p_media_id: string
          p_room_id: string
          p_source_type?: Database["public"]["Enums"]["media_source_type"]
          p_source_url?: string
          p_title: string
          p_torrent_file_index?: number
          p_torrent_file_name?: string
          p_torrent_file_path?: string
          p_torrent_file_size?: number
          p_torrent_info_hash?: string
          p_torrent_input_kind?: Database["public"]["Enums"]["torrent_input_kind"]
          p_torrent_magnet_uri?: string
          p_torrent_metadata_path?: string
          p_torrent_name?: string
          p_youtube_video_id?: string
        }
        Returns: {
          created_at: string
          created_by: string
          id: string
          queue_position: number
          room_id: string
          source_revision: number
          source_type: Database["public"]["Enums"]["media_source_type"]
          source_url: string | null
          title: string
          torrent_file_index: number | null
          torrent_file_name: string | null
          torrent_file_path: string | null
          torrent_file_size: number | null
          torrent_info_hash: string | null
          torrent_input_kind:
            | Database["public"]["Enums"]["torrent_input_kind"]
            | null
          torrent_magnet_uri: string | null
          torrent_metadata_path: string | null
          torrent_name: string | null
          updated_at: string
          youtube_video_id: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "media_items"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_local_p2p_source: {
        Args: { p_media_id: string; p_room_id: string }
        Returns: {
          file_name: string
          file_size: number
          info_hash: string
          magnet_uri: string
        }[]
      }
      get_room_join_preview: {
        Args: { p_room_id: string }
        Returns: {
          current_title: string
          has_active_media: boolean
          room_id: string
          room_name: string
        }[]
      }
      get_room_snapshot: {
        Args: { p_chat_limit?: number; p_room_id: string }
        Returns: Json
      }
      get_server_time: { Args: never; Returns: string }
      hard_delete_room: {
        Args: { p_room_id: string }
        Returns: {
          id: string
        }[]
      }
      join_room: {
        Args: { p_display_name: string; p_room_id: string }
        Returns: {
          display_name: string
          joined_at: string
          room_id: string
          session_id: string
          updated_at: string
          user_id: string
        }[]
      }
      list_owned_rooms: {
        Args: { p_include_deactivated?: boolean }
        Returns: {
          created_at: string
          deactivated_at: string
          id: string
          name: string
          owner_user_id: string
          status: Database["public"]["Enums"]["room_status"]
          updated_at: string
        }[]
      }
      reactivate_room: {
        Args: { p_room_id: string }
        Returns: {
          created_at: string
          deactivated_at: string
          id: string
          name: string
          owner_user_id: string
          status: Database["public"]["Enums"]["room_status"]
          updated_at: string
        }[]
      }
      remove_media_item: {
        Args: { p_media_id: string; p_room_id: string }
        Returns: {
          created_at: string
          created_by: string
          id: string
          queue_position: number
          room_id: string
          source_revision: number
          source_type: Database["public"]["Enums"]["media_source_type"]
          source_url: string | null
          title: string
          torrent_file_index: number | null
          torrent_file_name: string | null
          torrent_file_path: string | null
          torrent_file_size: number | null
          torrent_info_hash: string | null
          torrent_input_kind:
            | Database["public"]["Enums"]["torrent_input_kind"]
            | null
          torrent_magnet_uri: string | null
          torrent_metadata_path: string | null
          torrent_name: string | null
          updated_at: string
          youtube_video_id: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "media_items"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      rename_room: {
        Args: { p_name: string; p_room_id: string }
        Returns: {
          created_at: string
          id: string
          name: string
          owner_user_id: string
          updated_at: string
        }[]
      }
      reorder_media_items: {
        Args: { p_ordered_media_ids: string[]; p_room_id: string }
        Returns: {
          created_at: string
          created_by: string
          id: string
          queue_position: number
          room_id: string
          source_revision: number
          source_type: Database["public"]["Enums"]["media_source_type"]
          source_url: string | null
          title: string
          torrent_file_index: number | null
          torrent_file_name: string | null
          torrent_file_path: string | null
          torrent_file_size: number | null
          torrent_info_hash: string | null
          torrent_input_kind:
            | Database["public"]["Enums"]["torrent_input_kind"]
            | null
          torrent_magnet_uri: string | null
          torrent_metadata_path: string | null
          torrent_name: string | null
          updated_at: string
          youtube_video_id: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "media_items"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      room_mark_ended: {
        Args: { p_expected_version: number; p_room_id: string }
        Returns: {
          anchor_position_sec: number
          anchor_server_time: string
          current_media_id: string
          room_id: string
          state_version: number
          status: Database["public"]["Enums"]["playback_status"]
          updated_at: string
        }[]
      }
      room_pause: {
        Args: { p_expected_version: number; p_room_id: string }
        Returns: {
          anchor_position_sec: number
          anchor_server_time: string
          current_media_id: string
          room_id: string
          state_version: number
          status: Database["public"]["Enums"]["playback_status"]
          updated_at: string
        }[]
      }
      room_play: {
        Args: { p_expected_version: number; p_room_id: string }
        Returns: {
          anchor_position_sec: number
          anchor_server_time: string
          current_media_id: string
          room_id: string
          state_version: number
          status: Database["public"]["Enums"]["playback_status"]
          updated_at: string
        }[]
      }
      room_play_next: {
        Args: { p_expected_version: number; p_room_id: string }
        Returns: {
          anchor_position_sec: number
          anchor_server_time: string
          current_media_id: string
          room_id: string
          state_version: number
          status: Database["public"]["Enums"]["playback_status"]
          updated_at: string
        }[]
      }
      room_restart: {
        Args: { p_expected_version: number; p_room_id: string }
        Returns: {
          anchor_position_sec: number
          anchor_server_time: string
          current_media_id: string
          room_id: string
          state_version: number
          status: Database["public"]["Enums"]["playback_status"]
          updated_at: string
        }[]
      }
      room_seek: {
        Args: {
          p_expected_version: number
          p_room_id: string
          p_target_position_sec: number
        }
        Returns: {
          anchor_position_sec: number
          anchor_server_time: string
          current_media_id: string
          room_id: string
          state_version: number
          status: Database["public"]["Enums"]["playback_status"]
          updated_at: string
        }[]
      }
      room_select_media: {
        Args: {
          p_autoplay: boolean
          p_expected_version: number
          p_media_id: string
          p_room_id: string
        }
        Returns: {
          anchor_position_sec: number
          anchor_server_time: string
          current_media_id: string
          room_id: string
          state_version: number
          status: Database["public"]["Enums"]["playback_status"]
          updated_at: string
        }[]
      }
      send_chat_message: {
        Args: { p_body: string; p_room_id: string }
        Returns: {
          body: string
          created_at: string
          id: string
          room_id: string
          sender_display_name: string
          user_id: string
        }[]
      }
    }
    Enums: {
      media_source_type:
        | "auto"
        | "mp4"
        | "hls"
        | "youtube"
        | "torrent"
        | "local_p2p"
      playback_status: "idle" | "paused" | "playing" | "ended"
      room_status: "active" | "deactivated"
      torrent_input_kind: "magnet" | "torrent_file"
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
      media_source_type: [
        "auto",
        "mp4",
        "hls",
        "youtube",
        "torrent",
        "local_p2p",
      ],
      playback_status: ["idle", "paused", "playing", "ended"],
      room_status: ["active", "deactivated"],
      torrent_input_kind: ["magnet", "torrent_file"],
    },
  },
} as const
