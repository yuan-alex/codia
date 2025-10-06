import { render } from "ink";
import { App } from "./components/App";

// Start the server in the background
const serverProcess = Bun.spawn(["bun", "run", "src/server/index.ts"], {
  cwd: process.cwd(),
  stdout: "ignore",
  stderr: "pipe",
});

// Wait a bit for the server to start
await Bun.sleep(500);

// Cleanup server on exit
process.on("exit", () => {
  serverProcess.kill();
});

process.on("SIGINT", () => {
  serverProcess.kill();
  process.exit(0);
});

// Check if raw mode is supported
if (process.stdin.isTTY) {
  render(<App />);
} else {
  console.error("Error: This CLI requires an interactive terminal (TTY).");
  console.error("Please run this command in a proper terminal environment.");
  process.exit(1);
}
