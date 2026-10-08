import { writeFile } from "node:fs/promises";

import { openApiDocument } from "../src/openapi.js";

const outputPath = new URL("../openapi.json", import.meta.url);
await writeFile(outputPath, `${JSON.stringify(openApiDocument, null, 2)}\n`);
// eslint-disable-next-line no-console
console.log("OpenAPI document written to openapi.json");
