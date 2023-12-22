import pm from "picomatch";

export type MatchPattern =
	| string
	| RegExp
	| ((s: string) => boolean)
	| Array<string | RegExp | ((s: string) => boolean)>;

export function createMatcher(pattern?: MatchPattern) {
	if (!pattern) {
		return () => false;
	}

	if (typeof pattern === "function") {
		return pattern;
	}

	if (pattern instanceof RegExp) {
		return (s: string) => pattern.test(s);
	}

	if (typeof pattern === "string") {
		return pm(pattern);
	}

	const matchers: ((s: string) => boolean)[] = [];
	const globs: string[] = [];
	for (const p of Array.isArray(pattern) ? pattern : [pattern]) {
		if (typeof p === "string") {
			globs.push(p);
		} else if (typeof p === "function") {
			matchers.push(p);
		} else if (p instanceof RegExp) {
			matchers.push(RegExp.prototype.test.bind(p));
		} else {
			throw new TypeError(`Invalid pattern: ${p}`);
		}
	}

	if (globs.length) {
		matchers.push(pm(globs));
	}

	return (s: string) => matchers.some((m) => m(s));
}
