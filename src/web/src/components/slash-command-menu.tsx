import type { ReactNode } from "react";
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
} from "@/components/ui/popover";
import {
  Command,
  CommandList,
  CommandGroup,
  CommandItem,
} from "@/components/ui/command";
import type { SlashCommand } from "@/lib/slash-commands";

type SlashCommandMenuProps = {
  isOpen: boolean;
  commands: SlashCommand[];
  onSelect: (cmd: SlashCommand) => void;
  children: ReactNode;
};

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
          side="top"
          align="start"
          sideOffset={8}
          className="w-[--radix-popover-trigger-width] p-0"
          onOpenAutoFocus={(e) => e.preventDefault()}
          onCloseAutoFocus={(e) => e.preventDefault()}
        >
          <Command shouldFilter={false}>
            <CommandList>
              {categories.map((cat) => (
                <CommandGroup heading={cat} key={cat}>
                  {commands
                    .filter((cmd) => cmd.category === cat)
                    .map((cmd) => (
                      <CommandItem
                        key={cmd.name}
                        value={cmd.name}
                        onSelect={() => onSelect(cmd)}
                        className="flex items-center gap-2"
                      >
                        <cmd.icon className="size-4 text-muted-foreground" />
                        <span className="font-medium">/{cmd.name}</span>
                        {cmd.args && (
                          <span className="text-muted-foreground text-xs">
                            {cmd.args}
                          </span>
                        )}
                        <span className="ml-auto text-xs text-muted-foreground">
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
