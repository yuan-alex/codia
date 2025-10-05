import { Text, useInput } from "ink";
import type { TextInputProps } from "../types";

export function TextInput({
  value,
  onChange,
  onSubmit,
  placeholder,
}: TextInputProps) {
  useInput((input, key) => {
    if (key.return) {
      onSubmit(value);
    } else if (key.backspace || key.delete) {
      onChange(value.slice(0, -1));
    } else if (input && !key.ctrl && !key.meta) {
      onChange(value + input);
    }
  });

  return (
    <Text>
      {value || <Text color="gray">{placeholder}</Text>}
      <Text color="cyan">_</Text>
    </Text>
  );
}
