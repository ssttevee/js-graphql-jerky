import {
	ArgumentNode,
	BooleanValueNode,
	DefinitionNode,
	DirectiveNode,
	DocumentNode,
	EnumTypeDefinitionNode,
	EnumValueNode,
	ExecutableDefinitionNode,
	FieldDefinitionNode,
	FloatValueNode,
	GraphQLError,
	InputObjectTypeDefinitionNode,
	InputValueDefinitionNode,
	IntValueNode,
	InterfaceTypeDefinitionNode,
	Kind,
	ListTypeNode,
	ListValueNode,
	Location,
	NameNode,
	NamedTypeNode,
	NonNullTypeNode,
	ObjectTypeDefinitionNode,
	ObjectValueNode,
	ScalarTypeDefinitionNode,
	SchemaDefinitionNode,
	StringValueNode,
	TypeExtensionNode,
	TypeNode,
	UnionTypeDefinitionNode,
	ValueNode,
} from "graphql";
import zip from "just-zip-it";

function locLineColumn(loc: Location): [number, number] {
	const head = loc.source.body.slice(0, loc.start);
	return [
		head.split("\n").length,
		head.slice(head.lastIndexOf("\n") + 1).length + 1,
	];
}

function traceLine(loc: Location | undefined, prefix = ""): string {
	if (!loc) {
		return "";
	}

	return `\n    ${prefix}at file://${loc.source.name}:${locLineColumn(loc).join(
		":",
	)}`;
}

function setTraceToSchema(err: GraphQLError, name: string, loc?: Location) {
	// biome-ignore lint/suspicious/noExplicitAny: hacks
	if ((globalThis as any).Deno) {
		// this is required for the magic to work
		const _ = err.stack;

		if (loc) {
			// biome-ignore lint/suspicious/noExplicitAny: hacks
			const trace = (err as any).__callSiteEvals;
			const [lineNumber, columnNumber] = locLineColumn(loc);

			// NOTE: this is deno magic
			// @see https://github.com/denoland/deno/blob/b1b418b81a13ede548273665e83c1bc5a97dffcd/core/error.rs#L275
			Object.defineProperty(err, "__callSiteEvals", {
				get: () => [
					{
						this: undefined,
						typeName: null,
						function: undefined,
						functionName: name,
						methodName: null,
						fileName: `file://${loc.source.name}`,
						lineNumber,
						columnNumber,
						evalOrigin: undefined,
						isToplevel: true,
						isEval: false,
						isNative: false,
						isConstructor: false,
						isAsync: false,
						isPromiseAll: false,
						promiseIndex: null,
					},
					...trace,
				],
			});
		}
	}

	return err;
}

type MergableDefinitionNode = Exclude<
	DefinitionNode,
	ExecutableDefinitionNode | SchemaDefinitionNode | TypeExtensionNode
>;

interface NamedNode {
	readonly name: NameNode;
}

function namedNodesDict<T extends NamedNode>(
	nodes: ReadonlyArray<T> = [],
): Record<string, T> {
	return Object.fromEntries(
		nodes.map((node): [string, T] => [node.name.value, node]),
	);
}

function sortNamedNodes<T extends NamedNode>(nodes: ReadonlyArray<T>): T[] {
	return Array.from(nodes).sort((
    { name: { value: a } },
    { name: { value: b } },
  ) => a.localeCompare(b));
}

function isIntValueNodeEqual(a: IntValueNode, b: IntValueNode): boolean {
	return a.value === b.value;
}

function isFloatValueNodeEqual(a: FloatValueNode, b: FloatValueNode): boolean {
	return a.value === b.value;
}

function isStringValueNodeEqual(
	a: StringValueNode,
	b: StringValueNode,
): boolean {
	return a.value === b.value;
}

function isBooleanValueNodeEqual(
	a: BooleanValueNode,
	b: BooleanValueNode,
): boolean {
	return a.value === b.value;
}

