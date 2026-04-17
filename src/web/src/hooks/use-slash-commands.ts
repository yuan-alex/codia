import { useMemo, useCallback, useRef } from "react";
import {
  slashCommands,
  type SlashCommand,
  type CommandContext,
} from "@/lib/slash-commands";

export type UseSlashCommandsReturn = {
  /** Whether the command menu should be visible */
  isOpen: boolean;
  /** The search query (text after `/`) */
  query: string;
  /** Filtered commands based on query */
  commands: SlashCommand[];
  /** Keyboard handler — attach to the textarea's onKeyDown */
  handleKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  /** Called when a command is selected from the menu (click or Enter) */
  selectCommand: (cmd: SlashCommand) => void;
  /** Execute a slash command typed directly (on form submit) */
  executeFromInput: (text: string) => boolean;
};

export function useSlashCommands(
  input: string,
  ctx: CommandContext,
): UseSlashCommandsReturn {
  const ctxRef = useRef(ctx);
  ctxRef.current = ctx;

  // Track which item is highlighted via arrow keys
  const highlightRef = useRef(0);

  // Determine menu state from input
  const trimmed = input.trimStart();
  const startsWithSlash = trimmed.startsWith("/");
  const hasSpace = startsWithSlash && trimmed.includes(" ");
  const isOpen = startsWithSlash && !hasSpace && trimmed.length > 0;
  const query = isOpen ? trimmed.slice(1) : "";

  const filteredCommands = useMemo(() => {
    if (!query) return slashCommands;
    const q = query.toLowerCase();
    return slashCommands.filter(
      (cmd) =>
        cmd.name.toLowerCase().includes(q) ||
        cmd.description.toLowerCase().includes(q),
    );
  }, [query]);

  // Reset highlight when filtered list changes
  const prevFilteredLen = useRef(filteredCommands.length);
  if (prevFilteredLen.current !== filteredCommands.length) {
    highlightRef.current = 0;
    prevFilteredLen.current = filteredCommands.length;
  }

  const selectCommand = useCallback((cmd: SlashCommand) => {
    const c = ctxRef.current;
    if (cmd.action.type === "client") {
      if (cmd.args) {
        c.setInput(`/${cmd.name} `);
      } else {
        cmd.action.execute("", c);
        c.setInput("");
      }
    } else if (cmd.action.type === "transform") {
      c.setInput(`/${cmd.name} `);
    }
  }, []);

  // We store filteredCommands in a ref so handleKeyDown can access the current list
  const filteredRef = useRef(filteredCommands);
  filteredRef.current = filteredCommands;

  const selectCommandRef = useRef(selectCommand);
  selectCommandRef.current = selectCommand;

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      const t = e.currentTarget.value.trimStart();
      const menuOpen = t.startsWith("/") && !t.includes(" ") && t.length > 0;
      if (!menuOpen) return;

      if (e.key === "Escape") {
        e.preventDefault();
        ctxRef.current.setInput("");
        return;
      }

      if (e.key === "ArrowUp") {
        e.preventDefault();
        highlightRef.current = Math.max(0, highlightRef.current - 1);
        return;
      }

      if (e.key === "ArrowDown") {
        e.preventDefault();
        highlightRef.current = Math.min(
          filteredRef.current.length - 1,
          highlightRef.current + 1,
        );
        return;
      }

      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        const cmds = filteredRef.current;
        if (cmds.length > 0) {
          const idx = Math.min(highlightRef.current, cmds.length - 1);
          selectCommandRef.current(cmds[idx]);
        }
        return;
      }
    },
    [],
  );

  const executeFromInput = useCallback((text: string): boolean => {
    const t = text.trimStart();
    if (!t.startsWith("/")) return false;

    const withoutSlash = t.slice(1);
    const spaceIdx = withoutSlash.indexOf(" ");
    const cmdName =
      spaceIdx >= 0 ? withoutSlash.slice(0, spaceIdx) : withoutSlash;
    const args = spaceIdx >= 0 ? withoutSlash.slice(spaceIdx + 1).trim() : "";

    const cmd = slashCommands.find(
      (c) => c.name.toLowerCase() === cmdName.toLowerCase(),
    );
    if (!cmd) return false;

    const c = ctxRef.current;
    if (cmd.action.type === "client") {
      cmd.action.execute(args, c);
    } else if (cmd.action.type === "transform") {
      return false;
    }
    c.setInput("");
    return true;
  }, []);

  return {
    isOpen,
    query,
    commands: filteredCommands,
    handleKeyDown,
    selectCommand,
    executeFromInput,
  };
}
