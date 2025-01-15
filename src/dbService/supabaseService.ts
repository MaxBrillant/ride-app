import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { config } from "./config";

interface Driver {
  id: number;
  phone_number: string;
  full_name: string;
  registration_plate_number: string;
  car_type: string;
  car_photo_url: string;
  car_capacity: 1 | 2 | 3 | 4 | 5 | 6;
}

interface Ride {
  id: number;
  public_id: string;
  rider_phone_number: string;
  driver_id: number;
  where_from: string;
  where_to: string;
  passengers: 1 | 2 | 3 | 4 | 5 | 6;
  created_at: Date;
}

// Database helper class
class RideShareDatabase {
  private supabase: SupabaseClient;

  constructor() {
    this.supabase = createClient(
      config.supabase.url as string,
      config.supabase.apiKey as string
    );
  }

  // Driver operations

  async getDriverByPhone(phoneNumber: string): Promise<Driver | null> {
    const { data, error } = await this.supabase
      .from("drivers")
      .select()
      .eq("phone_number", phoneNumber.split("@")[0])
      .single();

    if (error) {
      throw new Error("Error fetching driver:" + error);
    }

    return data;
  }

  async getDriverById(id: string): Promise<Driver | null> {
    const { data, error } = await this.supabase
      .from("drivers")
      .select()
      .eq("id", id)
      .single();

    if (error) {
      throw new Error("Error fetching driver: " + error);
    }

    return data;
  }

  async canRideBeAssignedtoDriver(
    publicId: string,
    driverPhoneNumber: string
  ): Promise<boolean> {
    const { data, error } = await this.supabase
      .from("rides")
      .select("public_id, driver_id, passengers, created_at")
      .eq("public_id", publicId)
      .single();

    if (error) {
      throw new Error("Error checking if ride is assigned: " + error);
    }

    if (
      !data.driver_id &&
      new Date(data.created_at).getTime() > Date.now() - 20 * 60 * 1000
    ) {
      const driverData = await this.getDriverByPhone(driverPhoneNumber);
      if (
        driverData &&
        driverData.car_capacity >= (data.passengers as 1 | 2 | 3 | 4 | 5 | 6)
      ) {
        return true;
      } else {
        return false;
      }
    } else {
      return false;
    }
  }

  async getAllDriverRides(driverId: string): Promise<Ride[]> {
    const { data, error } = await this.supabase
      .from("rides")
      .select()
      .eq("driver_id", driverId);

    if (error) {
      throw new Error("Error fetching driver rides: " + error);
    }

    return data || [];
  }

  // Ride operations
  async createRide(
    ride: Omit<Ride, "id" | "driver_id" | "created_at">
  ): Promise<Ride | null> {
    const { data, error } = await this.supabase
      .from("rides")
      .insert([ride])
      .select()
      .single();

    if (error) {
      throw new Error("Error creating ride: " + error);
    }

    return data;
  }

  async getRideByPublicId(publicId: string): Promise<Ride | null> {
    const { data, error } = await this.supabase
      .from("rides")
      .select()
      .eq("public_id", publicId)
      .single();

    if (error) {
      throw new Error("Error fetching ride: " + error);
    }

    return data;
  }

  async updateRide(
    publicId: string,
    updates: Partial<Ride>
  ): Promise<Ride | null> {
    const { data, error } = await this.supabase
      .from("rides")
      .update(updates)
      .eq("public_id", publicId)
      .select()
      .single();

    if (error) {
      throw new Error("Error updating ride: " + error);
    }

    return data;
  }
  async getAllRiderRides(phoneNumber: string): Promise<Ride[]> {
    const { data, error } = await this.supabase
      .from("rides")
      .select()
      .eq("rider_phone_number", phoneNumber);

    if (error) {
      throw new Error("Error fetching rider rides: " + error);
    }

    return data || [];
  }
}

export { RideShareDatabase, Driver, Ride };
