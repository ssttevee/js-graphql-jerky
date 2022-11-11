import {
  ConstArgumentNode,
  DirectiveLocation,
  getNamedType,
  getNullableType,
  GraphQLArgument,
  GraphQLDirective,
  GraphQLEnumType,
  GraphQLField,
  GraphQLInputField,
  GraphQLInputObjectType,
  GraphQLInterfaceType,
  GraphQLList,
  GraphQLNamedType,
  GraphQLNonNull,
  GraphQLObjectType,
  GraphQLScalarType,
  GraphQLSchema,
  GraphQLType,
  GraphQLUnionType,
  Kind,
  ValueNode,
} from "https://esm.sh/graphql@16.6.0";
import * as path from "https://deno.land/std@0.161.0/path/mod.ts";
import { partition } from "https://deno.land/std@0.162.0/collections/partition.ts";
import jen from "https://raw.githubusercontent.com/ssttevee/deno-jen/d551218b35e530bec1bda87bab4a0d4b923daa13/mod.ts";
import { pascalCase } from "https://deno.land/x/case@2.1.1/mod.ts";
import { format } from "./utils/format.ts";
import { RequiredPackages } from "./utils/packages.ts";
import { renderSymbolReference, SymbolReference } from "./utils/reference.ts";

function compareEntryKey(
  [a]: [string, ...any[]],
  [b]: [string, ...any[]],
): number {
  return a.localeCompare(b);
}

function compareName<T extends { name: string }>(
  { name: a }: T,
  { name: b }: T,
): number {
  return a.localeCompare(b);
}

function isPrimitiveType(type: GraphQLNamedType) {
  switch (type.name) {
    case "ID":
    case "Int":
    case "Float":
    case "String":
    case "Boolean":
      return true;
  }

  return false;
}

function importAlias(line: string): string {
  const pos = line.indexOf(" as ");
  if (pos === -1) {
    return "";
  }

  return line.slice(pos + 4);
}

function renderImports(
  base: string,
  imports: Array<[string, Set<string>]>,
  aliases: Record<string, string>,
): jen.Expr {
  return jen.statements(
    ...imports.map(([pkg, symbols]) =>
      jen.import.obj(
        ...Array.from(symbols)
          .sort((a, b) => a.localeCompare(b) || importAlias(a).localeCompare(importAlias(b)))
          .map((symbol) => symbol in aliases ? jen.id(aliases[symbol]).as.id(symbol) : jen.id(symbol)),
      ).from.lit(pkg.startsWith("/") ? path.relative(base, pkg) : pkg)
    ),
  );
}

function isBuiltInDirective(name: string): boolean {
  // https://spec.graphql.org/draft/#sec-Type-System.Directives.Built-in-Directives
  switch (name) {
    case "deprecated":
    case "skip":
    case "include":
    case "specifiedBy":
      return true;
  }

  return false;
}

function truthify<T>(arr: Array<T | undefined | null | 0 | false | "">): T[] {
  return arr.filter(Boolean) as T[];
}

interface InterfaceImplementors {
  interface: GraphQLInterfaceType;
  implementors: GraphQLObjectType[];
}

export interface GenerateOptions {
  scalarsInfo?: Awaited<ReturnType<typeof import("./scalars.ts").parse>>;
  fieldDirectivesInfo?: Awaited<ReturnType<typeof import("./resolvers.ts").parseTypeResolvers>>;
  inputDirectivesInfo?: Awaited<ReturnType<typeof import("./resolvers.ts").parseTypeResolvers>>;
  resolversInfo?: Awaited<ReturnType<typeof import("./resolvers.ts").parse>>;
  subscribersInfo?: Awaited<ReturnType<typeof import("./resolvers.ts").parseTypeResolvers>>;
  graphqlModuleSpecifier?: string;
}

interface TypeRenderContext {
  implementors: InterfaceImplementors;
  inputFieldDirectives: Record<string, Record<string, string[]>>;
}

class SchemaGenerator {
  private _pkgs: RequiredPackages;

  private _scalarsInfo: Exclude<GenerateOptions["scalarsInfo"], undefined>;
  private _fieldDirectivesInfo: Exclude<GenerateOptions["fieldDirectivesInfo"], undefined>;
  private _inputDirectivesInfo: Exclude<GenerateOptions["inputDirectivesInfo"], undefined>;
  private _resolversInfo: Exclude<GenerateOptions["resolversInfo"], undefined>;
  private _subscribersInfo: Exclude<GenerateOptions["subscribersInfo"], undefined>;
  private _graphqlModuleSpecifier: string;

