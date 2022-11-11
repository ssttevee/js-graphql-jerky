import {
  GraphQLEnumType,
  GraphQLInterfaceType,
  GraphQLList,
  GraphQLNonNull,
  GraphQLObjectType,
  GraphQLSchema,
  GraphQLString,
} from "graphql";
import { appearsIn, friends, secretBackstory } from "./resolvers/Character.ts";
import { droid, hero, human } from "./resolvers/Query.ts";

const CharacterType = new GraphQLInterfaceType({
  name: "Character",
  resolveType: (v: any) => {
    switch (v[interfaceSymbol_Character]) {
      case interfaceTypeSymbol_Droid_Character:
        return "Droid";
      case interfaceTypeSymbol_Human_Character:
        return "Human";
    }
    return v.__typename;
  },
  fields: () => ({
    appearsIn: {
      type: new GraphQLNonNull(new GraphQLList(new GraphQLNonNull(EpisodeEnum))),
      description: "Which movies they appear in.",
      resolve: appearsIn,
    },
    friends: {
      type: new GraphQLNonNull(new GraphQLList(new GraphQLNonNull(CharacterType))),
      description: "The friends of the character, or an empty list if they have none.",
      resolve: friends,
    },
    id: { type: new GraphQLNonNull(GraphQLString), description: "The id of the character." },
    name: { type: new GraphQLNonNull(GraphQLString), description: "The name of the character." },
    secretBackstory: { type: GraphQLString, description: "All secrets about their past.", resolve: secretBackstory },
  }),
  description: "A character in the Star Wars Trilogy",
}) as GraphQLInterfaceType;
export interface Character {
  appearsIn?: Array<EEpisode>;
  friends?: Array<Character>;
  id?: string;
  name?: string;
  secretBackstory?: string;
}
const interfaceSymbol_Character = Symbol("Character type");
const interfaceTypeSymbol_Droid_Character = Symbol("Droid Character");
const interfaceTypeSymbol_Human_Character = Symbol("Human Character");
export const asDroidCharacter = <T>(v: any): T | { [interfaceSymbol_Character]: symbol } => ({
  ...v,
  [interfaceSymbol_Character]: interfaceTypeSymbol_Droid_Character,
});
export const asHumanCharacter = <T>(v: any): T | { [interfaceSymbol_Character]: symbol } => ({
  ...v,
  [interfaceSymbol_Character]: interfaceTypeSymbol_Human_Character,
});
const DroidType = new GraphQLObjectType({
  name: "Droid",
  fields: () => ({
    appearsIn: {
      type: new GraphQLNonNull(new GraphQLList(new GraphQLNonNull(EpisodeEnum))),
      description: "Which movies they appear in.",
      resolve: appearsIn,
    },
    friends: {
      type: new GraphQLNonNull(new GraphQLList(new GraphQLNonNull(CharacterType))),
      description: "The friends of the droid, or an empty list if they have none.",
      resolve: friends,
    },
    id: { type: new GraphQLNonNull(GraphQLString), description: "The id of the droid." },
    name: { type: new GraphQLNonNull(GraphQLString), description: "The name of the droid." },
    primaryFunction: { type: GraphQLString, description: "The primary function of the droid." },
    secretBackstory: {
      type: GraphQLString,
      description: "Construction date and the name of the designer.",
      resolve: secretBackstory,
    },
  }),
  description: "A mechanical creature in the Star Wars universe.",
  interfaces: () => [CharacterType],
}) as GraphQLObjectType;
export interface Droid {
  appearsIn?: Array<EEpisode>;
  friends?: Array<Character>;
  id?: string;
  name?: string;
  primaryFunction?: string;
  secretBackstory?: string;
}

const EpisodeEnum = new GraphQLEnumType({
  name: "Episode",
  values: {
    EMPIRE: { value: "EMPIRE", description: "Released in 1980." },
    JEDI: { value: "JEDI", description: "Released in 1983." },
    NEW_HOPE: { value: "NEW_HOPE", description: "Released in 1977." },
  },
});
export enum EEpisode {
  EMPIRE = "EMPIRE",
  JEDI = "JEDI",
  NEW_HOPE = "NEW_HOPE",
}
export function isEEpisode(v: any): v is EEpisode {
  return v in EEpisode;
}

const HumanType = new GraphQLObjectType({
  name: "Human",
  fields: () => ({
    appearsIn: {
      type: new GraphQLNonNull(new GraphQLList(new GraphQLNonNull(EpisodeEnum))),
      description: "Which movies they appear in.",
      resolve: appearsIn,
    },
    friends: {
      type: new GraphQLNonNull(new GraphQLList(new GraphQLNonNull(CharacterType))),
      description: "The friends fot he human, or an empty list of they have none.",
      resolve: friends,
    },
    homePlanet: { type: GraphQLString, description: "The home planet of the human, or null if unknown." },
    id: { type: new GraphQLNonNull(GraphQLString), description: "The id of the human." },
    name: { type: new GraphQLNonNull(GraphQLString), description: "The name of the human." },
    secretBackstory: {
      type: GraphQLString,
      description: "Where are they from and how they came to be who they are.",
      resolve: secretBackstory,
    },
  }),
  description: "A humanoid creature in the Star Wars universe.",
  interfaces: () => [CharacterType],
}) as GraphQLObjectType;
export interface Human {
  appearsIn?: Array<EEpisode>;
  friends?: Array<Character>;
  homePlanet?: string;
  id?: string;
  name?: string;
  secretBackstory?: string;
}

const QueryType = new GraphQLObjectType({
  name: "Query",
  fields: () => ({
    droid: {
      type: DroidType,
      args: { id: { type: new GraphQLNonNull(GraphQLString), description: "The id of the droid." } },
      resolve: droid,
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
      resolve: hero,
    },
    human: {
      type: HumanType,
      args: { id: { type: new GraphQLNonNull(GraphQLString), description: "The id of the human." } },
      resolve: human,
    },
  }),
}) as GraphQLObjectType;
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

const schema = new GraphQLSchema({
  query: QueryType,
  types: [CharacterType, DroidType, EpisodeEnum, HumanType, QueryType],
  directives: [],
});
export default schema;
