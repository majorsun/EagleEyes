import { Client, getStateCallbacks } from "@colyseus/sdk";
import { EagleEyesRoomState } from "@eagleeyes/shared";

// Derived from the page's own hostname rather than hardcoded "localhost" so a client loaded over
// the LAN (e.g. http://192.168.x.x:5173) connects back to that same machine's server, not its own.
const SERVER_URL = `ws://${window.location.hostname}:2567`;

export async function connectToRoom() {
  const client = new Client(SERVER_URL);
  const room = await client.joinOrCreate("eagle_eyes", {}, EagleEyesRoomState);
  const $ = getStateCallbacks(room);
  return { room, $ };
}