  private constructor(options: GenerateOptions = {}) {
    this._scalarsInfo = options.scalarsInfo ?? {};
    this._fieldDirectivesInfo = options.fieldDirectivesInfo ?? {};
    this._inputDirectivesInfo = options.inputDirectivesInfo ?? {};
    this._resolversInfo = options.resolversInfo ?? {};
    this._subscribersInfo = options.subscribersInfo ?? {};
    this._graphqlModuleSpecifier = options.graphqlModuleSpecifier ?? "graphql";
    this._pkgs = new RequiredPackages();
  }

  private _gql(name: string): jen.Expr {
    return jen.id(this._pkgs.addRequires(this._graphqlModuleSpecifier, name));
  }

  private _renderGraphQLTypeIdentifier(
    type: GraphQLType | GraphQLDirective,
  ): jen.Expr {
    if (type instanceof GraphQLNonNull) {
      return jen.new.add(this._gql("GraphQLNonNull")).params(this._renderGraphQLTypeIdentifier(type.ofType));
    }

    if (type instanceof GraphQLList) {
      return jen.new.add(this._gql("GraphQLList")).params(this._renderGraphQLTypeIdentifier(type.ofType));
    }

    if (type instanceof GraphQLScalarType) {
      if (isPrimitiveType(type)) {
        return this._gql("GraphQL" + type.name);
      }

      return jen.id("_" + type.name + "Scalar");
    }

    return jen.id(
      type.name + (type instanceof GraphQLEnumType ? "Enum" : type instanceof GraphQLDirective ? "Directive" : "Type"),
    );
  }

  private _renderArgumentsObject(
    args: ReadonlyArray<GraphQLArgument>,
  ): jen.Expr {
    return jen.obj(
      ...Array.from(args)
        .sort(compareName)
        .map((arg: GraphQLArgument & { defaultValue?: any }) =>
          jen.prop(
            arg.name,
            jen.obj(
              jen.prop("type", this._renderGraphQLTypeIdentifier(arg.type)),
              ...truthify([
                arg.description && jen.prop("description", jen.lit(arg.description)),
                arg.defaultValue && jen.prop("defaultValue", jen.lit(arg.defaultValue)),
                arg.deprecationReason && jen.prop("deprecationReason", jen.lit(arg.deprecationReason)),
              ]),
            ),
          )
        ),
    );
  }

  private _renderValueNode(node: ValueNode): jen.Expr {
    switch (node.kind) {
      case Kind.ENUM:
      case Kind.STRING:
      case Kind.BOOLEAN:
        return jen.lit(node.value);

      case Kind.INT:
      case Kind.FLOAT:
        return jen.id(node.value);

      case Kind.NULL:
        return jen.null;

      case Kind.LIST:
        return jen.array(...node.values.map((v) => this._renderValueNode(v)));

      case Kind.OBJECT:
        return jen.obj(
          ...node.fields.map((f) => jen.prop(f.name.value, this._renderValueNode(f.value))),
        );
    }

    throw new Error(`unexpected value kind: ${node.kind}`);
  }

  private _renderArgumentNodes(nodes: readonly ConstArgumentNode[] | undefined): jen.Expr {
    return jen.obj(
      ...Array.from(
        nodes ?? [],
        (arg) => jen.prop(arg.name.value, this._renderValueNode(arg.value)),
      ),
    );
  }

