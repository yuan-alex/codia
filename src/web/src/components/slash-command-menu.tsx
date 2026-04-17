import type { ReactNode } from "react";
import {
  Command,
  CommandGroup,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
} from "@/components/ui/popover";
import type { SlashCommand } from "@/lib/slash-commands";

interface SlashCommandMenuProps {
  children: ReactNode;
  commands: SlashCommand[];
  isOpen: boolean;
  onSelect: (cmd: SlashCommand) => void;
}

export function SlashCommandMenu({
  isOpen,
  commands,
  onSelect,
  children,
}: SlashCommandMenuProps) {
  const categories = [...new Set(commands.map((c) => c.category))];

  return (
    <Popover open={isOpen}>
      <PopoverAnchor asChild>{children}</PopoverAnchor>
      {commands.length > 0 && (
        <PopoverContent
          align="start"
          className="w-[--radix-popover-trigger-width] p-0"
          onCloseAutoFocus={(e) => e.preventDefault()}
          onOpenAutoFocus={(e) => e.preventDefault()}
          side="top"
          sideOffset={8}
        >
          <Command shouldFilter={false}>
            <CommandList>
              {categories.map((cat) => (
                <CommandGroup heading={cat} key={cat}>
                  {commands
                    .filter((cmd) => cmd.category === cat)
                    .map((cmd) => (
                      <CommandItem
                        className="flex items-center gap-2"
                        key={cmd.name}
                        onSelect={() => onSelect(cmd)}
                        value={cmd.name}
                      >
                        <cmd.icon className="size-4 text-muted-foreground" />
                        <span className="font-medium">/{cmd.name}</span>
                        {cmd.args && (
                          <span className="text-muted-foreground text-xs">
                            {cmd.args}
                          </span>
                        )}
                        <span className="ml-auto text-muted-foreground text-xs">
                          {cmd.description}
                        </span>
                      </CommandItem>
                    ))}
                </CommandGroup>
              ))}
            </CommandList>
          </Command>
        </PopoverContent>
      )}
    </Popover>
  );
}
