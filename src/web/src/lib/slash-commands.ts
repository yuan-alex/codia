import { CpuIcon, HelpCircleIcon, type LucideIcon } from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────

export type CommandContext = {
  changeModel: (modelId: string) => void;
  setInput: (text: string) => void;
  addInfoMessage: (text: string) => void;
  models: { modelId: string; name: string }[];
};

export type SlashCommandAction =
  | { type: "client"; execute: (args: string, ctx: CommandContext) => void }
  | { type: "transform"; transform: (args: string) => string };

export type SlashCommand = {
  name: string;
  description: string;
  icon: LucideIcon;
  category: string;
  args?: string;
  action: SlashCommandAction;
};

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
        if (!query) return;
        const match = ctx.models.find(
          (m) =>
            m.modelId.toLowerCase().includes(query) ||
            m.name.toLowerCase().includes(query),
        );
        if (match) ctx.changeModel(match.modelId);
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
            `\`/${cmd.name}${cmd.args ? " " + cmd.args : ""}\` — ${cmd.description}`,
        );
        ctx.addInfoMessage("**Available commands:**\n\n" + lines.join("\n"));
      },
    },
  },
];