  private _renderFieldObject(
    type: GraphQLObjectType | GraphQLInterfaceType | GraphQLInputObjectType,
    f:
      & (GraphQLInputField | GraphQLField<any, any>)
      & Partial<Pick<GraphQLField<any, any>, "args">>
      & { defaultValue?: any },
    inputFieldDirectives: Record<string, Record<string, string[]>>,
  ): jen.Expr {
    let resolver = this._resolversInfo[type.name]?.[f.name];
    if (type instanceof GraphQLObjectType && !resolver) {
      // try to find resolver in interface in the declaration order
      for (const iface of type.getInterfaces()) {
        if ((resolver = this._resolversInfo[iface.name]?.[f.name])) {
          break;
        }
      }
    }

    let resolveFn = resolver && renderSymbolReference(this._pkgs, resolver);
    if (f.astNode?.directives?.length) {
      // apply directives in reverse order
      for (const directive of Array.from(f.astNode.directives).reverse()) {
        const ref = this._fieldDirectivesInfo[directive.name.value];
        if (!ref) {
          continue;
        }

        if (!resolveFn) {
          resolveFn = jen.arrow(jen.id("source").op(":").any).id("source").dot(f.name);
        }

        resolveFn = renderSymbolReference(this._pkgs, ref).call(
          resolveFn,
          this._renderArgumentNodes(directive.arguments),
        );
      }
    }

    if (resolveFn) {
      // args probably don't need to be transformed if there's no resolver
      const argsWithDirectives = truthify(
        f.args?.map((arg) => this._findInputDirectiveInfoFromArgOrField(arg, inputFieldDirectives)) ?? [],
      );
      if (type.name === "Mutation" && f.name === "inviteMembers") {
        console.log(f.args?.map((arg) => arg.astNode));
      }
      if (argsWithDirectives.length) {
        resolveFn = jen.parens(
          jen.params(jen.prop("next", this._gql("GraphQLFieldResolver").types(jen.any, jen.any))).op(":")
            .add(this._gql("GraphQLFieldResolver"))
            .types(jen.any, jen.any, jen.id(type.name).dot(pascalCase(f.name + "_args")))
            .op("=>").arrow(jen.id("source"), jen.id("args"), jen.id("context"), jen.id("info")).id("next").call(
              jen.id("source"),
              this._renderInputFieldsWithDirectives(
                jen.id("args"),
                argsWithDirectives,
                argsWithDirectives.length < f.args!.length,
              ),
              jen.id("context"),
              jen.id("info"),
            ),
        ).call(resolveFn);
      }
    }

    // NOTE: The way subscribers work in the graphql-js is by calling `subscribe` on the top level fields (and only on
    //       Subscription), and then calling `resolve` on the nested fields. This means that subscribers only need to be
    //       defined on `Query`.
    //
    //       In theory, an alternate implementation could be created to call `subscribe` at every level, but considering
    //       how subscribe functions work, it would be unclear how it would make sense.
    //
    //       If you ever need such functionality, please open an issue and it can be discussed.
    //
    //       @see https://github.com/graphql/graphql-js/blob/e9a81f2ba9020ec5fd0f67f5553ccabe392e95e8/src/execution/execute.ts#L1645
    const subscriber = type.name === "Subscription" ? this._subscribersInfo[f.name] : undefined;

    return jen.obj(
      jen.prop("type", this._renderGraphQLTypeIdentifier(f.type)),
      ...truthify([
        f.args?.length && jen.prop("args", this._renderArgumentsObject(f.args)),
        f.defaultValue && jen.prop("defaultValue", jen.lit(f.defaultValue)),
        f.description && jen.prop("description", jen.lit(f.description)),
        f.deprecationReason && jen.prop("deprecationReason", jen.lit(f.deprecationReason)),

        // NOTE: Resolver functions on interface definitions are not used by the default graphql-js
        //       executor implementation, but nonetheless accessible by a potential alternate implementation.
        resolveFn && jen.prop("resolve", resolveFn),
        subscriber && jen.prop("subscribe", renderSymbolReference(this._pkgs, subscriber)),
      ]),
    );
  }

  private _renderFieldsThunk(
    type: GraphQLObjectType | GraphQLInterfaceType | GraphQLInputObjectType,
    inputFieldDirectives: Record<string, Record<string, string[]>>,
  ): jen.Expr {
    return jen.arrow().parens(jen.obj(
      ...Object.values(type.getFields())
        .sort(compareName)
        .map((field) => jen.prop(field.name, this._renderFieldObject(type, field, inputFieldDirectives))),
    ));
  }

  private _renderOptionalGraphQLTypeType(
    type: GraphQLType,
  ): jen.Expr {
    if (type instanceof GraphQLNonNull) {
      return this._renderGraphQLTypeType(type);
    }

    return jen.union(
      this._renderGraphQLTypeType(type),
      jen.undefined,
    );
  }

