import { Command } from "https://deno.land/x/cliffy@v0.25.4/command/mod.ts";
import { join } from "https://deno.land/std@0.161.0/path/mod.ts";
import * as schema from "../schema.ts";

await new Command()
  .name("jerky")
  .version("0.1.0")
  .description("Schema-first GraphQL typescript code generator")
  .command("schema", "Generate the schema")
  .option("-s, --schema <schema:string>", "Schema or directory of schemas.")
  .option("-o, --out <destination:string>", "Path to write schema_gen.ts.")
  .option("--graphql <module:string>", "graphql module import specifier.")
  .action(async ({ schema: path = ".", out = "schema_gen.ts", graphql = "graphql" }) => {
    if (out === ".") {
      out = Deno.cwd();
    } else if (!out.startsWith("/")) {
      out = join(Deno.cwd(), out);
    }

    if (out.endsWith("/")) {
      out = join(out, "schema_gen.ts");
    }

    await Deno.writeTextFile(
      out,
      await schema.generate(await schema.parse(path), out, {
        graphqlModuleSpecifier: graphql,
      }),
    );

    // console.log(`schema -s ${schema} -o ${out}`);
  })
  // .command("resolver", "Generate the resolver")
  // .option("-d, --dir <dir:string>", "Directory of resolvers.")
  // .option("-o, --out <destination:string>", "Path to write resolver_gen.ts.")
  // .action(({ dir, out }) => {
  //   console.log(`resolver -d ${dir} -o ${out}`);
  // })
  .parse(Deno.args);
