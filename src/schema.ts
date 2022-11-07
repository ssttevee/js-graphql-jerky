import {
  buildASTSchema,
  DocumentNode,
  GraphQLSchema,
  parse as parseDocument,
  Source,
  validateSchema,
} from "https://esm.sh/graphql@16.6.0";
import { walk, type WalkEntry } from "https://deno.land/std@0.161.0/fs/mod.ts";
import { join } from "https://deno.land/std@0.161.0/path/mod.ts";
import { mergeDocumentNodes } from "./schema/merge.ts";

export async function parse(path: string): Promise<GraphQLSchema> {
  const documentNodes: DocumentNode[] = [];
  for await (const entry of glob(path)) {
    if (entry.isFile) {
      documentNodes.push(
        parseDocument(
          new Source(
            await Deno.readTextFile(entry.path),
            entry.path,
          ),
        ),
      );
    }
  }

  const schema = buildASTSchema(mergeDocumentNodes(documentNodes));
  const validationErrors = validateSchema(schema);
  if (validationErrors.length > 0) {
    throw validationErrors;
  }

  return schema;
}

async function* glob(path: string): AsyncIterable<WalkEntry> {
  for await (const entry of walk(path || ".")) {
    if (entry.isFile && entry.path.endsWith(".graphql")) {
      yield {
        ...entry,
        path: join(Deno.cwd(), entry.path),
      };
    }
  }
}

export { generate } from "./schema/generate.ts";