function isEnumValueNodeEqual(a: EnumValueNode, b: EnumValueNode): boolean {
	return a.value === b.value;
}

function isListValueNodeEqual(a: ListValueNode, b: ListValueNode): boolean {
	return zip(a.values as ValueNode[], b.values as ValueNode[]).every(
		([a, b]) => isValueNodeEqual(a, b),
	);
}

function isObjectValueNodeEqual(
	a: ObjectValueNode,
	b: ObjectValueNode,
): boolean {
	return zip(sortNamedNodes(a.fields), sortNamedNodes(b.fields)).every(
		([a, b]) =>
			a.name.value === b.name.value && isValueNodeEqual(a.value, b.value),
	);
}

function isValueNodeEqual(
	a: ValueNode | undefined,
	b: ValueNode | undefined,
): boolean {
	if (a === b || (!a && !b)) {
		return true;
	}

	if (!a || !b || a.kind !== b.kind) {
		return false;
	}

	switch (a.kind) {
		case Kind.INT:
			return isIntValueNodeEqual(a, b as IntValueNode);
		case Kind.FLOAT:
			return isFloatValueNodeEqual(a, b as FloatValueNode);
		case Kind.STRING:
			return isStringValueNodeEqual(a, b as StringValueNode);
		case Kind.BOOLEAN:
			return isBooleanValueNodeEqual(a, b as BooleanValueNode);
		case Kind.ENUM:
			return isEnumValueNodeEqual(a, b as EnumValueNode);
		case Kind.LIST:
			return isListValueNodeEqual(a, b as ListValueNode);
		case Kind.OBJECT:
			return isObjectValueNodeEqual(a, b as ObjectValueNode);
		case Kind.NULL:
		case Kind.VARIABLE:
			return true;
	}
}

function isArgumentNodesEqual(
	a: ReadonlyArray<ArgumentNode> | undefined,
	b: ReadonlyArray<ArgumentNode> | undefined,
): boolean {
	if (a === b || (!a && !b)) {
		return true;
	}

	if (!a || !b || a.length !== b.length) {
		return false;
	}

	return zip(sortNamedNodes(a), sortNamedNodes(b)).every(
		([a, b]) =>
			a.name.value === b.name.value && isValueNodeEqual(a.value, b.value),
	);
}

function isTypeNodeEqual(a: TypeNode, b: TypeNode): boolean {
	if (a.kind !== b.kind) {
		return false;
	}

	switch (a.kind) {
		case Kind.NAMED_TYPE:
			return a.name.value === (b as NamedTypeNode).name.value;
		case Kind.LIST_TYPE:
			return isTypeNodeEqual(a.type, (b as ListTypeNode).type);
		case Kind.NON_NULL_TYPE:
			return isTypeNodeEqual(a.type, (b as NonNullTypeNode).type);
	}
}

function isDirectiveNodesEqual(
	a: ReadonlyArray<DirectiveNode> | undefined,
	b: ReadonlyArray<DirectiveNode> | undefined,
): boolean {
	if (a === b || (!a && !b)) {
		return true;
	}

	if (!a || !b || a.length !== b.length) {
		return false;
	}

	return zip(sortNamedNodes(a), sortNamedNodes(b)).every(
		([a, b]) =>
			a.name.value === b.name.value &&
			isArgumentNodesEqual(a.arguments, b.arguments),
	);
}

function isInputValueDefinitionNodesEqual(
	a: ReadonlyArray<InputValueDefinitionNode> | undefined,
	b: ReadonlyArray<InputValueDefinitionNode> | undefined,
): boolean {
	if (a === b || (!a && !b)) {
		return true;
	}

	if (!a || !b || a.length !== b.length) {
		return false;
	}

	return zip(sortNamedNodes(a), sortNamedNodes(b)).every(
		([a, b]) =>
			a.name.value === b.name.value &&
			isTypeNodeEqual(a.type, b.type) &&
			isValueNodeEqual(a.defaultValue, b.defaultValue) &&
			isDirectiveNodesEqual(a.directives, b.directives),
	);
}

