import { Client, getStateCallbacks } from "@colyseus/sdk";
import { EagleEyesRoomState } from "@eagleeyes/shared";

// In dev, Vite (5173) and the Colyseus server (2567) run on different ports, so derive the
// hostname but keep the server's port explicit. In production they're served from the same
// origin (the server serves the built client too), so just reuse the page's own origin/protocol.
const SERVER_URL = import.meta.env.DEV
  ? `ws://${window.location.hostname}:2567`
  : `${window.location.protocol === "https:" ? "wss:" : "ws:"}//${window.location.host}`;

export async function connectToRoom() {
  const client = new Client(SERVER_URL);
  const room = await client.joinOrCreate("eagle_eyes", {}, EagleEyesRoomState);
  const $ = getStateCallbacks(room);
  return { room, $ };
}
