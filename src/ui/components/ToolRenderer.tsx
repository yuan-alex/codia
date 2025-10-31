import type { DynamicToolPart, TypedToolPart } from "../types";
import { BashTool, getInputSummary as getBashSummary } from "./tools/BashTool";
import { CatTool, getInputSummary as getCatSummary } from "./tools/CatTool";
import { EditTool, getInputSummary as getEditSummary } from "./tools/EditTool";
import { GrepTool, getInputSummary as getGrepSummary } from "./tools/GrepTool";
import { LsTool, getInputSummary as getLsSummary } from "./tools/LsTool";
import {
  GenericTool,
  getInputSummary as getGenericSummary,
} from "./tools/GenericTool";

interface ToolRendererProps {
  toolPart: DynamicToolPart | TypedToolPart;
  toolName: string;
}

export function getToolInputSummary(toolName: string, input: any): string {
  switch (toolName) {
    case "bash":
    case "bashTool":
      return getBashSummary(input);
    case "cat":
    case "catTool":
      return getCatSummary(input);
    case "edit":
    case "editTool":
      return getEditSummary(input);
    case "grep":
    case "grepTool":
      return getGrepSummary(input);
    case "ls":
    case "lsTool":
      return getLsSummary(input);
    default:
      return getGenericSummary(input);
  }
}

export function ToolRenderer({ toolPart, toolName }: ToolRendererProps) {
  // Return null if there's no output to show yet
  if (toolPart.state !== "output-available" || toolPart.output === undefined) {
    return null;
  }

  // Route to the appropriate tool component based on toolName
  switch (toolName) {
    case "bash":
    case "bashTool":
      return <BashTool toolPart={toolPart} />;
    case "cat":
    case "catTool":
      return <CatTool toolPart={toolPart} />;
    case "edit":
    case "editTool":
      return <EditTool toolPart={toolPart} />;
    case "grep":
    case "grepTool":
      return <GrepTool toolPart={toolPart} />;
    case "ls":
    case "lsTool":
      return <LsTool toolPart={toolPart} />;
    default:
      return <GenericTool toolPart={toolPart} />;
  }
}
