import qrcode from "qrcode-terminal";
import {
  Client,
  Message,
  Chat,
  MessageMedia,
  RemoteAuth,
} from "whatsapp-web.js";
import { v4 as uuidv4 } from "uuid";
import { RideShareDatabase } from "./supabaseService";

import express from "express";
import { SupabaseStore } from "./supabaseSessionStore";
import axios from "axios";

// Interfaces and Types
interface RideDetails {
  pickup: string;
  destination: string;
  passengers: 1 | 2 | 3 | 4 | 5 | 6;
  rideId: string;
  userNumber: string;
  timestamp: number;
}

interface RideRequest {
  state: UserState;
  details: Partial<RideDetails>;
  requestId: string; // Unique identifier for each request
  timestamp: number;
}

// Enums
enum UserState {
  IDLE = "IDLE",
  AWAITING_PICKUP = "AWAITING_PICKUP",
  AWAITING_DESTINATION = "AWAITING_DESTINATION",
  AWAITING_PASSENGERS = "AWAITING_PASSENGERS",
  AWAITING_CONFIRMATION = "AWAITING_CONFIRMATION",
}

// Initialize the database
const db = new RideShareDatabase();

class RideSharingBot {
  private client: Client;
  private app: express.Application;
  private server: any;
  private rideRequests: Map<string, Map<string, RideRequest>>; // Map<UserNumber, Map<RequestID, Request>>;
  private readonly DRIVERS_GROUP_ID: string = "120363385914840853@g.us";
  private readonly REQUEST_TIMEOUT = 5 * 60 * 1000; // 20 minutes
  private readonly PORT = process.env.PORT || 3000;

  constructor() {
    // Initialize Express
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

    // Setup Express routes
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
    // Cleanup expired requests every minute
    setInterval(() => {
      this.cleanupExpiredRequests();
    }, 60 * 1000);
  }

  private cleanupExpiredRequests(): void {
    const now = Date.now();

    // Cleanup ride requests
    this.rideRequests.forEach((userRequests, userNumber) => {
      userRequests.forEach((request, requestId) => {
        if (now - request.timestamp > this.REQUEST_TIMEOUT) {
          userRequests.delete(requestId);
          // this.client.sendMessage(
          //   userNumber,
          //   `Your ride request #${requestId} has expired. Please start a new request if you still need a ride.`
          // );
        }
      });

      // Clean up empty user maps
      if (userRequests.size === 0) {
        this.rideRequests.delete(userNumber);
      }
    });
  }

  public async start(): Promise<void> {
    try {
      // Start Express server
      this.server = this.app.listen(Number(this.PORT), "0.0.0.0", () => {
        console.log(`Server is running on port ${this.PORT}`);
      });
      // Handle QR code generation
      this.client.on("qr", (qr) => {
        console.log("QR RECEIVED", qr);
        qrcode.generate(qr, { small: true });
      });

      // Handle ready state
      this.client.on("ready", () => {
        console.log("Client is ready!");
      });

      // Handle authentication failure
      this.client.on("auth_failure", (msg) => {
        console.error("Authentication failed:", msg);
        this.stop();
      });

      // Handle disconnection
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
          await this.handleDriverResponse(msg);
          return;
        }

        if (!chat.isGroup) {
          await this.handleUserMessage(msg);
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
      // Cleanup WhatsApp client
      if (this.client) {
        await this.client.destroy();
      }
      // Stop Express server
      if (this.server) {
        this.server.close();
      }
    } catch (error) {
      console.error("Error stopping services:", error);
    }
  }

  private generateRideId(): string {
    return "TUJ" + Math.floor(1000 + Math.random() * 9000).toString();
  }

