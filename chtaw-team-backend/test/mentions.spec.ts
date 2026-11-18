import { isMentioned, mentionsEveryone } from "../src/messages/mentions";
describe("Group mentions", () => {
  it.each(["@tous", "Bonjour @tous !", "@TOUS, bonjour", "Bonjour\n@tous"])("recognizes the standalone group mention %s", text => {
    expect(mentionsEveryone(text)).toBe(true);
  });
  it.each(["user@tous.fr", "@toussaint", "@tous_foo", "https://x/@tous"])("does not notify a group for %s", text => {
    expect(mentionsEveryone(text)).toBe(false);
  });
  it("keeps selected identities separate from plain names", () => {
    expect(isMentioned({ text: "@Nadia Team", mentionIds: ["selected"] }, "selected")).toBe(true);
    expect(isMentioned({ text: "@Nadia Team", mentionIds: ["selected"] }, "other")).toBe(false);
  });
});
