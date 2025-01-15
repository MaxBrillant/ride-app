// Enums
export enum UserState {
  IDLE = "IDLE",
  AWAITING_PICKUP = "AWAITING_PICKUP",
  AWAITING_DESTINATION = "AWAITING_DESTINATION",
  AWAITING_PASSENGERS = "AWAITING_PASSENGERS",
  AWAITING_CONFIRMATION = "AWAITING_CONFIRMATION",
}
// Interfaces and Types
export interface RideDetails {
  pickup: string;
  destination: string;
  passengers: 1 | 2 | 3 | 4 | 5 | 6;
  rideId: string;
  userNumber: string;
  timestamp: number;
}

export interface RideRequest {
  state: UserState;
  details: Partial<RideDetails>;
  requestId: string;
  timestamp: number;
}