  private async handleUserMessage(msg: Message): Promise<void> {
    const userNumber: string = msg.from;
    const allUserRequests = this.rideRequests.get(userNumber);

    // Start new ride request
    if (!allUserRequests) {
      // Check if user has too many active requests
      const userRequests = this.rideRequests.get(userNumber) || new Map();
      if (userRequests.size >= 3) {
        await msg.reply(
          "Mumaze kugerageza incuro nyinshi. Muragerageza inyuma y'akanya gato."
        );
        return;
      }

      const requestId = uuidv4();
      const newRequest: RideRequest = {
        state: UserState.AWAITING_PICKUP,
        details: {},
        requestId,
        timestamp: Date.now(),
      };

      if (!this.rideRequests.has(userNumber)) {
        this.rideRequests.set(userNumber, new Map());
      } else {
        this.rideRequests.get(userNumber)!.set(requestId, newRequest);
      }

      await msg.reply(
        `*Karibu ku rubuga Tujane*
Aho mushobora kuronka uwubatwara ahariho hose mu gisagara ca Bujumbura.

*Muri hehe ubu?*

Akarorero: Ku Mutanga kuri kaminuza y'Uburundi.`
      );
      return;
    } else {
      // Find the most recent active request for this user
      const activeRequests = Array.from(allUserRequests.values())
        .filter((req) => req.state !== UserState.IDLE)
        .sort((a, b) => b.timestamp - a.timestamp);

      if (activeRequests.length === 0) return;
      const request = activeRequests[0];

      switch (request.state) {
        case UserState.AWAITING_PICKUP:
          const pickupLocation = msg.body.trim();
          const isValidPickup = pickupLocation.length > 0;

          if (!isValidPickup) {
            await msg.reply(`*Muri hehe ubu?*

Akarorero: Ku Mutanga kuri kaminuza y'Uburundi.`);
            break;
          } else {
            request.details.pickup = msg.body;
            request.state = UserState.AWAITING_DESTINATION;
            await msg.reply(`*Mwipfuza kuja hehe?*

Akarorero: Muri Centre Ville kuri Bata.`);
            break;
          }

        case UserState.AWAITING_DESTINATION:
          const destinationLocation = msg.body.trim();
          const isValidDestination = destinationLocation.length > 0;

          if (!isValidDestination) {
            await msg.reply(`*Mwipfuza kuja hehe?*

Akarorero: Muri Centre Ville kuri Bata.`);
            break;
          } else {
            request.details.destination = msg.body;
            request.state = UserState.AWAITING_PASSENGERS;
            await msg.reply(`*Mushaka kugenda muri bangahe?*

Andika igiharuro kiri *hagati ya 1 na 6*.`);
            break;
          }

        case UserState.AWAITING_PASSENGERS:
          const passengers = msg.body.trim();
          const isValidPassengers = /^[1-6]$/.test(passengers);

          if (!isValidPassengers) {
            await msg.reply(`*Mushaka kugenda muri bangahe?*

Andika igiharuro kiri *hagati ya 1 na 6*.`);
            break;
          } else {
            request.details.passengers = Number(msg.body) as
              | 1
              | 2
              | 3
              | 4
              | 5
              | 6;
            request.state = UserState.AWAITING_CONFIRMATION;
            await msg.reply(`*Ivyerekeye urugendo rwanyu:*

- Muri aha: "${request.details.pickup}".
- Mugiye aha: "${request.details.destination}".
- Igitigiri c'abantu: ${request.details.passengers}.

Andika "*Ego*" kugira mwemeze runo rugendo, canke mwandike "*Oya*" kugira muruhebe.`);
            break;
          }

        case UserState.AWAITING_CONFIRMATION:
          if (msg.body.toLowerCase() === "ego") {
            request.details.rideId = this.generateRideId();

            request.details.userNumber = userNumber;

            request.details.timestamp = Date.now();

            try {
              await db.createRide({
                public_id: request.details.rideId,
                rider_phone_number: userNumber,
                where_from: request.details.pickup as string,
                where_to: request.details.destination as string,
                passengers: request.details.passengers as 1 | 2 | 3 | 4 | 5 | 6,
              });

              allUserRequests.delete(request.requestId);
            } catch (e) {
              console.error(
                `Error while creating the ride #${request.details.rideId}`
              );
              await msg.reply(
                `Hari ibitagenze neza turiko turategura urugendo rwanyu. Muragerageza kandi mukanya.`
              );
            }

            try {
              const rideMessage = this.createRideMessage(
                request.details as RideDetails,
                request.requestId
              );
              await this.client.sendMessage(this.DRIVERS_GROUP_ID, rideMessage);

              await msg.reply(
                `Urugendo rwanyu *#${request.details.rideId}* rwemejwe. Turiko turabaronderera uwubatwara.

Turaza gusangiza numero yanyu uwuza kubatwara.
Araza kubahamagara hanyuma muze kwumvikana ku vyerekeye amahera, hamwe naho yobasanga.

Nimutaba muraronka uwubandikira n'umwe mu minota 20 (mirongo ibiri), n'uko ata mu dereva azoba yemeye kubatwara ku mvo z'uko atari hafi canke atabishoboye. Muce mugerageza bushasha.

Mukaba mwipfuza namwe gutwara abandi kandi mukinjiza amafaranga, nimwiyandikishe muciye hano https://forms.gle/1BUdz4kW32BbXc4v6`
              );
            } catch (e) {
              await msg.reply(
                `Hari ibitagenze neza turiko turabaronderera uwubatwara. Muragerageza kandi mukanya.`
              );
            }
          } else if (msg.body.toLowerCase() === "oya") {
            request.state = UserState.AWAITING_PICKUP;
            await msg.reply(`*Muri hehe ubu?*

Akarorero: Ku Mutanga kuri kaminuza y'Uburundi.`);
          } else {
            await msg.reply(`*Ivyerekeye urugendo rwanyu:*

- Muri aha: "${request.details.pickup}".
- Mugiye aha: "${request.details.destination}".
- Igitigiri c'abantu: ${request.details.passengers}.

Andika "*Ego*" kugira mwemeze runo rugendo, canke mwandike "*Oya*" kugira muruhebe.`);
          }

          break;
      }
      return;
    }
  }

