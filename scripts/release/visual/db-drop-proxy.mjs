// A TCP proxy in front of the LOCAL Postgres, so a dropped database connection can be switched on and off while a
// local build runs through it (error screens, retry flows). Never point it at Neon or production.
//   node scripts/release/visual/db-drop-proxy.mjs          listens on 54330 -> localhost:54329
//   control: curl "http://127.0.0.1:54331/mode?m=pass|reset|delay&ms=3000"
// reset: every open connection is destroyed and new ones are cut at once (pg sees "Server has closed the connection").
// delay: new connections wait ms before reaching Postgres (to catch a "reloading" state on screen).
// Start the app with DATABASE_URL (and DATABASE_URL_LOCAL) set to the local URL with port 54330.
import net from "node:net";
import http from "node:http";

const LISTEN = Number(process.env.PROXY_PORT ?? 54330);
const TARGET = Number(process.env.PG_PORT ?? 54329);
const CONTROL = Number(process.env.CONTROL_PORT ?? 54331);
let mode = "pass";
let delayMs = 0;
const open = new Set();

net
  .createServer((client) => {
    if (mode === "reset") return client.resetAndDestroy();
    const go = () => {
      const up = net.connect(TARGET, "127.0.0.1");
      const pair = { client, up };
      open.add(pair);
      const done = () => {
        open.delete(pair);
        client.destroy();
        up.destroy();
      };
      client.on("error", done).on("close", done);
      up.on("error", done).on("close", done);
      client.pipe(up);
      up.pipe(client);
    };
    if (mode === "delay") {
      client.pause();
      setTimeout(() => {
        client.resume();
        go();
      }, delayMs);
    } else go();
  })
  .listen(LISTEN, "127.0.0.1");

http
  .createServer((req, res) => {
    const u = new URL(req.url, "http://x");
    mode = u.searchParams.get("m") ?? mode;
    delayMs = Number(u.searchParams.get("ms") ?? 0);
    if (mode === "reset") {
      for (const { client, up } of open) (client.resetAndDestroy(), up.destroy());
      open.clear();
    }
    console.log(new Date().toISOString(), "mode", mode, delayMs || "");
    res.end(mode);
  })
  .listen(CONTROL, "127.0.0.1");
console.log(`proxy ${LISTEN} -> ${TARGET}, control ${CONTROL}`);
