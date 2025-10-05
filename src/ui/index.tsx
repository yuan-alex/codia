import { render } from "ink";
import { App } from "./components/App";

// Check if raw mode is supported
if (process.stdin.isTTY) {
  render(<App />);
} else {
  console.error("Error: This CLI requires an interactive terminal (TTY).");
  console.error("Please run this command in a proper terminal environment.");
  process.exit(1);
}
