import { Client, Message, MessageMedia } from "whatsapp-web.js";
import { RideShareDatabase } from "../dbService/supabaseService";

export class DriverHandler {
  private readonly DRIVERS_GROUP_ID = "120363385914840853@g.us";

  public async handleDriverResponse(
    msg: Message,
    client: Client
  ): Promise<void> {
    // Initialize the database
    const db = new RideShareDatabase();

    const messageContent: string = msg.body;
    if (!messageContent.toUpperCase().startsWith("TUJ")) {
      return;
    }

    const publicRideId: string = messageContent.toUpperCase();
    const driverNumber: string = msg.author || "";

    try {
      const foundRide = await db.getRideByPublicId(publicRideId);
      const foundDriver = await db.getDriverByPhone(driverNumber);
      const canRideBeAssigned = await db.canRideBeAssignedtoDriver(
        publicRideId,
        driverNumber
      );

      if (!canRideBeAssigned) {
        await client.sendMessage(
          driverNumber,
          `Hari ibitagenze neza turiko turabaha gutwara urugendo #${publicRideId}. Bino bikunze kuba iyo urwo rugendo rwahawe uwundi mu dereva, canke iyo ingendeshwa yanyu idafise ubushobozi bwo gutwara abiyunguruza muri urwo rugendo bose, canke mukaba mwanditse code itariyo.`
        );
        return;
      }

      await db.updateRide(publicRideId, { driver_id: foundDriver?.id });

      await client.sendMessage(
        driverNumber,
        `🎉Mwatsindiye urugendo #${publicRideId}! Murashobora kwandikira uwo mugiye gutwara kuri ino numero: +${
          foundRide?.rider_phone_number.split("@")[0]
        }`
      );

      const media = await MessageMedia.fromUrl(
        foundDriver?.car_photo_url as string,
        {
          unsafeMime: true,
          filename: `car-${foundDriver?.registration_plate_number}.png`,
        }
      );

      await client.sendMessage(foundRide?.rider_phone_number!, media, {
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

      await client.sendMessage(
        this.DRIVERS_GROUP_ID,
        `Urugendo #${publicRideId} rwamaze gufatwa na @+${
          driverNumber.split("@")[0]
        }`
      );
    } catch (e) {
      console.error(e);
      await client.sendMessage(
        driverNumber,
        `Hari ibitagenze neza turiko turabaha gutwara urugendo #${publicRideId}.`
      );
      return;
    }
  }
}
