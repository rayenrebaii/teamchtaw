import "reflect-metadata";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { RegisterDto, FirebaseLoginDto } from "../src/auth/auth.dto";
import { normalizeSchoolName } from "../src/establishments/student-schools.service";
import { memberSelect, userSelect, accountSelect } from "../src/common/presenters";

const input = { email: "test@example.invalid", password: "Local-password-2026!", firstName: "Local", lastName: "Test", proposedEstablishmentName: "Lycée local" };
it.each(["20 123 456", "+216 20 123 456", "0021620123456"])("normalizes the Tunisian registration phone %s", async phone => {
  const dto = plainToInstance(RegisterDto, { ...input, phone });
  expect(await validate(dto)).toHaveLength(0);
  expect(dto.phone).toBe("+21620123456");
});
it.each([undefined, null, "", "2012345", "+33123456789", "+216201234567", 20123456])("requires a valid phone for a new registration: %p", async phone => {
  expect((await validate(plainToInstance(RegisterDto, { ...input, phone }))).length).toBeGreaterThan(0);
});
it("does not require a phone on existing Firebase logins", async () => {
  expect(await validate(plainToInstance(FirebaseLoginDto, { idToken: "t".repeat(100) }))).toHaveLength(0);
});
it("normalizes equivalent proposed school names", () => {
  expect(normalizeSchoolName(" \t Lycée   Pilote \n Tunis  ").toLowerCase()).toBe("lycée pilote tunis");
});
it("never exposes a telephone in shared member data", () => {
  expect(memberSelect).not.toHaveProperty("phone"); expect(userSelect).not.toHaveProperty("phone");
  expect(accountSelect).toHaveProperty("phone", true);
});
