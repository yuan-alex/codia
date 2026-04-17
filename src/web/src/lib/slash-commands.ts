import { CpuIcon, HelpCircleIcon, type LucideIcon } from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────

export interface CommandContext {
  addInfoMessage: (text: string) => void;
  changeModel: (modelId: string) => void;
  models: { modelId: string; name: string }[];
  setInput: (text: string) => void;
}

export type SlashCommandAction =
  | { type: "client"; execute: (args: string, ctx: CommandContext) => void }
  | { type: "transform"; transform: (args: string) => string };

export interface SlashCommand {
  action: SlashCommandAction;
  args?: string;
  category: string;
  description: string;
  icon: LucideIcon;
  name: string;
}

// ── Registry ───────────────────────────────────────────────────────

export const slashCommands: SlashCommand[] = [
  {
    name: "model",
    description: "Switch the active model",
    icon: CpuIcon,
    category: "Chat",
    args: "<model-name>",
    action: {
      type: "client",
      execute: (args, ctx) => {
        const query = args.trim().toLowerCase();
        if (!query) {
          return;
        }
        const match = ctx.models.find(
          (m) =>
            m.modelId.toLowerCase().includes(query) ||
            m.name.toLowerCase().includes(query)
        );
        if (match) {
          ctx.changeModel(match.modelId);
        }
      },
    },
  },
  {
    name: "help",
    description: "List available slash commands",
    icon: HelpCircleIcon,
    category: "Chat",
    action: {
      type: "client",
      execute: (_args, ctx) => {
        const lines = slashCommands.map(
          (cmd) =>
            `\`/${cmd.name}${cmd.args ? ` ${cmd.args}` : ""}\` — ${cmd.description}`
        );
        ctx.addInfoMessage(`**Available commands:**\n\n${lines.join("\n")}`);
      },
    },
  },
];