  private _deriveGraphQLTypeName(
    type:
      | GraphQLEnumType
      | GraphQLScalarType
      | GraphQLObjectType
      | GraphQLInputObjectType
      | GraphQLUnionType
      | GraphQLInterfaceType,
  ) {
    if (type instanceof GraphQLScalarType) {
      const scalarType = this._findScalarType(type);
      if (scalarType) {
        return scalarType;
      }

      switch (type.name) {
        case "ID":
          return "ID";

        case "Int":
        case "Float":
          return "number";

        case "String":
          return "string";

        case "Boolean":
          return "boolean";
      }

      return "unknown";
    }

    if (type instanceof GraphQLEnumType) {
      return "E" + type.name;
    }

    return type.name;
  }

  private _scalarTypeTypeCache: Record<string, string | undefined> = {};

  private _findScalarType(type: GraphQLScalarType): string | undefined {
    if (type.name in this._scalarTypeTypeCache) {
      return this._scalarTypeTypeCache[type.name];
    }

    let returnType: string | undefined;
    const info = this._scalarsInfo[type.name];
    if (info?.type) {
      if (info.type.module) {
        returnType = this._pkgs.addRequires(info.type.module, info.type.symbol);
      }

      returnType = info.type.symbol;
    }

    if (!returnType) {
      console.log("WARNING: Could not determine scalar " + type.name + " type from parseValue or parseLiteral");
    }

    return (this._scalarTypeTypeCache[type.name] = returnType);
  }

  private _renderGraphQLTypeType(
    type: GraphQLType,
  ): jen.Expr {
    if (type instanceof GraphQLNonNull) {
      return this._renderGraphQLTypeType(type.ofType);
    }

    if (type instanceof GraphQLList) {
      return jen.id("Array").types(this._renderOptionalGraphQLTypeType(type.ofType));
    }

    if (type instanceof GraphQLDirective) {
      throw new Error("unexpected directive type " + type.name);
    }

    return jen.id(this._deriveGraphQLTypeName(type));
  }

  private _renderTypeInterface(
    type: GraphQLObjectType | GraphQLInterfaceType,
  ): jen.Expr {
    return jen.interface.add(
      this._renderGraphQLTypeType(type),
    ).block(
      ...Object.values(type.getFields())
        .sort(compareName)
        .map((field) =>
          jen.prop(
            jen.id(field.name).op("?"),
            this._renderGraphQLTypeType(field.type),
          )
        ),
    );
  }

  private _renderGraphQLObjectType(
    type: GraphQLObjectType,
    { inputFieldDirectives }: TypeRenderContext,
  ): [jen.Expr, ...jen.Expr[]] {
    const typeInterfaces = type.getInterfaces();
    const fieldsWithArgs = Object.values(type.getFields())
      .filter((field) => field.args.length)
      .sort(compareName);

    return [
      jen.new.add(this._gql("GraphQLObjectType")).call(
        jen.obj(
          jen.prop("name", jen.lit(type.name)),
          jen.prop("fields", this._renderFieldsThunk(type, inputFieldDirectives)),
          ...truthify([
            type.description && jen.prop("description", jen.lit(type.description)),
            typeInterfaces.length && jen.prop(
              "interfaces",
              jen.arrow().arr(
                // do not sort interfaces, the declaration order may be important
                ...typeInterfaces.map(
                  this._renderGraphQLTypeIdentifier,
                  this,
                ),
              ),
            ),
          ]),
        ),
      ).as.add(this._gql("GraphQLObjectType")),
      jen.export.add(this._renderTypeInterface(type)),
      ...(fieldsWithArgs.length
        ? [
          jen.export.namespace.add(this._renderGraphQLTypeType(type)).block(
            ...fieldsWithArgs.map((field) =>
              jen.export.interface.id(pascalCase(field.name + "_args")).block(
                ...Array.from(field.args)
                  .sort(compareName)
                  .map((arg) =>
                    jen.prop(
                      arg.name,
                      this._renderOptionalGraphQLTypeType(
                        arg.type,
                      ),
                    )
                  ),
              )
            ),
          ),
        ]
        : []),
    ];
  }

  private _renderGraphQLScalarType(
    type: GraphQLScalarType,
  ): [jen.Expr, ...jen.Expr[]] {
    const s = this._scalarsInfo[type.name];
    return [
      jen.new.add(this._gql("GraphQLScalarType")).call(
        jen.obj(
          jen.prop("name", jen.lit(type.name)),
          ...truthify([
            type.description && jen.prop("description", jen.lit(type.description)),
            s?.serializeFunc && jen.prop("serialize", renderSymbolReference(this._pkgs, s.serializeFunc)),
            s?.parseValueFunc && jen.prop("parseValue", renderSymbolReference(this._pkgs, s.parseValueFunc)),
            s?.parseLiteralFunc && jen.prop("parseLiteral", renderSymbolReference(this._pkgs, s.parseLiteralFunc)),
          ]),
        ),
      ),
    ];
  }

