import { createClient, SupabaseClient } from "@supabase/supabase-js";
import fs from "fs";
import { Readable } from "stream";

interface StoreOptions {
  session: string;
  path?: string;
}

export class SupabaseStore {
  private supabase: SupabaseClient = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_API_KEY!
  );
  private bucketName: string = "whatsapp-sessions";

  constructor() {}

  async sessionExists(options: StoreOptions): Promise<boolean> {
    const { data, error } = await this.supabase.storage
      .from(this.bucketName)
      .list("", {
        search: `${options.session}.zip`,
      });

    if (error) {
      throw error;
    }

    return data.length > 0;
  }

  async save(options: StoreOptions): Promise<void> {
    const fileBuffer = fs.readFileSync(`${options.session}.zip`);

    // Upload the new session file
    const { error: uploadError } = await this.supabase.storage
      .from(this.bucketName)
      .upload(`${options.session}.zip`, fileBuffer, {
        upsert: true,
      });

    if (uploadError) {
      throw uploadError;
    }

    await this.deletePrevious(options);
  }

  async extract(options: StoreOptions): Promise<void> {
    const { data, error } = await this.supabase.storage
      .from(this.bucketName)
      .download(`${options.session}.zip`);

    if (error) {
      throw error;
    }

    if (!data) {
      throw new Error("No data received from storage");
    }

    return new Promise(async (resolve, reject) => {
      const arrayBuffer = await data.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      fs.writeFile(options.path || `${options.session}.zip`, buffer, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  async delete(options: StoreOptions): Promise<void> {
    const { error } = await this.supabase.storage
      .from(this.bucketName)
      .remove([`${options.session}.zip`]);

    if (error) {
      throw error;
    }
  }

  private async deletePrevious(options: StoreOptions): Promise<void> {
    const { data, error } = await this.supabase.storage
      .from(this.bucketName)
      .list("", {
        search: `${options.session}.zip`,
      });

    if (error) {
      throw error;
    }

    // If there are multiple files with the same name pattern
    if (data.length > 1) {
      // Sort by created_at and get the oldest file
      const oldestFile = data.sort(
        (a, b) =>
          new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      )[0];

      // Delete the oldest file
      const { error: deleteError } = await this.supabase.storage
        .from(this.bucketName)
        .remove([oldestFile.name]);

      if (deleteError) {
        throw deleteError;
      }
    }
  }
}
