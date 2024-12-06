import fs from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";

export async function parseSource(filepath: URL): Promise<ts.SourceFile> {
	return ts.createSourceFile(
		filepath.href,
		await fs.readFile(filepath, "utf-8"),
		ts.ScriptTarget.ESNext,
	);
}

export interface Declaration {
	declaration: ts.Declaration;
	source: ts.SourceFile;
	name: string;
}

export type Exports = Record<string, Declaration[]>;

function resolveModule(
	specifier: string,
	referrer: URL,
): Promise<ts.SourceFile> {
	let url: URL;
	if (specifier.startsWith(".")) {
		url = new URL(specifier.replace(/(?<!\.[jt]sx?)$/, ".ts"), referrer);
	} else {
		// TODO use import_map.json
		url = new URL(specifier);
	}

	if (url.protocol === "file:") {
		return parseSource(url);
	}

	throw new Error(`Unsupported protocol: ${url.protocol}`);
}

function pushExports(e: Exports, name: string, ...decls: Declaration[]) {
	if (!e[name]) {
		e[name] = [];
	}

	e[name].push(...decls);
}

export async function findExports(
	source: ts.SourceFile,
	resolveModuleFn = resolveModule,
): Promise<Exports> {
	const exports: Exports = {};
	const namedExports: Array<{ name: string; property?: string }> = [];
	for (const node of source.statements) {
		if (
			ts.isFunctionDeclaration(node) ||
			ts.isClassDeclaration(node) ||
			ts.isInterfaceDeclaration(node)
		) {
			if (node.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)) {
				const name = node.modifiers.some(
					(m) => m.kind === ts.SyntaxKind.DefaultKeyword,
				)
					? "default"
					: node.name?.getText(source);
				if (name) {
					pushExports(exports, name, {
						declaration: node,
						source,
						name: name,
					});
				}
			}
		} else if (
			ts.isTypeAliasDeclaration(node) ||
			ts.isEnumDeclaration(node) ||
			ts.isModuleDeclaration(node)
		) {
			if (node.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)) {
				const name = node.name.getText(source);
				pushExports(exports, name, {
					declaration: node,
					source,
					name: name,
				});
			}
		} else if (ts.isVariableStatement(node)) {
			if (node.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)) {
				for (const decl of node.declarationList.declarations) {
					if (decl.name) {
						const name = decl.name.getText(source);
						pushExports(exports, name, {
							declaration: decl,
							source,
							name: name,
						});
					}
				}
			}
		} else if (ts.isExportDeclaration(node)) {
			if (node.exportClause && ts.isNamedExports(node.exportClause)) {
				if (node.moduleSpecifier) {
					if (!ts.isStringLiteral(node.moduleSpecifier)) {
						continue;
					}

					// export { whatever } from 'whatever';
					const specifier = node.moduleSpecifier.text;
					const moduleExports = await findExports(
						await resolveModuleFn(specifier, new URL(source.fileName)),
						resolveModuleFn,
					);
					for (const name of Array.from(node.exportClause.elements, (e) =>
						e.name.getText(source),
					)) {
						if (!(name in moduleExports)) {
							throw new Error(
								`Exported name ${name} not found in ${JSON.stringify(
									specifier,
								)}`,
							);
						}

						pushExports(exports, name, ...moduleExports[name]);
					}
				} else {
					for (const element of node.exportClause.elements) {
						namedExports.push({
							name: element.name.text,
							property: element.propertyName?.text,
						});
					}
				}
			} else if (
				!node.exportClause &&
				node.moduleSpecifier &&
				ts.isStringLiteral(node.moduleSpecifier)
			) {
				// export * from 'whatever';
				Object.assign(
					exports,
					await findExports(
						await resolveModuleFn(
							node.moduleSpecifier.text,
							new URL(source.fileName),
						),
						resolveModuleFn,
					),
				);
			}
		}
	}

	if (namedExports.length) {
		const names = Object.fromEntries(
			namedExports.map((e) => [e.property ?? e.name, e.name]),
		);
		for (const statement of source.statements) {
			if (ts.isVariableStatement(statement)) {
				for (const decl of statement.declarationList.declarations) {
					if (
						ts.isIdentifier(decl.name) &&
						decl.name.getText(source) in names
					) {
						const name = names[decl.name.getText(source)];
						pushExports(exports, name, {
							declaration: decl,
							source,
							name: names[decl.name.getText(source)],
						});
					}
				}
			}

			if (ts.isFunctionDeclaration(statement)) {
				if (
					statement.name &&
					ts.isIdentifier(statement.name) &&
					statement.name.getText(source) in names
				) {
					const name = names[statement.name.getText(source)];
					pushExports(exports, name, {
						declaration: statement,
						source,
						name: names[statement.name.getText(source)],
					});
				}
			}

			if (ts.isClassDeclaration(statement)) {
				if (
					statement.name &&
					ts.isIdentifier(statement.name) &&
					statement.name.getText(source) in names
				) {
					const name = names[statement.name.getText(source)];
					pushExports(exports, name, {
						declaration: statement,
						source,
						name: names[statement.name.getText(source)],
					});
				}
			}

			if (ts.isTypeAliasDeclaration(statement)) {
				if (
					statement.name &&
					ts.isIdentifier(statement.name) &&
					statement.name.getText(source) in names
				) {
					const name = names[statement.name.getText(source)];
					pushExports(exports, name, {
						declaration: statement,
						source,
						name: names[statement.name.getText(source)],
					});
				}
			}

			if (ts.isInterfaceDeclaration(statement)) {
				if (
					statement.name &&
					ts.isIdentifier(statement.name) &&
					statement.name.getText(source) in names
				) {
					const name = names[statement.name.getText(source)];
					pushExports(exports, name, {
						declaration: statement,
						source,
						name: names[statement.name.getText(source)],
					});
				}
			}

			if (ts.isEnumDeclaration(statement)) {
				if (
					statement.name &&
					ts.isIdentifier(statement.name) &&
					statement.name.getText(source) in names
				) {
					const name = names[statement.name.getText(source)];
					pushExports(exports, name, {
						declaration: statement,
						source,
						name: names[statement.name.getText(source)],
					});
				}
			}

			if (ts.isImportDeclaration(statement)) {
				if (
					statement.importClause?.namedBindings &&
					ts.isNamedImports(statement.importClause.namedBindings)
				) {
					let importExports: Exports | undefined;
					for (const element of statement.importClause.namedBindings.elements) {
						if (
							element.propertyName &&
							ts.isIdentifier(element.propertyName) &&
							element.propertyName.getText(source) in names
						) {
							if (
								!importExports &&
								ts.isStringLiteral(statement.moduleSpecifier)
							) {
								const specifier = statement.moduleSpecifier.getText(source);
								importExports = await findExports(
									await resolveModuleFn(specifier, new URL(source.fileName)),
									resolveModuleFn,
								);
							}

							if (!importExports) {
								throw new Error(
									`Unable to find exports for ${statement.moduleSpecifier.getText(
										source,
									)}`,
								);
							}

							if (!importExports[element.name.getText(source)]) {
								throw new Error(
									`Exported name ${element.name.getText(
										source,
									)} not found in ${JSON.stringify(
										statement.moduleSpecifier.getText(source),
									)}`,
								);
							}

							const name = names[element.propertyName.getText(source)];
							pushExports(exports, name, {
								declaration: element,
								source,
								name: names[element.propertyName.getText(source)],
							});
						}
					}
				}
			}
		}
	}

	return exports;
}

export interface Module {
	path: URL;
	exports: Exports;
	source: ts.SourceFile;
}

export async function parseModule(
	sourceOrPath: string | ts.SourceFile,
): Promise<Module> {
	const url =
		typeof sourceOrPath === "string"
			? pathToFileURL(resolve(sourceOrPath))
			: new URL(sourceOrPath.fileName);
	const source =
		typeof sourceOrPath === "string" ? await parseSource(url) : sourceOrPath;
	return {
		path: url,
		exports: await findExports(source),
		source,
	};
}

export default ts;

/**
 * NOTE: this is an internal value in the TypeScript compiler
 *
 * @see https://github.com/microsoft/TypeScript/blob/0d0a79371471d627ae298a145f8009b05cbccb72/src/compiler/scanner.ts#L81
 */
export const keywords = new Set(
	Object.keys(
		(ts as unknown as { textToKeywordObj: Record<string, ts.SyntaxKind> })
			.textToKeywordObj,
	),
);
