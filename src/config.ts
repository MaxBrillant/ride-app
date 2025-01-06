// src/config.ts
import dotenv from "dotenv";
import path from "path";

// Load environment variables from .env file
dotenv.config();

export const config = {
  supabase: {
    url: process.env.SUPABASE_URL,
    apiKey: process.env.SUPABASE_API_KEY,
  },

  node_env: process.env.NODE_ENV || "development",
  // Store WhatsApp session in different locations based on environment
  sessionPath:
    process.env.NODE_ENV === "production"
      ? "/tmp/.wwebjs_auth"
      : path.resolve(__dirname, "../.wwebjs_auth"),
};
