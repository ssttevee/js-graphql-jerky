import {
  Character,
  getFriends,
} from "https://raw.githubusercontent.com/graphql/graphql-js/e9a81f2ba9020ec5fd0f67f5553ccabe392e95e8/src/__tests__/starWarsData.ts";
import { EEpisode } from "../schema_gen.ts";

export async function friends(character: Character): Promise<Character[]> {
  return (await Promise.all(getFriends(character))).filter((c): c is Character => !!c);
}

export function appearsIn(character: Character): EEpisode[] {
  return character.appearsIn.map((e) => e === 4 ? EEpisode.NEW_HOPE : e === 5 ? EEpisode.EMPIRE : EEpisode.JEDI);
}

export function secretBackstory(): never {
  throw new Error("secretBackstory is secret.");
}
