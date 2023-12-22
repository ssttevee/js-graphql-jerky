import fs from "fs/promises";
import { globIterate } from "glob";
import { basename, extname, join } from "path";

import { MatchPattern, createMatcher } from "./matcher.js";
import { SymbolReference } from "./utils/reference.js";
import ts, { parseModule } from "./utils/typescript.js";

async function parseResolverFile(path: string): Promise<Record<string, SymbolReference>> {
  return Object.fromEntries(
    Object.entries((await parseModule(path)).exports)
      .flatMap(
        ([name, decls]): [string, SymbolReference][] => decls.flatMap(({ declaration }) => {
          if (ts.isVariableDeclaration(declaration) && declaration.initializer) {
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

export async function parseTypeResolvers(typeName: string, glob: string | string[], ignore?: MatchPattern): Promise<Record<string, SymbolReference>> {
  const shouldIgnore = createMatcher(ignore);
  const result: Record<string, SymbolReference> = {};
  for await (const entry of globIterate(glob, { withFileTypes: true })) {
    const fullpath = entry.fullpath();
    if (!shouldIgnore(fullpath) && entry.isFile() && entry.name.endsWith(".ts")) {
      for (const [name, reference] of Object.entries(await parseResolverFile(fullpath))) {
        let realName = name;
        if (realName === "default" && typeof glob === 'string' && glob.endsWith('/*.ts')) {
          realName = basename(fullpath, extname(fullpath))
        }

        if (realName in result) {
          console.warn(
            `WARNING: Duplicate resolver name: ${typeName ? typeName + "." : ""}${name} in ${fullpath} and ${result[name].module}`,
          );
        }

        result[realName] = reference;
      }
    }
  }

  return result;
}

export async function parse(dirpath: string, ignore?: MatchPattern): Promise<Record<string, Record<string, SymbolReference>>> {
  const dir = await fs.stat(dirpath);
  if (!dir.isDirectory()) {
    throw new Error(`Expected ${dirpath} to be a directory`);
  }

  if (!dirpath.endsWith("/")) {
    dirpath += "/";
  }

  const out = {} as Record<string, Record<string, SymbolReference>>;

  const shouldIgnore = createMatcher(ignore)

  for await (const name of await fs.readdir(dirpath)) {
    const file = join(dirpath, name);
    const entry = await fs.stat(file);
    if (entry.isDirectory()) {
      out[name] = await parseTypeResolvers(name, file + "/*.ts", shouldIgnore);
    } else if (entry.isFile() && name.endsWith(".ts")) {
      out[name.slice(0, -3)] = await parseTypeResolvers(name.slice(0, -3), file, shouldIgnore);
    }
  }

  return out;
}
