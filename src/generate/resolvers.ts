import ts, { parseModule } from "./utils/typescript.ts";

export interface SymbolReference {
  module?: string;
  symbol: string;
  property?: string;
}

async function parseResolverFile(path: URL): Promise<Record<string, SymbolReference>> {
  return Object.fromEntries(
    Object.entries((await parseModule(path)).exports)
      .flatMap(
        ([name, { declaration }]): [string, SymbolReference][] => {
          if (ts.isVariableDeclaration(declaration) && declaration.initializer) {
            if (ts.isFunctionExpression(declaration.initializer)) {
              return [[name, { module: path.pathname, symbol: name }]];
            }

            if (ts.isArrowFunction(declaration.initializer)) {
              return [[name, { module: path.pathname, symbol: name }]];
            }
          }

          if (ts.isFunctionDeclaration(declaration)) {
            return [[name, { module: path.pathname, symbol: name }]];
          }

          return [];
        },
      ),
  );
}

export async function parseTypeResolvers(typeName: string, path: URL): Promise<Record<string, SymbolReference>> {
  const stat = await Deno.stat(path);
  if (stat.isFile) {
    return parseResolverFile(path);
  }

  if (!path.pathname.endsWith("/")) {
    path.pathname += "/";
  }

  const result: Record<string, SymbolReference> = {};
  for await (const entry of Deno.readDir(path)) {
    if (entry.isFile && entry.name.endsWith(".ts")) {
      const file = new URL(entry.name, path);
      for (const [name, reference] of Object.entries(await parseResolverFile(file))) {
        if (name in result) {
          console.warn(`Duplicate resolver name: ${typeName}.${name} in ${file.pathname} and ${result[name].module}`);
        }

        result[name] = reference;
      }
    }
  }

  return result;
}

export async function parse(path: URL): Promise<Record<string, Record<string, SymbolReference>>> {
  if (!path.pathname.endsWith("/")) {
    path = new URL(path.pathname + "/", path);
  }

  const out = {} as Record<string, Record<string, SymbolReference>>;

  for await (const entry of Deno.readDir(path)) {
    if (entry.isDirectory) {
      out[entry.name] = await parseTypeResolvers(entry.name, new URL(entry.name + "/", path));
    } else if (entry.isFile && entry.name.endsWith(".ts")) {
      const file = new URL(entry.name, path);
      out[entry.name.slice(0, -3)] = await parseTypeResolvers(entry.name.slice(0, -3), file);
    }
  }

  return out;
}
