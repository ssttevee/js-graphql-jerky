import fs from "node:fs/promises";
import { basename, extname, posix } from "node:path";
import { glob as globFiles } from "glob";

import { type MatchPattern, createMatcher } from "./matcher.js";
import { comparePaths, globOptions, toPosixPath } from "./utils/paths.js";
import type { SymbolReference } from "./utils/reference.js";
import ts, { parseModule } from "./utils/typescript.js";

async function parseResolverFile(
	path: string,
): Promise<Record<string, SymbolReference>> {
	return Object.fromEntries(
		Object.entries((await parseModule(path)).exports).flatMap(
			([name, decls]): [string, SymbolReference][] =>
				decls.flatMap(({ declaration }) => {
					if (
						ts.isVariableDeclaration(declaration) &&
						declaration.initializer
					) {
						if (ts.isFunctionExpression(declaration.initializer)) {
							return [[name, { module: path, symbol: name }]];
						}

						if (ts.isArrowFunction(declaration.initializer)) {
							return [[name, { module: path, symbol: name }]];
						}
					}

					if (ts.isFunctionDeclaration(declaration)) {
						return [[name, { module: path, symbol: name }]];
					}

					return [];
				}),
		),
	);
}

export async function parseTypeResolvers(
	typeName: string,
	glob: string | string[],
	ignore?: MatchPattern,
): Promise<Record<string, SymbolReference>> {
	const shouldIgnore = createMatcher(ignore);
	const result: Record<string, SymbolReference> = {};
	// NOTE: sort the files so that the result (and the warnings) do not change
	// with the order in which the file system returns entries.
	const fullpaths = (
		await globFiles(glob, { ...globOptions, withFileTypes: true })
	)
		.filter((entry) => entry.isFile() && entry.name.endsWith(".ts"))
		.map((entry) => toPosixPath(entry.fullpath()))
		.filter((fullpath) => !shouldIgnore(fullpath))
		.sort(comparePaths);
	for (const fullpath of fullpaths) {
		for (const [name, reference] of Object.entries(
			await parseResolverFile(fullpath),
		)) {
			let realName = name;
			if (
				realName === "default" &&
				typeof glob === "string" &&
				toPosixPath(glob).endsWith("/*.ts")
			) {
				realName = basename(fullpath, extname(fullpath));
			}

			if (realName in result) {
				console.warn(
					`WARNING: Duplicate resolver name: ${
						typeName ? `${typeName}.` : ""
					}${realName} in ${fullpath} and ${result[realName].module}`,
				);
			}

			result[realName] = reference;
		}
	}

	return result;
}

export async function parse(
	dirpath: string,
	ignore?: MatchPattern,
): Promise<Record<string, Record<string, SymbolReference>>> {
	const dir = await fs.stat(dirpath);
	if (!dir.isDirectory()) {
		throw new Error(`Expected ${dirpath} to be a directory`);
	}

	const out = {} as Record<string, Record<string, SymbolReference>>;

	const shouldIgnore = createMatcher(ignore);

	const names = (await fs.readdir(dirpath)).sort(comparePaths);
	for (const name of names) {
		const file = posix.join(toPosixPath(dirpath), name);
		const entry = await fs.stat(file);
		if (entry.isDirectory()) {
			out[name] = await parseTypeResolvers(name, `${file}/*.ts`, shouldIgnore);
		} else if (entry.isFile() && name.endsWith(".ts")) {
			out[name.slice(0, -3)] = await parseTypeResolvers(
				name.slice(0, -3),
				file,
				shouldIgnore,
			);
		}
	}

	return out;
}
