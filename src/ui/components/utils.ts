// Helper function to format tool input/output for display
export function formatToolData(data: unknown): string {
  if (typeof data === "string") {
    return data;
  }
  if (data === null || data === undefined) {
    return String(data);
  }
  try {
    return JSON.stringify(data, null, 2);
  } catch {
    return String(data);
  }
}

// Helper function to truncate text by character count for standardization
export function truncateText(
  text: string,
  maxLength = 300,
): { text: string; truncated: boolean } {
  if (text.length <= maxLength) {
    return { text, truncated: false };
  }
  return {
    text: text.slice(0, maxLength) + "...",
    truncated: true,
  };
}

// Helper function to get a short display string for tool state
export function getStateDisplay(state: string | undefined): string {
  if (!state) return "";
  switch (state) {
    case "input-streaming":
      return "streaming...";
    case "input-available":
      return "running...";
    case "output-available":
      return "✅";
    default:
      return state.replace("-", " ");
  }
}