  private async handleDriverResponse(msg: Message): Promise<void> {
    const messageContent: string = msg.body;
    if (!messageContent.toUpperCase().startsWith("TUJ")) {
      return;
    }

    const publicRideId: string = messageContent.toUpperCase();
    const driverNumber: string = msg.author || "";

    try {
      const foundRide = await db.getRideByPublicId(publicRideId);
      const foundDriver = await db.getDriverByPhone(driverNumber);
      // Attempt to assign ride to driver (with race condition protection)
      const canRideBeAssigned = await db.canRideBeAssignedtoDriver(
        publicRideId,
        driverNumber
      );
      if (!canRideBeAssigned) {
        await this.client.sendMessage(
          driverNumber,
          `Hari ibitagenze neza turiko turabaha gutwara urugendo #${publicRideId}. Bino bikunze kuba iyo urwo rugendo rwahawe uwundi mu dereva, canke iyo ingendeshwa yanyu idafise ubushobozi bwo gutwara abiyunguruza muri urwo rugendo bose, canke mukaba mwanditse code itariyo.`
        );
        return;
      }

      // Assign ride to driver
      await db.updateRide(publicRideId, {
        driver_id: foundDriver?.id,
      });

      // Notifications
      await this.client.sendMessage(
        driverNumber,
        `🎉Mwatsindiye urugendo #${publicRideId}! Murashobora kwandikira uwo mugiye gutwara kuri ino numero: +${
          foundRide?.rider_phone_number.split("@")[0]
        }`
      );

      const media = await MessageMedia.fromUrl(
        foundDriver?.car_photo_url as string,
        {
          unsafeMime: true,
          filename: `car-${foundDriver?.registration_plate_number}.png`, // Provide a filename
        }
      );

      await this.client.sendMessage(foundRide?.rider_phone_number!, media, {
        caption: `🎉🚗Twashoboye kuronka uwubatwara mu rugendo #${publicRideId}. Ibiranga uwuza kubatwara ni bino bikurikira:

Izina: *${foundDriver?.full_name}*.
Numero: *+${driverNumber.split("@")[0]}*.
Plaque/Imparati: *${foundDriver?.registration_plate_number}*.
Ingendeshwa: *${foundDriver?.car_type}*.

Araza kubahamagara mukanya, ariko namwe murashobora kumuhamagara kuri +${
          driverNumber.split("@")[0]
        }.

Murakoze guhitamwo urubuga Tujane.`,
      });

      await this.client.sendMessage(
        this.DRIVERS_GROUP_ID,
        `Urugendo #${publicRideId} rwamaze gufatwa na @+${
          driverNumber.split("@")[0]
        }`
      );
    } catch (e) {
      console.error(e);
      await this.client.sendMessage(
        driverNumber,
        `Hari ibitagenze neza turiko turabaha gutwara urugendo #${publicRideId}.`
      );
      return;
    }

    // Remove from pending requests
    // this.rideRequests.get(userNumber)?.delete(foundRide.requestId);
    // if (this.rideRequests.get(userNumber)?.size === 0) {
    //   this.rideRequests.delete(userNumber);
    // }
  }

  private createRideMessage(details: RideDetails, requestId: string): string {
    return `🔴🚗Hari umuntu ariko ararondera uwumutwara.

- Ari aha: *${details.pickup}*.
- Ashaka kuja aha: *${details.destination}*.
- Igitigiri c'abantu: *${details.passengers}*.

Andika code ya runo rugendo, ariyo *${details.rideId}* mu minota itarenze 20 (mirongo ibiri) kugira mushobore kwemeza ko mugiye gutwara uno muntu.`;
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
