import { jpnToLatn } from "./lib/convert.ts";

const readInput = async (): Promise<string> => {
  if (Deno.args.length > 0) {
    return Deno.args.join(" ");
  }

  if (Deno.stdin.isTerminal()) {
    return "";
  }

  const data = await new Response(Deno.stdin.readable).text();
  return data.trimEnd();
};

const main = async (): Promise<void> => {
  const input = await readInput();
  if (!input) {
    console.error("Usage: deno run --allow-read index.ts <jpn-text>");
    Deno.exitCode = 1;
    return;
  }

  const output = await jpnToLatn(input);
  console.log(output);
};

if (import.meta.main) {
  try {
    await main();
  } catch (error) {
    console.error(
      error instanceof Error ? (error.stack ?? error.message) : String(error),
    );
    Deno.exitCode = 1;
  }
}
