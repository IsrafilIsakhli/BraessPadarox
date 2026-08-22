import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const apiRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// Environment variables supplied by the host always win. For local work, allow
// either api/.env or the repository-level .env without exposing values to the web app.
dotenv.config({ path: path.join(apiRoot, ".env"), quiet: true });
dotenv.config({ path: path.join(apiRoot, "..", ".env"), quiet: true });
