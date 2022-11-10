import ts, { parseModule } from "../common/typescript.ts";
import { SymbolReference } from "../common/reference.ts";

type FunctionDeclaration = ts.MethodDeclaration | ts.FunctionExpression | ts.ArrowFunction;

export interface ScalarInfo {
  type?: SymbolReference;

  serializeFunc?: SymbolReference & { declaration: FunctionDeclaration };
  parseValueFunc?: SymbolReference & { declaration: FunctionDeclaration };
  parseLiteralFunc?: SymbolReference & { declaration: FunctionDeclaration };
}

function findFuncReturnType(
  decl: ts.MethodDeclaration | ts.FunctionExpression | ts.ArrowFunction,
  source: ts.SourceFile,
): SymbolReference | undefined {
  if (!decl.type) {
    return;
  }

  if (ts.isImportTypeNode(decl.type)) {
    if (decl.type.isTypeOf) {
      console.log("WARNING: typeof namespace import for scalar type is not supported");
      return;
    }

    const importType = decl.type;
    if (!importType.qualifier || !ts.isIdentifier(importType.qualifier)) {
      console.log("WARNING: namespace import for scalar type is not supported");
      return;
    }

    if (!ts.isLiteralTypeNode(importType.argument) || !ts.isStringLiteral(importType.argument.literal)) {
      // this is a grammar error, handling it is out of scope
      return;
    }

    return { module: importType.argument.literal.text, symbol: importType.qualifier.text };
  }

  if (ts.isTypeReferenceNode(decl.type)) {
    const typeName = decl.type.getText(source);
    if (!typeName) {
      return;
    }

    for (const statement of source.statements) {
      if (ts.isImportDeclaration(statement) && statement.importClause) {
        if (!statement.importClause.namedBindings) {
          continue;
        }

        if (!ts.isNamedImports(statement.importClause.namedBindings)) {
          // TODO: handle namespace imports (will need to check if `typeName` has a dot in it)
          continue;
        }

        for (const specifier of statement.importClause.namedBindings.elements ?? []) {
          if (specifier.name.text === typeName) {
            if (!ts.isStringLiteral(statement.moduleSpecifier)) {
              // this is a grammar error, handling it is out of scope
              continue;
            }

            return { module: statement.moduleSpecifier.text, symbol: typeName };
          }
        }
      }
    }

    // assume intrinsic or global type
    return { symbol: typeName };
  }

  if (ts.isTokenKind(decl.type.kind)) {
    // primitive type string, number, etc...
    return { symbol: decl.type.getText(source) };
  }

  console.warn("WARNING: unexpected function return type node: " + ts.SyntaxKind[decl.type.kind]);
}

function scalarInfoFromObjectLiteralExpression(
  scalarName: string,
  source: ts.SourceFile,
  properties: ArrayLike<ts.ObjectLiteralElementLike>,
): ScalarInfo {
  const module = new URL(source.fileName);
  const info: ScalarInfo = Object.fromEntries(
    Array.from(properties).flatMap(
      (prop): [Exclude<keyof ScalarInfo, "type">, SymbolReference & { declaration: FunctionDeclaration }][] => {
        if (ts.isPropertyAssignment(prop)) {
          if (!ts.isIdentifier(prop.name)) {
            return [];
          }

          switch (prop.name.text) {
            case "serialize":
            case "parseValue":
            case "parseLiteral":
              if (!ts.isFunctionExpression(prop.initializer) && !ts.isArrowFunction(prop.initializer)) {
                console.log(
                  `WARNING: expected scalar property ${scalarName}.${prop.name.text} to be a function, but got ${
                    ts.SyntaxKind[prop.initializer.kind]
                  }`,
                );
                return [];
              }

              return [[
                `${prop.name.text}Func`,
                {
                  module: module.pathname,
                  symbol: scalarName,
                  property: prop.name.text,
                  declaration: prop.initializer,
                },
              ]];

            default:
              console.log(`WARNING: found extraneous scalar property ${scalarName}.${prop.name.text}`);
          }
        } else if (ts.isMethodDeclaration(prop)) {
          if (!ts.isIdentifier(prop.name)) {
            return [];
          }

          switch (prop.name.text) {
            case "serialize":
            case "parseValue":
            case "parseLiteral":
              return [[
                `${prop.name.text}Func`,
                {
                  module: module.pathname,
                  symbol: scalarName,
                  property: prop.name.text,
                  declaration: prop,
                },
              ]];

            default:
              console.log(`WARNING: found extraneous scalar property ${scalarName}.${prop.name.text}`);
          }
        } else {
          console.log(
            `WARNING: unsupported object literal element in scalar object ${scalarName}: ${ts.SyntaxKind[prop.kind]}`,
          );
        }

        return [];
      },
    ),
  );

  const parseValueReturnType = info.parseValueFunc && findFuncReturnType(info.parseValueFunc.declaration, source);
  const parseLiteralReturnType = info.parseLiteralFunc && findFuncReturnType(info.parseLiteralFunc.declaration, source);

  if (parseValueReturnType && parseLiteralReturnType) {
    if (
      parseValueReturnType.symbol !== parseLiteralReturnType.symbol ||
      parseValueReturnType.module !== parseLiteralReturnType.module ||
      parseValueReturnType.property !== parseLiteralReturnType.property
    ) {
      throw new Error(`parseValue and parseLiteral return types do not match for scalar ${scalarName}`);
    }
  }

  info.type = parseValueReturnType || parseLiteralReturnType;
  if (info.type?.module?.startsWith(".")) {
    info.type = {
      module: new URL(info.type.module, module).pathname,
      symbol: info.type.symbol,
      property: info.type.property,
    };
  }

  return info;
}

export async function parse(path: URL): Promise<Record<string, ScalarInfo>> {
  return Object.fromEntries(
    Object.entries((await parseModule(path)).exports)
      .flatMap(
        ([name, { declaration, source }]): [string, ScalarInfo][] => {
          if (
            !ts.isVariableDeclaration(declaration) || !declaration.initializer ||
            !ts.isObjectLiteralExpression(declaration.initializer)
          ) {
            return [];
          }

          return [[name, scalarInfoFromObjectLiteralExpression(name, source, declaration.initializer.properties)]];
        },
      ),
  );
}