  private _renderTypeResolverAndCastFunctions(
    type: { name: string },
    subTypes: readonly GraphQLObjectType[],
    prefix: string,
  ): [jen.Expr, jen.Expr[]] {
    const sortedSubTypes = Array.from(subTypes).sort(compareName);
    return [
      jen.arrow(jen.prop("v", jen.any)).block(
        jen.switch(jen.id("v").computed(jen.id(prefix + "Symbol_" + type.name))).block(
          ...sortedSubTypes.map((subType) =>
            jen.case(jen.id(prefix + "TypeSymbol_" + subType.name + "_" + type.name)).return(
              jen.lit(subType.name),
            )
          ),
        ),
        jen.return(jen.id("v").dot("__typename")),
      ),
      [
        jen.const.id(prefix + "Symbol_" + type.name).op("=").id("Symbol").call(jen.lit(type.name + " type")),
        ...sortedSubTypes.map((subType) =>
          jen.const.id(prefix + "TypeSymbol_" + subType.name + "_" + type.name).op("=").id("Symbol").call(
            jen.lit(subType.name + " " + type.name),
          )
        ),
        ...sortedSubTypes.map((subType) =>
          jen.export.const.id("as" + subType.name + type.name).op("=").types(jen.id("T")).params(
            jen.prop("v", jen.any),
          ).op(":").intersect(
            jen.id("T"),
            jen.obj(jen.prop(jen.computed(jen.id(prefix + "Symbol_" + type.name)), jen.symbol)),
          ).op(
            "=>",
          )
            .parens(
              jen.obj(
                jen.spread(jen.id("v")),
                jen.prop(
                  jen.computed(jen.id(prefix + "Symbol_" + type.name)),
                  jen.id(prefix + "TypeSymbol_" + subType.name + "_" + type.name),
                ),
              ),
            )
        ),
      ],
    ];
  }

  private _renderGraphQLInterfaceType(
    type: GraphQLInterfaceType,
    { implementors: { implementors }, inputFieldDirectives }: TypeRenderContext,
  ): [jen.Expr, ...jen.Expr[]] {
    const [resolver, castFns] = this._renderTypeResolverAndCastFunctions(type, implementors, "interface");
    return [
      jen.new.add(this._gql("GraphQLInterfaceType")).call(
        jen.obj(
          jen.prop("name", jen.lit(type.name)),
          jen.prop("resolveType", resolver),
          jen.prop("fields", this._renderFieldsThunk(type, inputFieldDirectives)),
          ...truthify([
            type.description && jen.prop("description", jen.lit(type.description)),
          ]),
        ),
      ).as.add(this._gql("GraphQLInterfaceType")),
      jen.export.add(this._renderTypeInterface(type)),
      ...castFns,
    ];
  }

  private _renderGraphQLUnionType(
    type: GraphQLUnionType,
  ): [jen.Expr, ...jen.Expr[]] {
    const [resolver, castFns] = this._renderTypeResolverAndCastFunctions(type, type.getTypes(), "interface");

    return [
      jen.new.add(this._gql("GraphQLUnionType")).call(
        jen.obj(
          jen.prop("name", jen.lit(type.name)),
          jen.prop("resolveType", resolver),
          jen.prop(
            "types",
            jen.arrow().array(...type.getTypes().map((type) => this._renderGraphQLTypeIdentifier(type))),
          ),
          ...truthify([
            type.description && jen.prop("description", jen.lit(type.description)),
          ]),
        ),
      ),
      jen.export.type.add(this._renderGraphQLTypeType(type)).op("=").union(
        ...Array.from(type.getTypes()).sort(compareName).map(this._renderGraphQLTypeType, this),
      ),
      ...castFns,
    ];
  }

