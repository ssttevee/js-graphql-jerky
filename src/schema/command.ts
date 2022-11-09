import { Command } from "https://deno.land/x/cliffy@v0.25.4/command/command.ts";
import { parse as parseSchema } from "./schema.ts";
import { generate } from "./generate.ts";

function normalizePath(path: string): URL {
  if (path.startsWith("file://")) {
    return new URL(path);
  }

  if (path.startsWith("/")) {
    return new URL(`file://${path}`);
  }

  return new URL(path, `file://${Deno.cwd()}/`);
}

export default new Command()
  .description("Statically render the schema")
  .arguments("[schema:string]")
  .option("-o, --out <destination:string>", "Path to write schema_gen.ts.")
  .option("--graphql <module:string>", "graphql module import specifier.")
  .action(async ({ out = "schema_gen.ts", graphql = "graphql" }, schema = ".") => {
    const outfile = normalizePath(out);
    if (outfile.pathname.endsWith("/")) {
      outfile.pathname += "schema_gen.ts";
    }

    await Deno.writeTextFile(
      out,
      await generate(await parseSchema(normalizePath(schema)), out, {
        graphqlModuleSpecifier: graphql,
      }),
    );

    // console.log(`schema -s ${schema} -o ${out}`);
  });
