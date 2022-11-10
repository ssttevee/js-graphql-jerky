import {
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
} from "https://esm.sh/graphql@16.6.0";
import * as path from "https://deno.land/std@0.161.0/path/mod.ts";
import { partition } from "https://deno.land/std@0.162.0/collections/partition.ts";
import jen from "https://raw.githubusercontent.com/ssttevee/deno-jen/d551218b35e530bec1bda87bab4a0d4b923daa13/mod.ts";
import { pascalCase } from "https://deno.land/x/case@2.1.1/mod.ts";
import { format } from "./utils/format.ts";
import { RequiredPackages } from "./utils/packages.ts";
import { renderSymbolReference } from "./utils/reference.ts";

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

function renderProp<T>(
  obj: T,
  key: keyof T,
  fn: (value: any) => jen.Expr = jen.lit as any,
  thisArg: any = {},
): jen.Expr[] {
  if (obj[key] === undefined || (Array.isArray(obj[key]) && !(obj[key] as any as unknown[]).length)) {
    return [];
  }

  return [jen.prop(key as string, fn.call(thisArg, obj[key] as any))];
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

interface InterfaceImplementors {
  interface: GraphQLInterfaceType;
  implementors: GraphQLObjectType[];
}

interface GenerateOptions {
  scalarsInfo?: Awaited<ReturnType<typeof import("./scalars.ts").parse>>;
  resolversInfo?: Awaited<ReturnType<typeof import("./resolvers.ts").parse>>;
  subscribersInfo?: Awaited<ReturnType<typeof import("./resolvers.ts").parseTypeResolvers>>;
  graphqlModuleSpecifier?: string;
}

class SchemaGenerator {
  private _pkgs: RequiredPackages;

  private _scalarsInfo: Exclude<GenerateOptions["scalarsInfo"], undefined>;
  private _resolversInfo: Exclude<GenerateOptions["resolversInfo"], undefined>;
  private _subscribersInfo: Exclude<GenerateOptions["subscribersInfo"], undefined>;
  private _graphqlModuleSpecifier: string;

  private constructor(options: GenerateOptions = {}) {
    this._scalarsInfo = options.scalarsInfo ?? {};
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
        .map((arg) =>
          jen.prop(
            arg.name,
            jen.obj(
              jen.prop("type", this._renderGraphQLTypeIdentifier(arg.type)),
              ...renderProp(arg, "description"),
              ...renderProp(arg, "defaultValue"),
              ...renderProp(arg, "deprecationReason"),
            ),
          )
        ),
    );
  }

  private _renderFieldObject(
    type: GraphQLObjectType | GraphQLInterfaceType | GraphQLInputObjectType,
    f: GraphQLInputField | GraphQLField<any, any>,
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
      ...renderProp(f as GraphQLField<any, any>, "args", this._renderArgumentsObject, this),
      ...renderProp(f as GraphQLInputField, "defaultValue"),
      ...renderProp(f, "description"),
      ...renderProp(f, "deprecationReason"),
      // NOTE: Resolver functions on interface definitions are not used by the default graphql-js
      //       executor implementation, but nonetheless accessible by a potential alternate implementation.
      ...(
        (!(type instanceof GraphQLInputObjectType) && resolver)
          ? [
            jen.prop("resolve", renderSymbolReference(this._pkgs, resolver)),
          ]
          : []
      ),
      ...(
        subscriber
          ? [
            jen.prop("subscribe", renderSymbolReference(this._pkgs, subscriber)),
          ]
          : []
      ),
    );
  }

  private _renderFieldsThunk(
    type: GraphQLObjectType | GraphQLInterfaceType | GraphQLInputObjectType,
  ): jen.Expr {
    return jen.arrow().parens(jen.obj(
      ...Object.values(type.getFields())
        .sort(compareName)
        .map((field) => jen.prop(field.name, this._renderFieldObject(type, field))),
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
  ): [jen.Expr, ...jen.Expr[]] {
    const typeInterfaces = type.getInterfaces();
    const fieldsWithArgs = Object.values(type.getFields())
      .filter((field) => field.args.length)
      .sort(compareName);

    return [
      jen.new.add(this._gql("GraphQLObjectType")).call(
        jen.obj(
          ...renderProp(type, "name"),
          ...renderProp(type, "description"),
          jen.prop("fields", this._renderFieldsThunk(type)),
          ...(
            typeInterfaces.length
              ? [
                jen.prop(
                  "interfaces",
                  jen.arrow().arr(
                    // do not sort interfaces, the declaration order may be important
                    ...typeInterfaces.map(
                      this._renderGraphQLTypeIdentifier,
                      this,
                    ),
                  ),
                ),
              ]
              : []
          ),
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
    const info = this._scalarsInfo[type.name];
    return [
      jen.new.add(this._gql("GraphQLScalarType")).call(
        jen.obj(
          ...renderProp(type, "name"),
          ...renderProp(type, "description"),
          ...(
            info?.serializeFunc
              ? [
                jen.prop("serialize", renderSymbolReference(this._pkgs, info.serializeFunc)),
              ]
              : []
          ),
          ...(
            info?.parseValueFunc
              ? [
                jen.prop("parseValue", renderSymbolReference(this._pkgs, info.parseValueFunc)),
              ]
              : []
          ),
          ...(
            info?.parseLiteralFunc
              ? [
                jen.prop("parseLiteral", renderSymbolReference(this._pkgs, info.parseLiteralFunc)),
              ]
              : []
          ),
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
    { implementors }: InterfaceImplementors,
  ): [jen.Expr, ...jen.Expr[]] {
    const [resolver, castFns] = this._renderTypeResolverAndCastFunctions(type, implementors, "interface");
    return [
      jen.new.add(this._gql("GraphQLInterfaceType")).call(
        jen.obj(
          ...renderProp(type, "name"),
          ...renderProp(type, "description"),
          jen.prop("resolveType", resolver),
          jen.prop("fields", this._renderFieldsThunk(type)),
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
          ...renderProp(type, "name"),
          ...renderProp(type, "description"),
          jen.prop("resolveType", resolver),
          jen.prop(
            "types",
            jen.arrow().array(...type.getTypes().map((type) => this._renderGraphQLTypeIdentifier(type))),
          ),
        ),
      ),
      jen.export.type.add(this._renderGraphQLTypeType(type)).op("=").union(
        ...Array.from(type.getTypes()).sort(compareName).map(this._renderGraphQLTypeType, this),
      ),
      ...castFns,
    ];
  }

  private _renderGraphQLInputObjectType(type: GraphQLInputObjectType): [jen.Expr, ...jen.Expr[]] {
    return [
      jen.new.add(this._gql("GraphQLInputObjectType")).call(
        jen.obj(
          ...renderProp(type, "name"),
          ...renderProp(type, "description"),
          jen.prop("fields", this._renderFieldsThunk(type)),
        ),
      ),
      jen.export.interface.add(this._renderGraphQLTypeType(type)).block(
        ...Object.values(type.getFields())
          .sort(compareName)
          .map((field) => jen.prop(field.name, this._renderOptionalGraphQLTypeType(field.type))),
      ),
    ];
  }

  private _renderGraphQLEnumType(type: GraphQLEnumType): [jen.Expr, ...jen.Expr[]] {
    const sortedValues = Array.from(type.getValues()).sort(compareName);

    return [
      jen.new.add(this._gql("GraphQLEnumType")).call(
        jen.obj(
          ...renderProp(type, "name"),
          ...renderProp(type, "description"),
          jen.prop(
            "values",
            jen.obj(
              ...sortedValues.map(
                ({ name, value }) =>
                  jen.prop(
                    name,
                    jen.obj(
                      jen.prop("value", jen.lit(value)),
                    ),
                  ),
              ),
            ),
          ),
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

  private _renderGraphQLType(type: GraphQLType, interfaces: Record<string, InterfaceImplementors>): jen.Expr {
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

    const [typeValue, ...extra] =
      (renderFn as any as (type: GraphQLType, interfaces?: InterfaceImplementors) => jen.Expr[]).call(
        this,
        type,
        interfaces[(type as { name: string }).name],
      );
    return jen.statements(
      jen.const.add(this._renderGraphQLTypeIdentifier(type)).op("=").add(typeValue),
      ...extra,
    );
  }

  private _renderGraphQLDirective(directive: GraphQLDirective): jen.Expr {
    return jen.const.add(this._renderGraphQLTypeIdentifier(directive)).op("=").new.add(this._gql("GraphQLDirective"))
      .call(
        jen.obj(
          ...renderProp(directive, "name"),
          ...renderProp(directive, "description"),
          jen.prop(
            "locations",
            jen.array(
              ...Array.from(directive.locations).sort().map((location) =>
                jen.add(this._gql("DirectiveLocation")).dot(location)
              ),
            ),
          ),
          jen.prop("args", this._renderArgumentsObject(directive.args)),
          ...renderProp(directive, "isRepeatable"),
        ),
      );
  }

  public static renderSchema(
    schema: GraphQLSchema,
    outfile: string,
    options: GenerateOptions = {},
  ): jen.Expr {
    const types = Object.entries(schema.getTypeMap())
      .sort(compareEntryKey)
      .filter(([, type]) => !type.name.startsWith("__") && !isPrimitiveType(type))
      .map(([, type]) => type);

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
          .map((type): [string, jen.Expr] => [type.name, generator._renderGraphQLType(type, interfaces)])
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
