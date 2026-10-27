import { loadConfig } from "../src/server/config";
import { openDatabase } from "../src/server/db";

const db = openDatabase(loadConfig().DATABASE_PATH);
db.close();
console.log("Database migrations applied.");