function mergeFieldDefinitionNodes(
	name: string,
	a: ReadonlyArray<FieldDefinitionNode> | undefined,
	b: ReadonlyArray<FieldDefinitionNode> | undefined,
): ReadonlyArray<FieldDefinitionNode> {
	const fields = namedNodesDict(a);
	if (b) {
		for (const f of b) {
			const prev = fields[f.name.value];
			if (prev) {
				if (!isInputValueDefinitionNodesEqual(prev.arguments, f.arguments)) {
					throw setTraceToSchema(
						new GraphQLError(
							`Cannot merge duplicate field with different arguments: ${name}.${f.name.value}`,
						),
						`${name}.${f.name.value}`,
						f.loc,
					);
				}

				if (!isTypeNodeEqual(prev.type, f.type)) {
					throw setTraceToSchema(
						new GraphQLError(
							`Cannot merge duplicate field with different type: ${name}.${f.name.value}`,
						),
						`${name}.${f.name.value}`,
						f.type.loc,
					);
				}

				console.warn(
					`WARNING: there is more than one declaration for ${name}.${
						f.name.value
					}${traceLine(f.loc)}${traceLine(prev.loc, "previously ")}\n`,
				);

				fields[f.name.value] = {
					...prev,
					directives: mergeDirectiveNodes(
						`${name}.${f.name.value}`,
						prev.directives,
						f.directives,
					),
				};
			} else {
				fields[f.name.value] = f;
			}
		}
	}

	return Object.values(fields);
}

function mergeInputValueDefinitionNodes(
	name: string,
	a: ReadonlyArray<InputValueDefinitionNode> | undefined,
	b: ReadonlyArray<InputValueDefinitionNode> | undefined,
): ReadonlyArray<InputValueDefinitionNode> {
	const fields = namedNodesDict(a);
	if (b) {
		for (const f of b) {
			const prev = fields[f.name.value];
			if (prev) {
				if (!isValueNodeEqual(prev.defaultValue, f.defaultValue)) {
					throw setTraceToSchema(
						new GraphQLError(
							`Cannot merge duplicate field with different arguments: ${name}.${f.name.value}`,
						),
						`${name}.${f.name.value}`,
						f.loc,
					);
				}

				if (!isTypeNodeEqual(prev.type, f.type)) {
					throw setTraceToSchema(
						new GraphQLError(
							`Cannot merge duplicate field with different type: ${name}.${f.name.value}`,
						),
						`${name}.${f.name.value}`,
						f.type.loc,
					);
				}

				console.warn(
					`WARNING: there is more than one declaration for ${name}.${
						f.name.value
					}${traceLine(f.loc)}${traceLine(prev.loc, "previously ")}\n`,
				);

				fields[f.name.value] = {
					...prev,
					directives: mergeDirectiveNodes(
						`${name}.${f.name.value}`,
						prev.directives,
						f.directives,
					),
				};
			} else {
				fields[f.name.value] = f;
			}
		}
	}

	return Object.values(fields);
}

function mergeNamedNodes<Node extends NamedNode>(
	a: ReadonlyArray<Node> | undefined,
	b: ReadonlyArray<Node> | undefined,
): Node[] {
	const nodes = namedNodesDict(a);
	if (b) {
		for (const n of b) {
			nodes[n.name.value] = n;
		}
	}

	return Object.values(nodes);
}

function mergeDirectiveNodes<Node extends DirectiveNode>(
	name: string,
	a: ReadonlyArray<Node> | undefined,
	b: ReadonlyArray<Node> | undefined,
): ReadonlyArray<Node> {
	const directives = namedNodesDict(a);
	if (b) {
		for (const d of b) {
			if (
				d.name.value in directives &&
				!isArgumentNodesEqual(directives[d.name.value].arguments, d.arguments)
			) {
				throw setTraceToSchema(
					new GraphQLError(
						`Cannot merge duplicate directive with different arguments: ${name} @${d.name.value}`,
					),
					`${name} @${d.name.value}`,
					d.loc,
				);
			}

			directives[d.name.value] = d;
		}
	}

	return Object.values(directives);
}

