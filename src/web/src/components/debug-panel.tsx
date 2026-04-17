import { Bug, Minus, X } from "lucide-react";
import { useMemo, useState } from "react";
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
    [data]
  );

  return (
    <div className="space-y-2">
      {Object.entries(summaryEntries).map(([key, value]) => (
        <div key={key}>
          <div className="mb-0.5 font-medium text-[10px] text-yellow-500/70 uppercase tracking-wider">
            {key}
          </div>
          <pre className="whitespace-pre-wrap break-all font-mono text-[11px] text-gray-300 leading-relaxed">
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
    if (!filter) {
      return items;
    }
    const lower = filter.toLowerCase();
    return items.filter((item) => {
      const json = JSON.stringify(item).toLowerCase();
      return json.includes(lower);
    });
  }, [items, filter]);

  return (
    <div className="space-y-2">
      <input
        className="w-full rounded border border-yellow-500/20 bg-gray-900 px-2 py-1 font-mono text-[11px] text-gray-300 placeholder:text-gray-600 focus:border-yellow-500/40 focus:outline-none"
        onChange={(e) => setFilter(e.target.value)}
        placeholder={`Filter ${label}...`}
        type="text"
        value={filter}
      />
      <div className="text-[10px] text-gray-500">
        {filtered.length} / {items.length} {label}
      </div>
      <pre className="whitespace-pre-wrap break-all font-mono text-[11px] text-gray-300 leading-relaxed">
        {JSON.stringify(filtered, null, 2)}
      </pre>
    </div>
  );
}

function debugTabContent(tab: Tab, data: ChatDebugInfo) {
  if (tab === "summary") {
    return <SummaryTab data={data} />;
  }
  if (tab === "claude") {
    return (
      <FilterableJsonTab items={data.debugEvents} label="stream-json events" />
    );
  }
  if (tab === "state") {
    return <FilterableJsonTab items={data.messages} label="messages" />;
  }
  return <FilterableJsonTab items={data.rawMessages} label="ws messages" />;
}

export function DebugPanel({ data }: { data: ChatDebugInfo }) {
  const [open, setOpen] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const [tab, setTab] = useState<Tab>("claude");

  if (!open) {
    return (
      <button
        className="fixed right-4 bottom-4 z-50 flex items-center gap-1.5 rounded-full bg-yellow-500 px-3 py-1.5 font-medium text-black text-xs shadow-lg transition-colors hover:bg-yellow-400"
        onClick={() => setOpen(true)}
        type="button"
      >
        <Bug className="size-3.5" />
        Debug
      </button>
    );
  }

  if (minimized) {
    return (
      <div className="fixed right-4 bottom-4 z-50 flex items-center gap-1 rounded-lg border border-yellow-500/30 bg-black/90 px-2 py-1 shadow-lg backdrop-blur">
        <span className="font-medium text-[10px] text-yellow-500">DEBUG</span>
        <button
          className="p-0.5 text-yellow-500/70 hover:text-yellow-500"
          onClick={() => setMinimized(false)}
          type="button"
        >
          <Bug className="size-3" />
        </button>
        <button
          className="p-0.5 text-yellow-500/70 hover:text-yellow-500"
          onClick={() => setOpen(false)}
          type="button"
        >
          <X className="size-3" />
        </button>
      </div>
    );
  }

  return (
    <div className="fixed right-4 bottom-4 z-50 flex max-h-[70vh] w-[560px] flex-col overflow-hidden rounded-lg border border-yellow-500/30 bg-black/95 shadow-lg backdrop-blur">
      {/* Header */}
      <div className="flex items-center justify-between border-yellow-500/20 border-b px-3 py-2">
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1.5 font-semibold text-xs text-yellow-500">
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
                className={`rounded px-2 py-0.5 font-medium text-[10px] transition-colors ${
                  tab === t
                    ? "bg-yellow-500/20 text-yellow-500"
                    : "text-gray-500 hover:text-gray-300"
                }`}
                key={t}
                onClick={() => setTab(t)}
                type="button"
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className="flex gap-1">
          <button
            className="p-0.5 text-yellow-500/70 hover:text-yellow-500"
            onClick={() => setMinimized(true)}
            type="button"
          >
            <Minus className="size-3.5" />
          </button>
          <button
            className="p-0.5 text-yellow-500/70 hover:text-yellow-500"
            onClick={() => setOpen(false)}
            type="button"
          >
            <X className="size-3.5" />
          </button>
        </div>
      </div>
      {/* Content */}
      <div className="flex-1 overflow-y-auto p-3">
        {debugTabContent(tab, data)}
      </div>
    </div>
  );
}
