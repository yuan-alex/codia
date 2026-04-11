import { useState, useEffect, useRef, useCallback } from "react";
import { Bug, X, Minus, Trash2, ArrowDown, ArrowUp } from "lucide-react";

type AcpLogEntry = {
  ts: number;
  dir: "client→agent" | "agent→client";
  msg: Record<string, unknown>;
};

function extractInfo(entry: AcpLogEntry) {
  const { msg, dir } = entry;
  const method = (msg.method as string) ?? null;
  const id = msg.id as string | number | undefined;
  const isResponse = "result" in msg || "error" in msg;
  const isError = "error" in msg;

  let label: string;
  if (method) {
    label = method;
  } else if (isError) {
    label = `error #${id}`;
  } else {
    label = `response #${id}`;
  }

  return { method, id, isResponse, isError, label, dir };
}

function EntryRow({
  entry,
  isSelected,
  onClick,
}: {
  entry: AcpLogEntry;
  isSelected: boolean;
  onClick: () => void;
}) {
  const info = extractInfo(entry);
  const time = new Date(entry.ts).toLocaleTimeString("en-US", {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 w-full px-2 py-1 text-left text-[11px] font-mono border-b border-white/5 hover:bg-white/5 transition-colors ${
        isSelected ? "bg-white/10" : ""
      }`}
    >
      <span className="shrink-0 text-[10px] text-gray-500">{time}</span>
      {info.dir === "client→agent" ? (
        <ArrowUp className="size-3 shrink-0 text-blue-400" />
      ) : (
        <ArrowDown className="size-3 shrink-0 text-green-400" />
      )}
      <span
        className={`truncate ${
          info.isError
            ? "text-red-400"
            : info.isResponse
              ? "text-gray-400"
              : info.dir === "client→agent"
                ? "text-blue-300"
                : "text-green-300"
        }`}
      >
        {info.label}
      </span>
    </button>
  );
}

export function AcpInspector() {
  const [open, setOpen] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const [log, setLog] = useState<AcpLogEntry[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [filter, setFilter] = useState("");
  const wsRef = useRef<WebSocket | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const autoScrollRef = useRef(true);

  const connect = useCallback(() => {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const ws = new WebSocket(`${protocol}//${window.location.host}/ws/debug`);
    wsRef.current = ws;

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.type === "acp_debug_init") {
        setLog(data.log ?? []);
      } else if (data.type === "acp_debug") {
        setLog((prev) => {
          const next = [...prev, data.entry];
          if (next.length > 500) next.shift();
          return next;
        });
      }
    };

    ws.onclose = () => {
      // Reconnect after a delay
      setTimeout(() => {
        if (wsRef.current === ws) connect();
      }, 2000);
    };

    return ws;
  }, []);

  useEffect(() => {
    if (!open) return;
    const ws = connect();
    return () => {
      wsRef.current = null;
      ws.close();
    };
  }, [open, connect]);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (autoScrollRef.current && listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [log.length]);

  const filteredLog = filter
    ? log.filter((entry) => {
        const info = extractInfo(entry);
        return info.label.toLowerCase().includes(filter.toLowerCase());
      })
    : log;

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-4 left-4 z-50 flex items-center gap-1.5 rounded-full bg-yellow-500 px-3 py-1.5 text-xs font-medium text-black shadow-lg hover:bg-yellow-400 transition-colors"
      >
        <Bug className="size-3.5" />
        ACP Inspector
      </button>
    );
  }

  if (minimized) {
    return (
      <div className="fixed bottom-4 left-4 z-50 flex items-center gap-1 rounded-lg border border-yellow-500/30 bg-black/90 px-2 py-1 shadow-lg backdrop-blur">
        <span className="text-[10px] font-medium text-yellow-500">ACP</span>
        <span className="text-[10px] text-gray-400">{log.length}</span>
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

  const selectedEntry = selected !== null ? filteredLog[selected] : null;

  return (
    <div className="fixed bottom-4 left-4 z-50 w-[700px] max-h-[600px] flex flex-col rounded-lg border border-yellow-500/30 bg-black/95 shadow-lg backdrop-blur overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-yellow-500/20">
        <span className="text-xs font-semibold text-yellow-500 flex items-center gap-1.5">
          <Bug className="size-3.5" />
          ACP Inspector
          <span className="text-[10px] font-normal text-gray-400">
            {filteredLog.length} messages
          </span>
        </span>
        <div className="flex gap-1">
          <button
            onClick={() => {
              setLog([]);
              setSelected(null);
            }}
            className="p-0.5 text-yellow-500/70 hover:text-yellow-500"
            title="Clear log"
          >
            <Trash2 className="size-3.5" />
          </button>
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

      {/* Filter */}
      <div className="px-2 py-1.5 border-b border-white/5">
        <input
          type="text"
          value={filter}
          onChange={(e) => {
            setFilter(e.target.value);
            setSelected(null);
          }}
          placeholder="Filter by method..."
          className="w-full bg-transparent text-[11px] text-gray-300 placeholder-gray-600 outline-none font-mono"
        />
      </div>

      {/* Split pane */}
      <div className="flex flex-1 min-h-0" style={{ height: 400 }}>
        {/* Message list */}
        <div
          ref={listRef}
          className="w-[280px] shrink-0 overflow-y-auto border-r border-white/5"
          onScroll={(e) => {
            const el = e.currentTarget;
            autoScrollRef.current =
              el.scrollTop + el.clientHeight >= el.scrollHeight - 20;
          }}
        >
          {filteredLog.map((entry, i) => (
            <EntryRow
              key={`${entry.ts}-${i}`}
              entry={entry}
              isSelected={selected === i}
              onClick={() => setSelected(i)}
            />
          ))}
          {filteredLog.length === 0 && (
            <div className="p-4 text-center text-[11px] text-gray-500">
              {log.length === 0
                ? "Waiting for ACP messages..."
                : "No messages match filter"}
            </div>
          )}
        </div>

        {/* Detail pane */}
        <div className="flex-1 min-w-0 overflow-y-auto p-3">
          {selectedEntry ? (
            <pre className="text-[11px] text-gray-300 font-mono whitespace-pre-wrap break-all leading-relaxed">
              {JSON.stringify(selectedEntry.msg, null, 2)}
            </pre>
          ) : (
            <div className="flex h-full items-center justify-center text-[11px] text-gray-500">
              Select a message to inspect
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