function mergeScalarTypeDefinitionNodes(
	a: ScalarTypeDefinitionNode,
	b: ScalarTypeDefinitionNode,
): ScalarTypeDefinitionNode {
	if (a.name.value !== b.name.value) {
		throw setTraceToSchema(
			new GraphQLError(
				`Cannot merge scalar types with different names: ${a.name.value} and ${b.name.value}`,
			),
			a.name.value,
			a.loc,
		);
	}

	return {
		kind: Kind.SCALAR_TYPE_DEFINITION,
		name: a.name,
		directives: mergeDirectiveNodes(a.name.value, a.directives, b.directives),
	};
}

function mergeObjectTypeDefinitionNodes(
	a: ObjectTypeDefinitionNode,
	b: ObjectTypeDefinitionNode,
): ObjectTypeDefinitionNode {
	return {
		kind: Kind.OBJECT_TYPE_DEFINITION,
		loc: a.loc,
		name: a.name,
		description: a.description || b.description,
		interfaces: mergeNamedNodes(a.interfaces, b.interfaces),
		directives: mergeDirectiveNodes(a.name.value, a.directives, b.directives),
		fields: mergeFieldDefinitionNodes(a.name.value, a.fields, b.fields),
	};
}

function mergeInterfaceTypeDefinitionNodes(
	a: InterfaceTypeDefinitionNode,
	b: InterfaceTypeDefinitionNode,
): InterfaceTypeDefinitionNode {
	return {
		kind: Kind.INTERFACE_TYPE_DEFINITION,
		loc: a.loc,
		name: a.name,
		description: a.description || b.description,
		interfaces: mergeNamedNodes(a.interfaces, b.interfaces),
		directives: mergeDirectiveNodes(a.name.value, a.directives, b.directives),
		fields: mergeFieldDefinitionNodes(a.name.value, a.fields, b.fields),
	};
}

function mergeUnionTypeDefinitionNodes(
	a: UnionTypeDefinitionNode,
	b: UnionTypeDefinitionNode,
): UnionTypeDefinitionNode {
	return {
		kind: Kind.UNION_TYPE_DEFINITION,
		loc: a.loc,
		name: a.name,
		description: a.description || b.description,
		directives: mergeDirectiveNodes(a.name.value, a.directives, b.directives),
		types: mergeNamedNodes(a.types, b.types),
	};
}

function mergeEnumTypeDefinitionNodes(
	a: EnumTypeDefinitionNode,
	b: EnumTypeDefinitionNode,
): EnumTypeDefinitionNode {
	const values = namedNodesDict(a.values);
	if (b) {
		for (const v of b.values || []) {
			if (v.name.value in values) {
				throw setTraceToSchema(
					new GraphQLError(
						`Cannot merge duplicate enum value: ${v.name.value}.${v.name.value}`,
					),
					`${v.name.value}.${v.name.value}`,
					v.loc,
				);
			}

			values[v.name.value] = v;
		}
	}

	return {
		kind: Kind.ENUM_TYPE_DEFINITION,
		loc: a.loc,
		name: a.name,
		description: a.description || b.description,
		directives: mergeDirectiveNodes(a.name.value, a.directives, b.directives),
		values: Object.values(values),
	};
}

function mergeInputObjectTypeDefinitionNodes(
	a: InputObjectTypeDefinitionNode,
	b: InputObjectTypeDefinitionNode,
): InputObjectTypeDefinitionNode {
	return {
		kind: Kind.INPUT_OBJECT_TYPE_DEFINITION,
		loc: a.loc,
		name: a.name,
		description: a.description || b.description,
		directives: mergeDirectiveNodes(a.name.value, a.directives, b.directives),
		fields: mergeInputValueDefinitionNodes(a.name.value, a.fields, b.fields),
	};
}

