# EagleEyes

A browser-based multiplayer first-person shooter. The client is built with [Babylon.js](https://www.babylonjs.com/) and [Vite](https://vitejs.dev/); the server is an authoritative [Colyseus](https://colyseus.io/) room that owns world state, player state, and enemy AI.

## Project layout

- `/client` — Babylon.js renderer and input capture.
- `/server` — Colyseus room: authoritative movement, enemy AI, and combat.
- `/shared` — Babylon-free TypeScript used by both (movement physics, terrain generation, schema, protocol).

## Getting started

```bash
npm install
npm run dev
```

This starts both the client (Vite, default `http://localhost:5173`) and the server (Colyseus, `ws://localhost:2567`). Open the printed client URL in your browser, then click the canvas to lock the pointer and look around. Move with `W` `A` `S` `D`.

## Build

```bash
npm run build
```
