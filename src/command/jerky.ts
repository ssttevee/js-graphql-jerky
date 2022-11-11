import { Command } from "https://deno.land/x/cliffy@v0.25.4/command/command.ts";
import { parse as parseScalars } from "../generate/scalars.ts";
import { parse as parseSchema } from "../generate/schema.ts";
import { parse as parseResolvers, parseTypeResolvers } from "../generate/resolvers.ts";
import { generate } from "../generate/generate.ts";

function normalizePath(path: string): URL {
  if (path.startsWith("file://")) {
    return new URL(path);
  }

  if (path.startsWith("/")) {
    return new URL(`file://${path}`);
  }

  return new URL(path, `file://${Deno.cwd()}/`);
}

const {
  args: [schema = "."],
  options: { out = "schema_gen.ts", graphql = "graphql", scalars, resolvers, subscribers, fieldDirectives },
} = await new Command()
  .name("jerky")
  .version("0.1.0")
  .description("Schema-first GraphQL typescript code generator")
  .arguments("[schema:string]")
  .option("-o, --out <destination:string>", "Path to write schema_gen.ts.")
  .option("--graphql <module:string>", "graphql module import specifier.")
  .option("--scalars <module:string>", "scalars module import specifier.")
  .option("--resolvers <directory:string>", "resolvers directory path.")
  .option("--subscribers <module:string>", "subscriber module import specifier.")
  .option("--field-directives <module:string>", "field directives module import specifier.")
  .parse(Deno.args);

const outfile = normalizePath(out);
if (outfile.pathname.endsWith("/")) {
  outfile.pathname += "schema_gen.ts";
}

await Deno.writeTextFile(
  out,
  await generate(await parseSchema(normalizePath(schema)), out, {
    scalarsInfo: scalars ? await parseScalars(normalizePath(scalars)) : undefined,
    fieldDirectivesInfo: fieldDirectives ? await parseTypeResolvers("", normalizePath(fieldDirectives)) : undefined,
    resolversInfo: resolvers ? await parseResolvers(normalizePath(resolvers)) : undefined,
    subscribersInfo: subscribers ? await parseTypeResolvers("Subscription", normalizePath(subscribers)) : undefined,
    graphqlModuleSpecifier: graphql,
  }),
);