export function mergeDocumentNodes(
	documentNodes: DocumentNode[],
): DocumentNode {
	const definitions: Record<string, MergableDefinitionNode> = {};
	for (const documentNode of documentNodes) {
		for (const definition of documentNode.definitions) {
			switch (definition.kind) {
				case Kind.SCHEMA_DEFINITION:
				case Kind.SCHEMA_EXTENSION:
				case Kind.OPERATION_DEFINITION:
				case Kind.FRAGMENT_DEFINITION:
				case Kind.SCALAR_TYPE_EXTENSION:
				case Kind.OBJECT_TYPE_EXTENSION:
				case Kind.INTERFACE_TYPE_EXTENSION:
				case Kind.UNION_TYPE_EXTENSION:
				case Kind.ENUM_TYPE_EXTENSION:
				case Kind.INPUT_OBJECT_TYPE_EXTENSION:
					throw new Error(`unexpected definition kind: ${definition.kind}`);
			}

			const prevDefinition = definitions[definition.name.value];
			if (!prevDefinition) {
				definitions[definition.name.value] = definition;
				continue;
			}

			if (prevDefinition.kind !== definition.kind) {
				throw setTraceToSchema(
					new GraphQLError(
						`Cannot merge different definition kinds: ${prevDefinition.kind} and ${definition.kind}`,
					),
					definition.name.value,
					definition.loc,
				);
			}

			if (prevDefinition.kind === Kind.DIRECTIVE_DEFINITION) {
				throw setTraceToSchema(
					new GraphQLError(
						`Cannot merge duplicate directive definitions: ${definition.name.value}`,
					),
					definition.name.value,
					definition.loc,
				);
			}

			if (
				prevDefinition.description &&
				definition.description &&
				prevDefinition.description.value !== definition.description.value
			) {
				console.warn(
					`WARNING: different descriptions for type ${
						prevDefinition.name.value
					}: ${JSON.stringify(
						prevDefinition.description.value,
					)} and ${JSON.stringify(definition.description.value)}${traceLine(
						definition.description.loc,
					)}${traceLine(prevDefinition.description.loc, "previously ")}\n`,
				);
			}

			switch (definition.kind) {
				case Kind.SCALAR_TYPE_DEFINITION:
					definitions[definition.name.value] = mergeScalarTypeDefinitionNodes(
						prevDefinition as ScalarTypeDefinitionNode,
						definition,
					);
					break;

				case Kind.OBJECT_TYPE_DEFINITION:
					definitions[definition.name.value] = mergeObjectTypeDefinitionNodes(
						prevDefinition as ObjectTypeDefinitionNode,
						definition,
					);
					break;

				case Kind.INTERFACE_TYPE_DEFINITION:
					definitions[definition.name.value] =
						mergeInterfaceTypeDefinitionNodes(
							prevDefinition as InterfaceTypeDefinitionNode,
							definition,
						);
					break;

				case Kind.UNION_TYPE_DEFINITION:
					definitions[definition.name.value] = mergeUnionTypeDefinitionNodes(
						prevDefinition as UnionTypeDefinitionNode,
						definition,
					);
					break;

				case Kind.ENUM_TYPE_DEFINITION:
					definitions[definition.name.value] = mergeEnumTypeDefinitionNodes(
						prevDefinition as EnumTypeDefinitionNode,
						definition,
					);
					break;

				case Kind.INPUT_OBJECT_TYPE_DEFINITION:
					definitions[definition.name.value] =
						mergeInputObjectTypeDefinitionNodes(
							prevDefinition as InputObjectTypeDefinitionNode,
							definition,
						);
					break;
			}
		}
	}

	return {
		kind: Kind.DOCUMENT,
		loc: documentNodes[0].loc,
		definitions: Object.values(definitions),
	};
}
