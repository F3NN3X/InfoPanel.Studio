import { spawn } from "node:child_process";
import { serverCommand } from "../../tools/perf/server-command.mjs";

// Shared by the HTTP suite: start ips-server on a port the OS picks (PORT=0, read back from its start line) and stop it
// by waiting for the process to exit, so a data folder is never removed under a server that still holds it.

const START_LINE = /InfoPanel Studio on http:\/\/[^:]+:(\d+)/;
const START_TIMEOUT_MS = 15_000;
/** Ports at or above 1024 that fetch refuses to connect to (the Fetch standard's bad ports, as in proxy.rs). An OS-picked port can land on one. */
const BAD_PORTS = new Set([1719, 1720, 1723, 2049, 3659, 4045, 4190, 5060, 5061, 6000, 6566, 6665, 6666, 6667, 6668, 6669, 6679, 6697, 10080]);

/** Listens on a port the OS picks that fetch accepts; resolves with the bound port. */
export async function listenOnGoodPort(httpServer) {
  for (;;) {
    await new Promise((ok) => httpServer.listen(0, "127.0.0.1", ok));
    const { port } = httpServer.address();
    if (!BAD_PORTS.has(port)) return port;
    await new Promise((ok) => httpServer.close(ok));
  }
}

function launch(env) {
  const server = serverCommand();
  const child = spawn(server.cmd, server.args, { env: { ...process.env, ...env, PORT: "0", HOST: "127.0.0.1" }, windowsHide: true });
  let out = "";
  const exited = new Promise((done) => (child.exitCode !== null ? done() : child.once("exit", done)));
  child.stdout.on("data", (c) => (out += c));
  child.stderr.on("data", (c) => (out += c));
  const stop = () => {
    child.kill();
    return exited;
  };
  const started = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`the server did not start in ${START_TIMEOUT_MS} ms:\n${out}`)), START_TIMEOUT_MS);
    const check = () => {
      const port = Number(START_LINE.exec(out)?.[1]);
      if (!port) return;
      clearTimeout(timer);
      resolve(port);
    };
    child.stdout.on("data", check);
    child.stderr.on("data", check);
    exited.then(() => {
      clearTimeout(timer);
      reject(new Error(`the server exited before it started:\n${out}`));
    });
  });
  return { stop, started, output: () => out };
}

/** Starts the server with `env`; resolves with `{ port, base, output, stop }`. `stop()` resolves once the process has exited. */
export async function startServer(env) {
  for (;;) {
    const run = launch(env);
    let port;
    try {
      port = await run.started;
    } catch (err) {
      await run.stop();
      throw err;
    }
    if (!BAD_PORTS.has(port)) return { port, base: `http://127.0.0.1:${port}`, output: run.output, stop: run.stop };
    await run.stop();
  }
}
