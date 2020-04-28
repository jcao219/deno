import { open, openSync } from "./files.ts";
import { readAllSync } from "./buffer.ts";

export function readTextFileSync(path: string): string {
  const decoder = new TextDecoder();
  const file = openSync(path);
  const content = readAllSync(file);
  file.close();
  return decoder.decode(content);
}

export async function readTextFile(path: string): Promise<string> {
  const decoder = new TextDecoder();
  const file = await open(path);
  const content = readAllSync(file);
  file.close();
  return decoder.decode(content);
}