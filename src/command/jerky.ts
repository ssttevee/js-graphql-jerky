import path from "path";
import { program } from "commander";
import fs from "fs/promises";

import {
	generate,
	parseResolvers,
	parseScalars,
	parseSchema,
	parseTypeResolvers,
} from "../generate/index.js";

program
	.name("jerky")
	.version("0.1.0")
	.description("Schema-first GraphQL typescript code generator")
	.argument("[schema]", "Path to schema file or directory.")
	.option("-o, --out <destination>", "Path to write schema_gen.ts.")
	.option("--graphql <module>", "graphql module import specifier.")
	.option("--scalars <module>", "scalars module import specifier.")
	.option("--resolvers <directory>", "resolvers directory path.")
	.option("--subscribers <module>", "subscriber module import specifier.")
	.option(
		"--field-directives <module>",
		"field directives module import specifier.",
	)
	.option(
		"--input-directives <module>",
		"input directives module import specifier.",
	)
	.option(
		"--ext <mode>",
		'whether "keep", "replace", or "omit" the .ts extension in import statements.',
	)
	.showHelpAfterError(true);

program.parse();

const {
	out = "schema_gen.ts",
	graphql = "graphql",
	scalars,
	resolvers,
	subscribers,
	fieldDirectives,
	inputDirectives,
	ext = "omit",
} = program.opts();
const [schema = "."] = program.args;

(async () => {
	let outfile = out;
	if (!outfile.pathname.endsWith("/")) {
		// test if it's a directory
		try {
			const stat = await fs.stat(outfile);
			if (stat.isDirectory()) {
				outfile += "/";
			}
		} catch {
			// probably doesn't exist yet
		}
	}

	if (outfile.endsWith("/")) {
		outfile += "schema_gen.ts";
	}

	if (!outfile.endsWith(".ts")) {
		outfile += ".ts";
	}

	switch (ext) {
		case "keep":
		case "replace":
		case "omit":
			break;

		default:
			throw new Error(`invalid mode for --ext: ${ext}`);
	}

	await fs.writeFile(
		outfile,
		generate(await parseSchema(path.resolve(schema)), outfile.pathname, {
			scalarsInfo: scalars ? await parseScalars(scalars) : undefined,
			fieldDirectivesInfo: fieldDirectives
				? await parseTypeResolvers("", fieldDirectives)
				: undefined,
			inputDirectivesInfo: inputDirectives
				? await parseTypeResolvers("", inputDirectives)
				: undefined,
			resolversInfo: resolvers ? await parseResolvers(resolvers) : undefined,
			subscribersInfo: subscribers
				? await parseTypeResolvers("Subscription", subscribers)
				: undefined,
			graphqlModuleSpecifier: graphql,
			extMode: ext,
		}),
	);
})().catch((err) => {
	console.error(err.message);
	console.log();

	if (
		process.argv.length === 2 ||
		(process.argv.length === 3 && process.argv[2] === "help")
	) {
		program.outputHelp();
	}
});
