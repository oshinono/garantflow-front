// Генерация типов API: из живой схемы бэкенда (API_SCHEMA_URL) или из предварительного контракта.
import { execFileSync } from "node:child_process";

const source = process.env.API_SCHEMA_URL || "openapi/api.yaml";
console.log(`openapi-typescript: ${source} → src/api/schema.d.ts`);
execFileSync("yarn", ["openapi-typescript", source, "-o", "src/api/schema.d.ts", "--root-types"], {
  stdio: "inherit",
});
