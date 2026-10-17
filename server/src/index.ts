import { createServer } from "http";
import { fileURLToPath } from "url";
import path from "path";
import sirv from "sirv";
import { Server } from "colyseus";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { EagleEyesRoom } from "./rooms/EagleEyesRoom";

const port = Number(process.env.PORT ?? 2567);
const clientDist = path.join(path.dirname(fileURLToPath(import.meta.url)), "../../client/dist");

const httpServer = createServer();
const gameServer = new Server({ transport: new WebSocketTransport({ server: httpServer }) });

gameServer.define("eagle_eyes", EagleEyesRoom);

// Mounting on Colyseus's own Express app (rather than a second independent 'request'
// listener) *before* listen() lets Colyseus's route-binder detect it and fall back to
// it for any request that isn't a matchmake call, instead of both racing to respond.
const expressApp = await gameServer.transport.getExpressApp!();
expressApp.use(sirv(clientDist, { single: true }));

await gameServer.listen(port);
console.log(`EagleEyes server listening on ws://localhost:${port}`);
