import fs from "node:fs/promises";
import path from "node:path";
import { program } from "commander";

import {
	createGenerator,
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
	.option("-t", "Write types to a separate file.")
	.option(
		"--types-out <destination>",
		"Path to write types_gen.ts. Types will be written in types_gen.ts if omitted and -t is used.",
	)
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
	.option("--include-ast-nodes", "Include ast nodes in graphql type objects")
	.option(
		"--include-subscription-resolvers",
		"Include subscription field resolvers in graphql type objects",
	)
	.option(
		"--ext <mode>",
		'whether "keep", "replace", or "omit" the .ts extension in import statements.',
	)
	.showHelpAfterError(true);

program.parse();

const {
	out = "schema_gen.ts",
	typesOut,
	graphql = "graphql",
	scalars,
	resolvers,
	subscribers,
	fieldDirectives,
	inputDirectives,
	ext = "omit",
	t: splitTypesFile,
	includeAstNodes,
	includeSubscriptionResolvers: includeSubscriptionFieldResolvers,
} = program.opts();
const [schema = "."] = program.args;

async function normalizeOutfile(
	path: string,
	defaultFilename: string,
): Promise<string> {
	if (!path.endsWith("/")) {
		// test if it's a directory
		try {
			const stat = await fs.stat(path);
			if (stat.isDirectory()) {
				path += "/";
			}
		} catch {
			// probably doesn't exist yet
		}
	}

	if (path.endsWith("/")) {
		path += defaultFilename;
	}

	if (!path.endsWith(".ts")) {
		path += ".ts";
	}

	return path;
}

(async () => {
	switch (ext) {
		case "keep":
		case "replace":
		case "omit":
			break;

		default:
			throw new Error(`invalid mode for --ext: ${ext}`);
	}

	const generator = createGenerator(await parseSchema(path.resolve(schema)), {
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
		includeAstNodes,
		includeSubscriptionFieldResolvers,
	});

	const outfile = await normalizeOutfile(out, "schema_gen.ts");
	if (splitTypesFile || typesOut) {
		const typesfile = await normalizeOutfile(
			typesOut ?? path.dirname(outfile),
			"types_gen.ts",
		);
		await Promise.all([
			fs.writeFile(outfile, generator.generateSchema(outfile)),
			fs.writeFile(typesfile, generator.generateTypes(typesfile)),
		]);
	} else {
		await fs.writeFile(outfile, generator.generate(outfile));
	}
})().catch((err) => {
	console.error(err.stack);
	console.log();

	if (
		process.argv.length === 2 ||
		(process.argv.length === 3 && process.argv[2] === "help")
	) {
		program.outputHelp();
	}
});
