import { useState, useMemo } from "react";
import { Bug, X, Minus } from "lucide-react";
import type { ChatDebugInfo } from "./chat-inner";

type Tab = "summary" | "state" | "raw" | "claude";

function SummaryTab({ data }: { data: ChatDebugInfo }) {
  const summaryEntries = useMemo(
    () => ({
      status: data.status,
      sessionId: data.sessionId,
      error: data.error,
      messageCount: data.messageCount,
      selectedModel: data.selectedModel,
      lastMessageRole: data.lastMessageRole ?? "none",
      models: data.models,
    }),
    [data],
  );

  return (
    <div className="space-y-2">
      {Object.entries(summaryEntries).map(([key, value]) => (
        <div key={key}>
          <div className="text-[10px] font-medium text-yellow-500/70 uppercase tracking-wider mb-0.5">
            {key}
          </div>
          <pre className="text-[11px] text-gray-300 font-mono whitespace-pre-wrap break-all leading-relaxed">
            {typeof value === "string" ? value : JSON.stringify(value, null, 2)}
          </pre>
        </div>
      ))}
    </div>
  );
}

function FilterableJsonTab({
  items,
  label,
}: {
  items: unknown[];
  label: string;
}) {
  const [filter, setFilter] = useState("");

  const filtered = useMemo(() => {
    if (!filter) return items;
    const lower = filter.toLowerCase();
    return items.filter((item) => {
      const json = JSON.stringify(item).toLowerCase();
      return json.includes(lower);
    });
  }, [items, filter]);

  return (
    <div className="space-y-2">
      <input
        type="text"
        placeholder={`Filter ${label}...`}
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        className="w-full rounded border border-yellow-500/20 bg-gray-900 px-2 py-1 text-[11px] text-gray-300 font-mono placeholder:text-gray-600 focus:border-yellow-500/40 focus:outline-none"
      />
      <div className="text-[10px] text-gray-500">
        {filtered.length} / {items.length} {label}
      </div>
      <pre className="text-[11px] text-gray-300 font-mono whitespace-pre-wrap break-all leading-relaxed">
        {JSON.stringify(filtered, null, 2)}
      </pre>
    </div>
  );
}

export function DebugPanel({ data }: { data: ChatDebugInfo }) {
  const [open, setOpen] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const [tab, setTab] = useState<Tab>("claude");

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
    <div className="fixed bottom-4 right-4 z-50 w-[560px] max-h-[70vh] flex flex-col rounded-lg border border-yellow-500/30 bg-black/95 shadow-lg backdrop-blur overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-yellow-500/20">
        <div className="flex items-center gap-3">
          <span className="text-xs font-semibold text-yellow-500 flex items-center gap-1.5">
            <Bug className="size-3.5" />
            Debug
          </span>
          {/* Tabs */}
          <div className="flex gap-0.5 rounded-md bg-gray-900 p-0.5">
            {(
              [
                ["summary", "Summary"],
                ["claude", "Claude Code"],
                ["state", "Parsed"],
                ["raw", "Raw WS"],
              ] as const
            ).map(([t, label]) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`px-2 py-0.5 text-[10px] font-medium rounded transition-colors ${
                  tab === t
                    ? "bg-yellow-500/20 text-yellow-500"
                    : "text-gray-500 hover:text-gray-300"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
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
      {/* Content */}
      <div className="flex-1 overflow-y-auto p-3">
        {tab === "summary" ? (
          <SummaryTab data={data} />
        ) : tab === "claude" ? (
          <FilterableJsonTab
            items={data.debugEvents}
            label="stream-json events"
          />
        ) : tab === "state" ? (
          <FilterableJsonTab items={data.messages} label="messages" />
        ) : (
          <FilterableJsonTab items={data.rawMessages} label="ws messages" />
        )}
      </div>
    </div>
  );
}
