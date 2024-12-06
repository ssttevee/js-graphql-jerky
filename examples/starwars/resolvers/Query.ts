import {
	type Character,
	type Droid,
	type Human,
	getDroid,
	getHero,
	getHuman,
} from "https://raw.githubusercontent.com/graphql/graphql-js/e9a81f2ba9020ec5fd0f67f5553ccabe392e95e8/src/__tests__/starWarsData.ts";
import { EEpisode, type Query } from "../schema_gen.js";

export function hero(_: null, { episode }: Query.HeroArgs): Character {
	return getHero(
		episode === EEpisode.NEW_HOPE ? 4 : episode === EEpisode.EMPIRE ? 5 : 6,
	);
}

export function human(_: null, { id }: Query.HumanArgs): Human | null {
	return getHuman(id);
}

export function droid(_: null, { id }: Query.HumanArgs): Droid | null {
	return getDroid(id);
}
