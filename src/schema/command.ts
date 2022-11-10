import { Command } from "https://deno.land/x/cliffy@v0.25.4/command/command.ts";
import { parse as parseScalars } from "./scalars.ts";
import { parse as parseSchema } from "./schema.ts";
import { parse as parseResolvers, parseTypeResolvers } from "./resolvers.ts";
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
  .option("--scalars <module:string>", "scalars module import specifier.")
  .option("--resolvers <directory:string>", "resolvers directory path.")
  .option("--subscribers <module:string>", "subscriber module import specifier.")
  .action(async ({ out = "schema_gen.ts", graphql = "graphql", scalars, resolvers, subscribers }, schema = ".") => {
    const outfile = normalizePath(out);
    if (outfile.pathname.endsWith("/")) {
      outfile.pathname += "schema_gen.ts";
    }

    await Deno.writeTextFile(
      out,
      await generate(await parseSchema(normalizePath(schema)), out, {
        scalarsInfo: scalars ? await parseScalars(normalizePath(scalars)) : undefined,
        resolversInfo: resolvers ? await parseResolvers(normalizePath(resolvers)) : undefined,
        subscribersInfo: subscribers ? await parseTypeResolvers("Subscription", normalizePath(subscribers)) : undefined,
        graphqlModuleSpecifier: graphql,
      }),
    );

    // console.log(`schema -s ${schema} -o ${out}`);
  });
