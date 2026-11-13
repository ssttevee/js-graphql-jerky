import {
  GraphQLEnumType,
  GraphQLInterfaceType,
  GraphQLList,
  GraphQLNonNull,
  GraphQLObjectType,
  GraphQLSchema,
  GraphQLString,
  specifiedDirectives,
} from "graphql";
import { appearsIn, friends, secretBackstory } from "./resolvers/Character.ts";
import { droid, hero, human } from "./resolvers/Query.ts";
const CharacterType: GraphQLInterfaceType = new GraphQLInterfaceType({
  name: "Character",
  fields: () => ({
    appearsIn: {
      type: new GraphQLNonNull(
        new GraphQLList(new GraphQLNonNull(EpisodeEnum)),
      ),
      description: "Which movies they appear in.",
      resolve: appearsIn as any,
    },
    friends: {
      type: new GraphQLNonNull(
        new GraphQLList(new GraphQLNonNull(CharacterType)),
      ),
      description:
        "The friends of the character, or an empty list if they have none.",
      resolve: friends as any,
    },
    id: {
      type: new GraphQLNonNull(GraphQLString),
      description: "The id of the character.",
    },
    name: {
      type: new GraphQLNonNull(GraphQLString),
      description: "The name of the character.",
    },
    secretBackstory: {
      type: GraphQLString,
      description: "All secrets about their past.",
      resolve: secretBackstory as any,
    },
  }),
  description: "A character in the Star Wars Trilogy",
}) as GraphQLInterfaceType;
const DroidType: GraphQLObjectType = new GraphQLObjectType({
  name: "Droid",
  fields: () => ({
    appearsIn: {
      type: new GraphQLNonNull(
        new GraphQLList(new GraphQLNonNull(EpisodeEnum)),
      ),
      description: "Which movies they appear in.",
      resolve: appearsIn as any,
    },
    friends: {
      type: new GraphQLNonNull(
        new GraphQLList(new GraphQLNonNull(CharacterType)),
      ),
      description:
        "The friends of the droid, or an empty list if they have none.",
      resolve: friends as any,
    },
    id: {
      type: new GraphQLNonNull(GraphQLString),
      description: "The id of the droid.",
    },
    name: {
      type: new GraphQLNonNull(GraphQLString),
      description: "The name of the droid.",
    },
    primaryFunction: {
      type: GraphQLString,
      description: "The primary function of the droid.",
    },
    secretBackstory: {
      type: GraphQLString,
      description: "Construction date and the name of the designer.",
      resolve: secretBackstory as any,
    },
  }),
  description: "A mechanical creature in the Star Wars universe.",
  interfaces: () => [CharacterType],
}) as GraphQLObjectType;
const EpisodeEnum: GraphQLEnumType = new GraphQLEnumType({
  name: "Episode",
  values: {
    EMPIRE: { value: "EMPIRE", description: "Released in 1980." },
    JEDI: { value: "JEDI", description: "Released in 1983." },
    NEW_HOPE: { value: "NEW_HOPE", description: "Released in 1977." },
  },
});
const HumanType: GraphQLObjectType = new GraphQLObjectType({
  name: "Human",
  fields: () => ({
    appearsIn: {
      type: new GraphQLNonNull(
        new GraphQLList(new GraphQLNonNull(EpisodeEnum)),
      ),
      description: "Which movies they appear in.",
      resolve: appearsIn as any,
    },
    friends: {
      type: new GraphQLNonNull(
        new GraphQLList(new GraphQLNonNull(CharacterType)),
      ),
      description:
        "The friends fot he human, or an empty list of they have none.",
      resolve: friends as any,
    },
    homePlanet: {
      type: GraphQLString,
      description: "The home planet of the human, or null if unknown.",
    },
    id: {
      type: new GraphQLNonNull(GraphQLString),
      description: "The id of the human.",
    },
    name: {
      type: new GraphQLNonNull(GraphQLString),
      description: "The name of the human.",
    },
    secretBackstory: {
      type: GraphQLString,
      description: "Where are they from and how they came to be who they are.",
      resolve: secretBackstory as any,
    },
  }),
  description: "A humanoid creature in the Star Wars universe.",
  interfaces: () => [CharacterType],
}) as GraphQLObjectType;
const QueryType: GraphQLObjectType = new GraphQLObjectType({
  name: "Query",
  fields: () => ({
    droid: {
      type: DroidType,
      args: {
        id: {
          type: new GraphQLNonNull(GraphQLString),
          description: "The id of the droid.",
        },
      },
      resolve: droid as any,
    },
    hero: {
      type: CharacterType,
      args: {
        episode: {
          type: EpisodeEnum,
          description:
            "If omitted, returns the hero of the whole saga. If provided, returns the hero of that particular episode.",
        },
      },
      resolve: hero as any,
    },
    human: {
      type: HumanType,
      args: {
        id: {
          type: new GraphQLNonNull(GraphQLString),
          description: "The id of the human.",
        },
      },
      resolve: human as any,
    },
  }),
}) as GraphQLObjectType;
const schema = new GraphQLSchema({
  query: QueryType,
  types: [CharacterType, DroidType, EpisodeEnum, HumanType, QueryType],
  directives: [...specifiedDirectives],
});
export default schema;
const setTypename = <T>(v: T, t: string): T => {
  if (!v || typeof v !== "object") {
    throw new Error("expected object");
  }
  return Object.assign(v, { __typename: t });
};
export interface Character {
  appearsIn?: Array<EEpisode>;
  friends?: Array<Character>;
  id?: string;
  name?: string;
  secretBackstory?: string;
}
export namespace Character {
  export const asDroid = <T>(v: T) => setTypename(v, "Droid");
  export const asHuman = <T>(v: T) => setTypename(v, "Human");
}

export interface Droid {
  appearsIn?: Array<EEpisode>;
  friends?: Array<Character>;
  id?: string;
  name?: string;
  primaryFunction?: string;
  secretBackstory?: string;
}

export enum EEpisode {
  EMPIRE = "EMPIRE",
  JEDI = "JEDI",
  NEW_HOPE = "NEW_HOPE",
}
export function isEEpisode(v: any): v is EEpisode {
  return v in EEpisode;
}

export interface Human {
  appearsIn?: Array<EEpisode>;
  friends?: Array<Character>;
  homePlanet?: string;
  id?: string;
  name?: string;
  secretBackstory?: string;
}

export interface Query {
  droid?: Droid;
  hero?: Character;
  human?: Human;
}
export namespace Query {
  export interface DroidArgs {
    id: string;
  }
  export interface HeroArgs {
    episode: EEpisode | undefined;
  }
  export interface HumanArgs {
    id: string;
  }
}
