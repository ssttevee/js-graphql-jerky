import path from "node:path";

/**
 * Glob options that make Windows paths work as patterns. On Windows, a
 * backslash is a path separator and not an escape character.
 */
export const globOptions = {
	windowsPathsNoEscape: path.sep === "\\",
} as const;

/**
 * Converts native path separators to forward slashes.
 *
 * Glob patterns and module specifiers must use forward slashes, even on
 * Windows.
 */
export function toPosixPath(p: string): string {
	return path.sep === "\\" ? p.replaceAll("\\", "/") : p;
}

/**
 * Compares paths by code unit. The result does not change with the locale
 * or with the order in which the file system returns entries.
 */
export function comparePaths(a: string, b: string): number {
	return a < b ? -1 : a > b ? 1 : 0;
}