  private _findInputDirectiveInfoFromArgOrField(
    field: GraphQLArgument | GraphQLInputField,
    inputFieldDirectives: Record<string, Record<string, string[]>>,
  ) {
    const fieldTypeName = getNamedType(field.type).name;
    let transform: SymbolReference | undefined;
    if (inputFieldDirectives[fieldTypeName] && Object.keys(inputFieldDirectives[fieldTypeName]).length) {
      transform = {
        symbol: "transform" + fieldTypeName,
      };
    }

    if (field.astNode?.directives?.length) {
      const directives = field.astNode.directives.flatMap((directive) => {
        const ref = this._inputDirectivesInfo[directive.name.value];
        if (!ref) {
          return [];
        }

        return [{ ref, args: directive.arguments }];
      });

      if (directives.length) {
        return { field, directives: directives, transform };
      }
    }

    if (transform) {
      return { field, directives: [], transform };
    }
  }

  private _renderInputFieldsWithDirectives(
    valueExpr: jen.Expr,
    fieldsWithDirectives: Exclude<ReturnType<typeof this._findInputDirectiveInfoFromArgOrField>, undefined>[],
    spread: boolean,
  ) {
    return jen.obj(
      ...truthify([
        spread && jen.spread(valueExpr),
      ]),
      ...fieldsWithDirectives.map(({ field, directives, transform }) => {
        const fieldExpr = valueExpr.dot(field.name);
        const nullableType = getNullableType(field.type);
        let transformedExpr: jen.Expr;
        if (nullableType instanceof GraphQLList) {
          transformedExpr = jen.id("elem");
        } else {
          transformedExpr = fieldExpr;
        }

        if (transform) {
          transformedExpr = renderSymbolReference(this._pkgs, transform).call(transformedExpr);
        }

        for (const { ref, args } of directives) {
          transformedExpr = renderSymbolReference(this._pkgs, ref).call(
            transformedExpr,
            this._renderArgumentNodes(args),
          );
        }

        if (nullableType instanceof GraphQLList) {
          transformedExpr = jen.id("Array").dot("from").call(
            valueExpr.dot(field.name),
            jen.arrow(jen.id("elem")).add(transformedExpr),
          );

          if (!(field.type instanceof GraphQLNonNull)) {
            transformedExpr = jen.cond(
              valueExpr.dot(field.name).op("===").null.op("||").add(valueExpr).dot(field.name).op("===").undefined,
              jen.undefined,
              transformedExpr,
            );
          }
        }

        return jen.prop(field.name, transformedExpr);
      }),
    );
  }

  private _renderGraphQLInputObjectType(
    type: GraphQLInputObjectType,
    { inputFieldDirectives }: TypeRenderContext,
  ): [jen.Expr, ...jen.Expr[]] {
    const fieldsWithDirectives = truthify(
      Object.values(type.getFields())
        .map((f) => this._findInputDirectiveInfoFromArgOrField(f, inputFieldDirectives)),
    );

    return [
      jen.new.add(this._gql("GraphQLInputObjectType")).call(
        jen.obj(
          jen.prop("name", jen.lit(type.name)),
          jen.prop("fields", this._renderFieldsThunk(type, inputFieldDirectives)),
          ...truthify([
            type.description && jen.prop("description", jen.lit(type.description)),
          ]),
        ),
      ),
      jen.export.interface.add(this._renderGraphQLTypeType(type)).block(
        ...Object.values(type.getFields())
          .sort(compareName)
          .map((field) => jen.prop(field.name, this._renderOptionalGraphQLTypeType(field.type))),
      ),
      ...truthify([
        fieldsWithDirectives.length &&
        jen.const.id("transform" + this._deriveGraphQLTypeName(type)).op("=").types(
          jen.id("T").extends.union(jen.id(type.name), jen.undefined),
        ).params(
          jen.prop("v", jen.id("T")),
        )
          .op(":").id("T").op("=>").parens(
            jen.id("v").op("&&").add(this._renderInputFieldsWithDirectives(
              jen.id("v"),
              fieldsWithDirectives,
              fieldsWithDirectives.length < Object.keys(type.getFields()).length,
            )),
          ),
      ]),
    ];
  }

