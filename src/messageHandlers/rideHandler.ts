import { Message, Client } from "whatsapp-web.js";
import { RideShareDatabase } from "../dbService/supabaseService";
import { RideDetails, RideRequest, UserState } from "../interfaces";
import { v4 as uuidv4 } from "uuid";

export class RideHandler {
  private readonly DRIVERS_GROUP_ID = "120363385914840853@g.us";

  public async handleUserMessage(
    msg: Message,
    rideRequests: Map<string, Map<string, RideRequest>>,
    client: Client
  ): Promise<void> {
    // Initialize the database
    const db = new RideShareDatabase();

    const userNumber: string = msg.from;
    const allUserRequests = rideRequests.get(userNumber);

    if (!allUserRequests) {
      const userRequests = rideRequests.get(userNumber) || new Map();
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

      if (!rideRequests.has(userNumber)) {
        rideRequests.set(userNumber, new Map());
      }
      rideRequests.get(userNumber)!.set(requestId, newRequest);

      await msg.reply(`*Karibu ku rubuga Tujane*
Aho mushobora kuronka uwubatwara ahariho hose mu gisagara ca Bujumbura.

*Muri hehe ubu?*

Akarorero: Ku Mutanga kuri kaminuza y'Uburundi.`);
      return;
    } else {
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
              await client.sendMessage(this.DRIVERS_GROUP_ID, rideMessage);

              await msg.reply(`Urugendo rwanyu *#${request.details.rideId}* rwemejwe. Turiko turabaronderera uwubatwara.

Turaza gusangiza numero yanyu uwuza kubatwara.
Araza kubahamagara hanyuma muze kwumvikana ku vyerekeye amahera, hamwe naho yobasanga.

Nimutaba muraronka uwubandikira n'umwe mu minota 20 (mirongo ibiri), n'uko ata mu dereva azoba yemeye kubatwara ku mvo z'uko atari hafi canke atabishoboye. Muce mugerageza bushasha.

Mukaba mwipfuza namwe gutwara abandi kandi mukinjiza amafaranga, nimwiyandikishe muciye hano https://forms.gle/1BUdz4kW32BbXc4v6`);
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

  private generateRideId(): string {
    return "TUJ" + Math.floor(1000 + Math.random() * 9000).toString();
  }

  private createRideMessage(details: RideDetails, requestId: string): string {
    return `🔴🚗Hari umuntu ariko ararondera uwumutwara.

- Ari aha: *${details.pickup}*.
- Ashaka kuja aha: *${details.destination}*.
- Igitigiri c'abantu: *${details.passengers}*.

Andika code ya runo rugendo, ariyo *${details.rideId}* mu minota itarenze 20 (mirongo ibiri) kugira mushobore kwemeza ko mugiye gutwara uno muntu.`;
  }
}
