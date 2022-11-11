import { Command } from "https://deno.land/x/cliffy@v0.25.4/command/command.ts";
import { parse as parseScalars } from "../generate/scalars.ts";
import { parse as parseSchema } from "../generate/schema.ts";
import { parse as parseResolvers, parseTypeResolvers } from "../generate/resolvers.ts";
import { generate } from "../generate/generate.ts";

function normalizePath(path: string): URL {
  try {
    return new URL(path);
  } catch {
    // it's probably a path
  }

  if (path.startsWith("/")) {
    return new URL(`file://${path}`);
  }

  return new URL(path, `file://${Deno.cwd()}/`);
}

const {
  args: [schema = "."],
  options: {
    out = "schema_gen.ts",
    graphql = "graphql",
    scalars,
    resolvers,
    subscribers,
    fieldDirectives,
    inputDirectives,
  },
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
  .option("--input-directives <module:string>", "input directives module import specifier.")
  .parse(Deno.args);

const outfile = normalizePath(out);
if (!outfile.pathname.endsWith("/")) {
  // test if it's a directory
  try {
    const stat = await Deno.stat(outfile);
    if (stat.isDirectory) {
      outfile.pathname += "/";
    }
  } catch {
    // probably doesn't exist yet
  }
}

if (outfile.pathname.endsWith("/")) {
  outfile.pathname += "schema_gen.ts";
}

if (!outfile.pathname.endsWith(".ts")) {
  outfile.pathname += ".ts";
}

await Deno.writeTextFile(
  outfile,
  await generate(await parseSchema(normalizePath(schema)), outfile.pathname, {
    scalarsInfo: scalars ? await parseScalars(normalizePath(scalars)) : undefined,
    fieldDirectivesInfo: fieldDirectives ? await parseTypeResolvers("", normalizePath(fieldDirectives)) : undefined,
    inputDirectivesInfo: inputDirectives ? await parseTypeResolvers("", normalizePath(inputDirectives)) : undefined,
    resolversInfo: resolvers ? await parseResolvers(normalizePath(resolvers)) : undefined,
    subscribersInfo: subscribers ? await parseTypeResolvers("Subscription", normalizePath(subscribers)) : undefined,
    graphqlModuleSpecifier: graphql,
  }),
);