  private _renderGraphQLEnumType(type: GraphQLEnumType): [jen.Expr, ...jen.Expr[]] {
    const sortedValues = Array.from(type.getValues()).sort(compareName);

    return [
      jen.new.add(this._gql("GraphQLEnumType")).call(
        jen.obj(
          jen.prop("name", jen.lit(type.name)),
          jen.prop(
            "values",
            jen.obj(
              ...sortedValues.map(
                (e) =>
                  jen.prop(
                    e.name,
                    jen.obj(
                      jen.prop("value", jen.lit(e.value)),
                      ...truthify([
                        e.description && jen.prop("description", jen.lit(e.description)),
                        e.deprecationReason && jen.prop("deprecationReason", jen.lit(e.deprecationReason)),
                      ]),
                    ),
                  ),
              ),
            ),
          ),
          ...truthify([
            type.description && jen.prop("description", jen.lit(type.description)),
          ]),
        ),
      ),
      jen.export.enum.add(this._renderGraphQLTypeType(type)).obj(
        ...sortedValues.map(({ name }) => jen.id(name).op("=").lit(name)),
      ),
      jen.export.function(
        jen.id("is" + this._deriveGraphQLTypeName(type)),
        jen.prop("v", jen.id("any")),
      ).op(":").id("v").is.add(this._renderGraphQLTypeType(type)).block(
        jen.return(jen.id("v").in.add(this._renderGraphQLTypeType(type))),
      ),
    ];
  }

  private _renderGraphQLType(
    type: GraphQLType,
    interfaces: Record<string, InterfaceImplementors>,
    inputFieldDirectives: Record<string, Record<string, string[]>>,
  ): jen.Expr {
    const renderFn = (
      type instanceof GraphQLObjectType
        ? this._renderGraphQLObjectType
        : type instanceof GraphQLScalarType
        ? this._renderGraphQLScalarType
        : type instanceof GraphQLInterfaceType
        ? this._renderGraphQLInterfaceType
        : type instanceof GraphQLUnionType
        ? this._renderGraphQLUnionType
        : type instanceof GraphQLInputObjectType
        ? this._renderGraphQLInputObjectType
        : type instanceof GraphQLEnumType
        ? this._renderGraphQLEnumType
        : undefined
    );

    if (!renderFn) {
      throw new Error("unhandled type: " + type.toString());
    }

    const [typeValue, ...extra] = (renderFn as any as (
      type: GraphQLType,
      ctx: TypeRenderContext,
    ) => jen.Expr[]).call(
      this,
      type,
      {
        implementors: interfaces[(type as { name: string }).name],
        inputFieldDirectives,
      },
    );
    return jen.statements(
      jen.const.add(this._renderGraphQLTypeIdentifier(type)).op("=").add(typeValue),
      ...extra,
    );
  }

  private _renderGraphQLDirective(directive: GraphQLDirective): jen.Expr {
    return jen.statements(
      jen.const.add(this._renderGraphQLTypeIdentifier(directive)).op("=").new.add(this._gql("GraphQLDirective"))
        .call(
          jen.obj(
            jen.prop("name", jen.lit(directive.name)),
            jen.prop(
              "locations",
              jen.array(
                ...Array.from(directive.locations).sort().map((location) =>
                  jen.add(this._gql("DirectiveLocation")).dot(location)
                ),
              ),
            ),
            jen.prop("args", this._renderArgumentsObject(directive.args)),
            ...truthify([
              directive.description && jen.prop("description", jen.lit(directive.description)),
              directive.isRepeatable && jen.prop("isRepeatable", jen.true),
            ]),
          ),
        ),
      ...truthify([
        directive.args.length && jen.export.interface.id(pascalCase(directive.name + "_directive_args")).block(
          ...directive.args.map((arg) =>
            jen.prop(
              jen.id(arg.name).add(
                ...truthify([
                  !(arg.type instanceof GraphQLNonNull) && jen.op("?"),
                ]),
              ),
              this._renderGraphQLTypeType(arg.type),
            )
          ),
        ),
      ]),
    );
  }

