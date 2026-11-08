import { readFile, writeFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";
const target = new URL("../.env", import.meta.url);
const template = await readFile(new URL("../.env.example", import.meta.url), "utf8");
const password = randomBytes(24).toString("hex");
const content = template
  .replaceAll("chtaw_local_dev", password)
  .replace("JWT_ACCESS_SECRET=", "JWT_ACCESS_SECRET=" + randomBytes(48).toString("base64url"))
  .replace("JWT_REFRESH_SECRET=", "JWT_REFRESH_SECRET=" + randomBytes(48).toString("base64url"));
try {
  await writeFile(target, content, { flag: "wx", mode: 0o600 });
  console.log("Created local .env with random secrets. Configure seed credentials before db:seed.");
} catch (error) {
  if (error.code === "EEXIST") console.log("Existing .env preserved.");
  else throw error;
}
