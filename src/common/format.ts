import { createStreaming, Formatter } from "https://deno.land/x/dprint@0.2.0/mod.ts";

let formatter: Promise<Formatter> | Formatter | undefined;

export async function format(text: string): Promise<string> {
  formatter = await (formatter || (formatter = createStreaming(
    fetch("https://plugins.dprint.dev/typescript-0.77.0.wasm"),
  )));

  return formatter.formatText("file.ts", text);
}