  public static renderSchema(
    schema: GraphQLSchema,
    outfile: string,
    options: GenerateOptions = {},
  ): jen.Expr {
    if (options.fieldDirectivesInfo) {
      const names = new Set(Object.keys(options.fieldDirectivesInfo));
      for (const directive of schema.getDirectives()) {
        if (
          isBuiltInDirective(directive.name) ||
          directive.locations.every((loc) => loc !== DirectiveLocation.FIELD_DEFINITION) ||
          names.has(directive.name)
        ) {
          continue;
        }

        console.log(`WARNING: missing directive function for ${JSON.stringify(directive.name)}`);
      }
    }

    const types = Object.entries(schema.getTypeMap())
      .sort(compareEntryKey)
      .filter(([, type]) => !type.name.startsWith("__") && !isPrimitiveType(type))
      .map(([, type]) => type);

    const inputFieldDirectives: Record<string, Record<string, string[]>> = {};
    if (options.inputDirectivesInfo) {
      // input field directives not needed if the module was not specified
      let typesWithObjectFields = new Array<[string, string, string]>();
      for (const type of types) {
        if (!(type instanceof GraphQLInputObjectType)) {
          continue;
        }

        for (const field of Object.values(type.getFields())) {
          if (getNamedType(field.type) instanceof GraphQLInputObjectType) {
            typesWithObjectFields.push([type.name, field.name, getNamedType(field.type).name]);
          }

          const directives = field.astNode?.directives;
          if (!directives) {
            continue;
          }

          for (const directive of directives) {
            const name = directive.name.value;
            if (!options.inputDirectivesInfo[name]) {
              continue;
            }

            const fieldDirectives = inputFieldDirectives[type.name] ?? (inputFieldDirectives[type.name] = {});
            const fieldDirective = fieldDirectives[field.name] ?? (fieldDirectives[field.name] = []);
            fieldDirective.push(name);
          }
        }
      }

      for (let changes = 1; changes; changes = 0) {
        const newTypesWithObjectFields = new Array<[string, string, string]>();
        for (const [typeName, fieldName, objectTypeName] of typesWithObjectFields) {
          console.log(`checking ${typeName}.${fieldName} for ${objectTypeName}`);
          if (inputFieldDirectives[objectTypeName]) {
            inputFieldDirectives[typeName] = { ...inputFieldDirectives[typeName], [fieldName]: [] };
            changes += 1;
          } else {
            newTypesWithObjectFields.push([typeName, fieldName, objectTypeName]);
          }
        }

        typesWithObjectFields = newTypesWithObjectFields;
      }

      console.log(inputFieldDirectives["InviteMembersInput"], inputFieldDirectives["MemberInvitationInput"]);
    }

    const interfaces: Record<string, InterfaceImplementors> = {};
    for (const type of types) {
      if (!(type instanceof GraphQLObjectType)) {
        continue;
      }

      for (const iface of type.getInterfaces()) {
        if (!(iface.name in interfaces)) {
          interfaces[iface.name] = {
            interface: iface,
            implementors: [],
          };
        }

        interfaces[iface.name].implementors.push(type);
      }
    }

    const generator = new SchemaGenerator(options);

    const base = outfile.startsWith("/") ? outfile : path.join(Deno.cwd(), outfile);

    const statements = [
      ...[
        ...types
          .map((
            type,
          ): [string, jen.Expr] => [type.name, generator._renderGraphQLType(type, interfaces, inputFieldDirectives)])
          .sort(compareEntryKey),

        ...schema.getDirectives()
          .filter((d) => !isBuiltInDirective(d.name))
          .map((directive): [string, jen.Expr] => [directive.name, generator._renderGraphQLDirective(directive)])
          .sort(compareEntryKey),
      ].map(([, expr]) => expr),

      jen.const.id("schema").op("=").new.add(generator._gql("GraphQLSchema")).call(jen.obj(
        ...(schema.getQueryType()
          ? [jen.prop("query", generator._renderGraphQLTypeIdentifier(schema.getQueryType()!))]
          : []),
        ...(schema.getMutationType()
          ? [jen.prop("mutation", generator._renderGraphQLTypeIdentifier(schema.getMutationType()!))]
          : []),
        ...(schema.getSubscriptionType()
          ? [jen.prop("subscription", generator._renderGraphQLTypeIdentifier(schema.getSubscriptionType()!))]
          : []),
        jen.prop("types", jen.array(...types.map((type) => generator._renderGraphQLTypeIdentifier(type)))),
        jen.prop(
          "directives",
          jen.array(
            ...Array.from(schema.getDirectives())
              .filter((d) => !isBuiltInDirective(d.name))
              .map((d) => generator._renderGraphQLTypeIdentifier(d)),
          ),
        ),
      )),
    ];

    const [localImports, externalImports] = partition(
      Object.entries(generator._pkgs.requires),
      ([pkg]) => pkg.startsWith("/"),
    );

    return jen.statements(
      renderImports(path.dirname(base), externalImports, generator._pkgs.aliases),
      renderImports(path.dirname(base), localImports, generator._pkgs.aliases),
      ...statements,
      jen.export.default.id("schema"),
    );
  }
}

export function generate(
  schema: GraphQLSchema,
  outfile: string,
  options: GenerateOptions = {},
) {
  return format(SchemaGenerator.renderSchema(schema, outfile, options).toString());
}
