import { getLineAndCharacterOfPosition } from "typescript";

import { SymbolReference } from "./utils/reference.js";
import ts, { parseModule } from "./utils/typescript.js";

type FunctionDeclaration =
	| ts.MethodDeclaration
	| ts.FunctionExpression
	| ts.ArrowFunction;

interface ScalarFnsInfo {
	serializeFunc?: SymbolReference & { declaration: FunctionDeclaration };
	parseValueFunc?: SymbolReference & { declaration: FunctionDeclaration };
	parseLiteralFunc?: SymbolReference & { declaration: FunctionDeclaration };
}

export interface ScalarInfo extends ScalarFnsInfo {
	type?: SymbolReference;
}

function locLineColumn(
	decl: ts.Declaration,
	source: ts.SourceFile,
): [number, number] {
	const head = source.text.slice(0, decl.pos);
	return [
		head.split("\n").length,
		head.slice(head.lastIndexOf("\n") + 1).length + 1,
	];
}

function refFromImportTypeNode(
	node: ts.ImportTypeNode,
	source: ts.SourceFile,
): SymbolReference | undefined {
	if (node.isTypeOf) {
		console.log(
			"WARNING: typeof namespace import for scalar type is not supported",
		);
		return;
	}

	if (!node.qualifier || !ts.isIdentifier(node.qualifier)) {
		console.log("WARNING: namespace import for scalar type is not supported");
		return;
	}

	if (
		!ts.isLiteralTypeNode(node.argument) ||
		!ts.isStringLiteral(node.argument.literal)
	) {
		// this is a grammar error, handling it is out of scope
		const { line, character } = getLineAndCharacterOfPosition(source, node.pos);
		console.log(
			`WARNING: grammar error at ${source.fileName}:${line + 1}:${
				character + 1
			}`,
		);
		return;
	}

	return { module: node.argument.literal.text, symbol: node.qualifier.text };
}

function refFromTypeReferenceNode(
	typeNode: ts.TypeReferenceNode,
	source: ts.SourceFile,
): SymbolReference | undefined {
	if (typeNode.typeName.kind === ts.SyntaxKind.QualifiedName) {
		// TODO: handle qualified names
		return;
	}

	const typeName = typeNode.typeName.text;
	if (typeNode.typeArguments?.length) {
		if (typeName !== "Promise") {
			throw new Error("TODO: handle type arguments");
		}

		return refFromTypeNode(typeNode.typeArguments[0], source);
	}

	for (const statement of source.statements) {
		if (ts.isImportDeclaration(statement)) {
			// search imports

			if (!ts.isStringLiteral(statement.moduleSpecifier)) {
				// this is a grammar error, handling it is out of scope
				continue;
			}

			if (!statement.importClause) {
				// side-effect import
				continue;
			}

			if (statement.importClause.name) {
				// default import
				if (statement.importClause.name.text === typeName) {
					return {
						module: statement.importClause.name.text,
						symbol: "default",
						alias: typeName,
					};
				}
			}

			if (!statement.importClause.namedBindings) {
				// this is a grammar error, handling it is out of scope
				continue;
			}

			if (!ts.isNamedImports(statement.importClause.namedBindings)) {
				// TODO: handle namespace imports (will need to check if `typeName` has a dot in it)
				continue;
			}

			for (const specifier of statement.importClause.namedBindings.elements ??
				[]) {
				if (specifier.name.text === typeName) {
					return {
						module: statement.moduleSpecifier.text,
						symbol: specifier.propertyName?.text ?? typeName,
						alias: typeName,
					};
				}
			}
		} else if (
			ts.isTypeAliasDeclaration(statement) ||
			ts.isInterfaceDeclaration(statement) ||
			ts.isEnumDeclaration(statement)
		) {
			if (statement.name.text === typeName) {
				if (
					!statement.modifiers?.some(
						(mod) => mod.kind === ts.SyntaxKind.ExportKeyword,
					)
				) {
					console.log(statement);
					console.log(
						`WARNING: found type ${typeName} in ${
							source.fileName
						}:${locLineColumn(statement, source).join(
							":",
						)} but it is not exported`,
					);
					continue;
				}

				return { module: source.fileName, symbol: typeName };
			}
		}
	}

	// assume intrinsic or global type
	return { symbol: typeName };
}

function refFromTypeNode(
	typeNode: ts.TypeNode,
	source: ts.SourceFile,
): SymbolReference | undefined {
	if (ts.isImportTypeNode(typeNode)) {
		return refFromImportTypeNode(typeNode, source);
	}

	if (ts.isTokenKind(typeNode.kind)) {
		// primitive type string, number, etc...
		return { symbol: typeNode.getText(source) };
	}

	if (ts.isTypeReferenceNode(typeNode)) {
		return refFromTypeReferenceNode(typeNode, source);
	}

	console.warn(
		`WARNING: unexpected type node: ${ts.SyntaxKind[typeNode.kind]}`,
	);
}

