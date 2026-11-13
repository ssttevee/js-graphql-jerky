import fs from "node:fs/promises";
import { posix } from "node:path";
import { glob as globFiles } from "glob";
import {
	type DocumentNode,
	type GraphQLSchema,
	Source,
	buildASTSchema,
	parse as parseDocument,
	validateSchema,
} from "graphql";

import { type MatchPattern, createMatcher } from "./matcher.js";
import { mergeDocumentNodes } from "./merge.js";
import { comparePaths, globOptions, toPosixPath } from "./utils/paths.js";

async function collectSchemaFiles(
	glob: string | string[],
	files: Set<string>,
): Promise<void> {
	for (const path of await globFiles(glob, globOptions)) {
		const entry = await fs.stat(path);
		if (entry.isFile()) {
			files.add(toPosixPath(path));
		} else if (entry.isDirectory()) {
			await collectSchemaFiles(
				posix.join(toPosixPath(path), "**/*.graphql"),
				files,
			);
		}
	}
}

/**
 * Finds the schema files and sorts them by path. The order of the files sets
 * the order of the merged definitions and fields, so it must not change with
 * the file system or the platform.
 */
async function findSchemaFiles(glob: string | string[]): Promise<string[]> {
	const files = new Set<string>();
	await collectSchemaFiles(glob, files);
	return Array.from(files).sort(comparePaths);
}

export async function parse(
	glob: string | string[],
	ignore?: MatchPattern,
): Promise<GraphQLSchema> {
	const shouldIgnore = createMatcher(ignore);
	const documentNodes: DocumentNode[] = [];
	for (const entry of await findSchemaFiles(glob)) {
		if (shouldIgnore(entry)) {
			continue;
		}

		documentNodes.push(
			parseDocument(new Source(await fs.readFile(entry, "utf-8"), entry)),
		);
	}

	if (!documentNodes.length) {
		throw new Error("No graphql files found");
	}

	const schema = buildASTSchema(mergeDocumentNodes(documentNodes));
	const validationErrors = validateSchema(schema);
	if (validationErrors.length > 0) {
		throw validationErrors;
	}

	return schema;
}
