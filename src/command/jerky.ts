import { Command } from "https://deno.land/x/cliffy@v0.25.4/command/command.ts";
import schema from "../schema/command.ts";

await new Command()
  .name("jerky")
  .version("0.1.0")
  .description("Schema-first GraphQL typescript code generator")
  .action(function () {
    this.showHelp();
  })
  .command("schema", schema)
  // .command("resolver", "Generate the resolver")
  // .option("-d, --dir <dir:string>", "Directory of resolvers.")
  // .option("-o, --out <destination:string>", "Path to write resolver_gen.ts.")
  // .action(({ dir, out }) => {
  //   console.log(`resolver -d ${dir} -o ${out}`);
  // })
  .parse(Deno.args);
