import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { Store } from "whatsapp-web.js";
import { config } from "./config";

interface SessionData {
  id: string;
  session_data: string;
  created_at?: string;
  updated_at?: string;
}

export class SupabaseStore implements Store {
  private supabase: SupabaseClient;
  private tableName: string;
  private sessionData: Map<string, string>;

  constructor(
    supabaseUrl: string = config.supabase.url as string,
    supabaseKey: string = config.supabase.apiKey as string,
    tableName: string = "whatsapp_sessions"
  ) {
    this.supabase = createClient(supabaseUrl, supabaseKey);
    this.tableName = tableName;
    this.sessionData = new Map();
  }

  async sessionExists(options: { session: string }): Promise<boolean> {
    const { data, error } = await this.supabase
      .from(this.tableName)
      .select("id")
      .eq("id", options.session)
      .single();

    if (error) {
      console.error("Error checking session existence:", error);
      return false;
    }

    return !!data;
  }

  async save(options: { session: string }): Promise<void> {
    // Store session data in memory
    this.sessionData.set(options.session, options.session);

    const exists = await this.sessionExists({ session: options.session });

    if (exists) {
      const { error } = await this.supabase
        .from(this.tableName)
        .update({
          session_data: options.session,
          updated_at: new Date().toISOString(),
        })
        .eq("id", options.session);

      if (error) throw new Error(`Failed to update session: ${error.message}`);
    } else {
      const { error } = await this.supabase.from(this.tableName).insert({
        id: options.session,
        session_data: options.session,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

      if (error) throw new Error(`Failed to save session: ${error.message}`);
    }
  }

  async extract(options: {
    session: string;
    path?: string;
  }): Promise<string | null> {
    // First try to get from memory
    const cachedSession = this.sessionData.get(options.session);
    if (cachedSession) {
      return cachedSession;
    }

    // If not in memory, get from database
    const { data, error } = await this.supabase
      .from(this.tableName)
      .select("session_data")
      .eq("id", options.session)
      .single();

    if (error) {
      console.error("Error extracting session:", error);
      return null;
    }

    if (data?.session_data) {
      // Store in memory for future use
      this.sessionData.set(options.session, data.session_data);
      return data.session_data;
    }

    return null;
  }

  async delete(options: { session: string }): Promise<void> {
    // Remove from memory
    this.sessionData.delete(options.session);

    const { error } = await this.supabase
      .from(this.tableName)
      .delete()
      .eq("id", options.session);

    if (error) throw new Error(`Failed to delete session: ${error.message}`);
  }
}
