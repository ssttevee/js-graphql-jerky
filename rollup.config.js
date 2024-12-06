import typescript from "@rollup/plugin-typescript";
import dts from "rollup-plugin-dts";

export default [
	{
		input: {
			"bin/jerky": "src/command/jerky.ts",
			lib: "src/generate/index.ts",
		},
		output: [
			{
				dir: "build",
				format: "commonjs",
				entryFileNames: "[name].cjs",
				plugins: [
					{
						renderChunk(code) {
							return code.replace(/\nrequire\('[^']+'\);/g, "");
						},
					},
				],
			},
			{
				dir: "build",
				format: "esm",
				entryFileNames: "[name].mjs",
			},
		],
		treeshake: "smallest",
		external: [
			"commander",
			"node:fs/promises",
			"node:path",
			"picomatch",
			"graphql",
			"glob",
			/^just-/,
			/^jennifer-js/,
			"node:url",
			"typescript",
		],
		plugins: [
			typescript({
				exclude: [/examples/],
			}),
			{
				renderChunk(code, chunk) {
					if (!chunk.name.startsWith("bin/")) {
						return null;
					}

					return `#!/usr/bin/env node\n\n${code}`;
				},
			},
		],
	},
	{
		input: {
			lib: "src/generate/index.ts",
		},
		output: [
			{
				dir: "build",
				entryFileNames: "[name].d.ts",
			},
		],
		plugins: [dts()],
	},
];
