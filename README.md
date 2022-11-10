# Jerky

Jerky is a schema-first static graphql schema lightweight code generator.

The benefit of such a tool is to remove the requirement of parsing the graphql schema at runtime while still employing a
schema-first development experience. This is useful for reducing startup or cold start times which is important for
environments where potentially many short-lived instances are spawned in quick succession such as on serverless
platforms.

In addition to runtime benefits, scalar, resolve, and subscribe functions are automatically linked in the schema, and
typescript Types are automatically generated based on the schema definition.

Jerky is made to interoperate with the reference `graphql-js` library and is not a standalone GraphQL implementation.

## Usage

```
deno run -A src/command/jerky.ts
```

By default, the working directory is searched recursively for `*.graphql` files. All of which are combined into a single
schema and rendered to `schema_gen.ts` in the same directory.

A path to a directory or file can be passed as the first parameter to limit to scope of the search.

### Options

#### --graphql

The `--graphql` option specifies the module from which the graphql types will be imported. Defaults to `graphql`.

This is sometimes necessary depending on your target platform or runtime. In particular, a node project would probably
`graphql` from npm, where as a deno project may use `https://esm.sh/graphql` instead.

#### --scalars

The `--scalars` option specifies the module from which scalar functions are imported.

This is used to specify the `serialize`, `parseValue`, and `parseLiteral` functions that are configure
`GraphQLScalarType`s.

For example, if a custom scalar is defined like this:

```gql
scalar Date
```

The corresponding scalars file could look like this:

```ts
export const Date = {
  serialize(value: Date): string {
    return value.toISOString();
  },
  parseValue(value: unknown): Date {
    if (typeof value !== "string") {
      throw new Error("Date must be a string");
    }

    return new Date(value);
  },
};
```

#### --resolvers

The `--resolvers` option specifies a directory of modules from which resolver functions are imported.

Object and interface types defined in the schema are correlated to a file in the specified directory by name. Within
each file, fields of the corresponding type are also correlated to the exports by name.

Each export must be a function in the form of
[`GraphQLFieldResolver`](https://github.com/graphql/graphql-js/blob/e9a81f2ba9020ec5fd0f67f5553ccabe392e95e8/src/type/definition.ts#L879).

For example, if a schema is defined like this:

```gql
type Query {
  show(id: ID!): Show
}

type Show {
  name: String!
}
```

The corresponding resolvers directory could look like this:

```ts
// path/to/resolvers/Query.ts

import { Query } from "path/to/schema_gen.ts";
import { data, Show } from "path/to/data.ts";

export function show(source: null, { id }: Query.ShowArgs): Show {
  return data.shows[id];
}
```

```ts
// path/to/resolvers/Show.ts

import { Show } from "path/to/data.ts";

export function name(source: Show): string {
  return source.show_name;
}
```

Alternatively to a single file containing all field resolvers, for large types like `Query` or `Mutation`, it may be
preferrable to break split of field resolvers into separate files within a subdirectory of the same name as the
corresponding type for better organization.

For example, if a schema is defined like this:

```gql
type Query {
  show(id: ID!): Show
  actor(id: ID!): Actor
}
```

The `Query` resolvers may be split up into files like this:

```ts
// path/to/resolvers/Query/shows.ts

import { Query } from "path/to/schema_gen.ts";
import { data, Show } from "path/to/data.ts";

export function show(source: null, { id }: Query.ShowArgs): Show {
  return data.shows[id];
}
```

```ts
// path/to/resolvers/Query/actors.ts

import { Query } from "path/to/schema_gen.ts";
import { Actor, data } from "path/to/data.ts";

export function actors(source: null, { id }: Query.ActorArgs): Actor {
  return data.actors[id];
}
```

#### --subscribers

The `--subscribers` option specifies the module from which subscribe functions are imported. This works in the same way
as any particular type from the `--resolvers` option, except it is for the `Subscription` type only.

## Goals

- Generate runtime-agnostic code
- Interoperate with `graphql-js`
- Be easily configurable for any target environment
- Keep the `graphql-js` version of Jerky independent of that of the target environment
- Expose APIs for custom integrations

## Non-Goals

- Teaching GraphQL concepts or ideas
- Extending GraphQL with custom features
- Overthrowing the Galactic Federation
