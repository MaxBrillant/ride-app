import qrcode from "qrcode-terminal";
import { Client, Message, Chat, RemoteAuth } from "whatsapp-web.js";
import express from "express";
import axios from "axios";
import { SupabaseStore } from "./session/supabaseSessionStore";
import { RideRequest } from "./interfaces";
import { DriverHandler } from "./messageHandlers/driverHandler";
import { RideHandler } from "./messageHandlers/rideHandler";

class RideSharingBot {
  private client: Client;
  private app: express.Application;
  private server: any;
  private rideRequests: Map<string, Map<string, RideRequest>>;
  private readonly DRIVERS_GROUP_ID = "120363385914840853@g.us";
  private readonly REQUEST_TIMEOUT = 5 * 60 * 1000; // 5 minutes
  private readonly PORT = process.env.PORT || 3000;

  constructor() {
    this.app = express();
    const store = new SupabaseStore();
    this.client = new Client({
      authStrategy: new RemoteAuth({
        store: store,
        backupSyncIntervalMs: 300000,
        clientId: "ride-app-auth",
      }),
      puppeteer: {
        headless: true,
        args: [
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--disable-dev-shm-usage",
          "--disable-accelerated-2d-canvas",
          "--no-first-run",
          "--no-zygote",
          "--disable-gpu",
        ],
      },
    });

    this.setupExpress();
    this.rideRequests = new Map();
    this.startCleanupInterval();
    this.keepAlive();
  }

  private setupExpress() {
    this.app.get("/", (req, res) => {
      res.send("WhatsApp Bot is running!");
    });
  }

  private keepAlive() {
    setInterval(async () => {
      try {
        const serverUrl =
          process.env.RENDER_EXTERNAL_URL || `http://localhost:${this.PORT}`;
        await axios.get(serverUrl + "/");
        console.log("Server kept alive");
      } catch (err) {
        console.error("Error keeping server alive:", err);
      }
    }, 720000); // 12 minutes
  }

  private startCleanupInterval(): void {
    setInterval(() => {
      this.cleanupExpiredRequests();
    }, 60 * 1000); // 1 minute
  }

  private cleanupExpiredRequests(): void {
    const now = Date.now();
    this.rideRequests.forEach((userRequests, userNumber) => {
      userRequests.forEach((request, requestId) => {
        if (now - request.timestamp > this.REQUEST_TIMEOUT) {
          userRequests.delete(requestId);
        }
      });
      if (userRequests.size === 0) {
        this.rideRequests.delete(userNumber);
      }
    });
  }

  public async start(): Promise<void> {
    const driverHandler = new DriverHandler();
    const rideHandler = new RideHandler();
    try {
      this.server = this.app.listen(Number(this.PORT), "0.0.0.0", () => {
        console.log(`Server is running on port ${this.PORT}`);
      });

      this.client.on("qr", (qr) => {
        console.log("QR RECEIVED", qr);
        qrcode.generate(qr, { small: true });
      });

      this.client.on("ready", () => {
        console.log("Client is ready!");
      });

      this.client.on("auth_failure", (msg) => {
        console.error("Authentication failed:", msg);
        this.stop();
      });

      this.client.on("disconnected", (reason) => {
        console.log("Client was disconnected:", reason);
        this.stop();
      });

      this.client.on("remote_session_saved", () => {
        console.log("Session has been saved to remote DB");
      });

      this.client.on("message", async (msg: Message) => {
        const chat: Chat = await msg.getChat();
        if (chat.id._serialized === this.DRIVERS_GROUP_ID) {
          await driverHandler.handleDriverResponse(msg, this.client);
          return;
        } else {
          await rideHandler.handleUserMessage(
            msg,
            this.rideRequests,
            this.client
          );
        }
      });

      await this.client.initialize();
    } catch (error) {
      console.error("Failed to start the bot:", error);
      process.exit(1);
    }
  }

  async stop() {
    try {
      if (this.client) {
        await this.client.destroy();
      }
      if (this.server) {
        this.server.close();
      }
    } catch (error) {
      console.error("Error stopping services:", error);
    }
  }
}

// Create and start the bot
const bot = new RideSharingBot();
bot.start().catch(console.error);

// Handle process termination
process.on("SIGTERM", () => {
  console.log("SIGTERM received. Cleaning up...");
  bot.stop();
});

process.on("SIGINT", () => {
  console.log("SIGINT received. Cleaning up...");
  bot.stop();
});
