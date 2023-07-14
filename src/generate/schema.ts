import { globIterate } from "glob";
import {
  buildASTSchema,
  DocumentNode,
  GraphQLSchema,
  parse as parseDocument,
  Source,
  validateSchema,
} from "graphql";
import fs from "fs/promises";
import { join } from "path";

import { createMatcher, MatchPattern } from "./matcher.js";
import { mergeDocumentNodes } from "./merge.js";

async function* findSchemaFiles(glob: string | string[]): AsyncGenerator<string> {
  for await (const path of globIterate(glob)) {
    const entry = await fs.stat(path);
    if (entry.isFile()) {
      yield path;
    } else if (entry.isDirectory()) {
      yield* findSchemaFiles(join(path, "**/*.graphql"));
    }
  }
}

export async function parse(glob: string | string[], ignore?: MatchPattern): Promise<GraphQLSchema> {
  const shouldIgnore = createMatcher(ignore);
  const documentNodes: DocumentNode[] = [];
  for await (const entry of findSchemaFiles(glob)) {
    if (shouldIgnore(entry)) {
      continue;
    }

    documentNodes.push(
      parseDocument(
        new Source(
          await fs.readFile(entry, "utf-8"),
          entry,
        ),
      ),
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
