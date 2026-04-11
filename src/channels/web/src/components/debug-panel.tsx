import { useState } from "react";
import { Bug, X, Minus } from "lucide-react";

export function DebugPanel({ data }: { data: Record<string, unknown> }) {
  const [open, setOpen] = useState(false);
  const [minimized, setMinimized] = useState(false);

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-4 right-4 z-50 flex items-center gap-1.5 rounded-full bg-yellow-500 px-3 py-1.5 text-xs font-medium text-black shadow-lg hover:bg-yellow-400 transition-colors"
      >
        <Bug className="size-3.5" />
        Debug
      </button>
    );
  }

  if (minimized) {
    return (
      <div className="fixed bottom-4 right-4 z-50 flex items-center gap-1 rounded-lg border border-yellow-500/30 bg-black/90 px-2 py-1 shadow-lg backdrop-blur">
        <span className="text-[10px] font-medium text-yellow-500">DEBUG</span>
        <button
          onClick={() => setMinimized(false)}
          className="p-0.5 text-yellow-500/70 hover:text-yellow-500"
        >
          <Bug className="size-3" />
        </button>
        <button
          onClick={() => setOpen(false)}
          className="p-0.5 text-yellow-500/70 hover:text-yellow-500"
        >
          <X className="size-3" />
        </button>
      </div>
    );
  }

  return (
    <div className="fixed bottom-4 right-4 z-50 w-[480px] max-h-[600px] flex flex-col rounded-lg border border-yellow-500/30 bg-black/90 shadow-lg backdrop-blur overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 border-b border-yellow-500/20">
        <span className="text-xs font-semibold text-yellow-500 flex items-center gap-1.5">
          <Bug className="size-3.5" />
          Debug
        </span>
        <div className="flex gap-1">
          <button
            onClick={() => setMinimized(true)}
            className="p-0.5 text-yellow-500/70 hover:text-yellow-500"
          >
            <Minus className="size-3.5" />
          </button>
          <button
            onClick={() => setOpen(false)}
            className="p-0.5 text-yellow-500/70 hover:text-yellow-500"
          >
            <X className="size-3.5" />
          </button>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {Object.entries(data).map(([key, value]) => (
          <div key={key}>
            <div className="text-[10px] font-medium text-yellow-500/70 uppercase tracking-wider mb-0.5">
              {key}
            </div>
            <pre className="text-[11px] text-gray-300 font-mono whitespace-pre-wrap break-all leading-relaxed">
              {typeof value === "string"
                ? value
                : JSON.stringify(value, null, 2)}
            </pre>
          </div>
        ))}
      </div>
    </div>
  );
}
