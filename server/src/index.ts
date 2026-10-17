import { createServer } from "http";
import { Server } from "colyseus";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { EagleEyesRoom } from "./rooms/EagleEyesRoom";

const port = Number(process.env.PORT ?? 2567);
const httpServer = createServer();
const gameServer = new Server({ transport: new WebSocketTransport({ server: httpServer }) });

gameServer.define("eagle_eyes", EagleEyesRoom);

await gameServer.listen(port);
console.log(`EagleEyes server listening on ws://localhost:${port}`);