function reconcileScalarType(
	scalarName: string,
	typeDecls: Array<ts.TypeNode | undefined>,
	source: ts.SourceFile,
): SymbolReference | undefined {
	let type: SymbolReference | undefined;
	for (const typeNode of typeDecls) {
		if (!typeNode) {
			continue;
		}

		const newType = refFromTypeNode(typeNode, source);
		if (type && newType) {
			if (
				type.symbol !== newType.symbol ||
				type.alias !== newType.alias ||
				type.module !== newType.module ||
				type.property !== newType.property
			) {
				throw new Error(
					`mismatched types do not match for scalar ${scalarName}: ${type.symbol} !== ${newType.symbol}`,
				);
			}
		} else if (!type && newType) {
			type = newType;
		}
	}

	return type;
}

function scalarInfoFromObjectLiteralExpression(
	scalarName: string,
	module: string,
	properties: ArrayLike<ts.ObjectLiteralElementLike>,
): ScalarFnsInfo {
	return Object.fromEntries(
		Array.from(properties).flatMap(
			(
				prop,
			): [
				Exclude<keyof ScalarInfo, "type">,
				SymbolReference & { declaration: FunctionDeclaration },
			][] => {
				if (ts.isPropertyAssignment(prop)) {
					if (!ts.isIdentifier(prop.name)) {
						return [];
					}

					switch (prop.name.text) {
						case "serialize":
						case "parseValue":
						case "parseLiteral":
							if (
								!ts.isFunctionExpression(prop.initializer) &&
								!ts.isArrowFunction(prop.initializer)
							) {
								console.log(
									`WARNING: expected scalar property ${scalarName}.${
										prop.name.text
									} to be a function, but got ${
										ts.SyntaxKind[prop.initializer.kind]
									}`,
								);
								return [];
							}

							return [
								[
									`${
										prop.name.text as
											| "serialize"
											| "parseValue"
											| "parseLiteral"
									}Func`,
									{
										module: module,
										symbol: scalarName,
										property: prop.name.text,
										declaration: prop.initializer,
									},
								],
							];

						default:
							console.log(
								`WARNING: found extraneous scalar property ${scalarName}.${prop.name.text}`,
							);
					}
				} else if (ts.isMethodDeclaration(prop)) {
					if (!ts.isIdentifier(prop.name)) {
						return [];
					}

					switch (prop.name.text) {
						case "serialize":
						case "parseValue":
						case "parseLiteral":
							return [
								[
									`${
										prop.name.text as
											| "serialize"
											| "parseValue"
											| "parseLiteral"
									}Func`,
									{
										module,
										symbol: scalarName,
										property: prop.name.text,
										declaration: prop,
									},
								],
							];

						default:
							console.log(
								`WARNING: found extraneous scalar property ${scalarName}.${prop.name.text}`,
							);
					}
				} else {
					console.log(
						`WARNING: unsupported object literal element in scalar object ${scalarName}: ${
							ts.SyntaxKind[prop.kind]
						}`,
					);
				}

				return [];
			},
		),
	);
}

export async function parse(path: string): Promise<Record<string, ScalarInfo>> {
	const scalarFnsInfos: Record<string, ScalarFnsInfo> = {};
	const scalarTypeNodes: Record<string, ts.TypeNode> = {};
	const sources: Record<string, ts.SourceFile> = {};

	for (const [name, decls] of Object.entries(
		(await parseModule(path)).exports,
	)) {
		for (const { declaration, source } of decls) {
			sources[name] = source;
			if (ts.isVariableDeclaration(declaration)) {
				if (
					declaration.initializer &&
					ts.isObjectLiteralExpression(declaration.initializer)
				) {
					scalarFnsInfos[name] = scalarInfoFromObjectLiteralExpression(
						name,
						new URL(source.fileName).toString(),
						declaration.initializer.properties,
					);
				}
			} else if (ts.isTypeAliasDeclaration(declaration)) {
				if (declaration.typeParameters?.length) {
					console.log(
						`WARNING: skipping scalar type ${name}: type parameters are not supported`,
					);
					continue;
				}

				const ref = refFromTypeNode(declaration.type, source);
				if (ref) {
					scalarTypeNodes[name] = declaration.type;
				}
			}
		}
	}

	const infos: Record<string, ScalarInfo> = {};
	for (const name of new Set([
		...Object.keys(scalarFnsInfos),
		...Object.keys(scalarTypeNodes),
	])) {
		const fnsInfo = scalarFnsInfos[name];
		const typeNode = scalarTypeNodes[name];
		const source = sources[name];

		const type = typeNode
			? {
					module: source.fileName,
					symbol: name,
			  }
			: reconcileScalarType(
					name,
					[
						// NOTE: omit serialize input type because it is supposed to be `unknown`
						fnsInfo?.parseValueFunc?.declaration?.type,
						fnsInfo?.parseLiteralFunc?.declaration?.type,
					],
					source,
			  );
		if (type) {
			if (type.module) {
				type.module = new URL(type.module, source.fileName).toString();
			}
		}

		infos[name] = {
			...fnsInfo,
			type,
		};
	}

	return infos;
}
