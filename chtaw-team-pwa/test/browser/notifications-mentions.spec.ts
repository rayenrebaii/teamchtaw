import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { fixture } from "./fixtures";
const picture = readFileSync("public/branding/chtaw-logo.png");
const id = "a0000000-0000-4000-8000-000000000001";
for (const role of ["USER", "ADMIN", "COLLABORATOR"] as const) for (const width of [390, 1440]) for (const theme of ["light", "dark"]) {
  test(`mentions and automatic notification consumption ${role} ${width} ${theme}`, async ({ page }) => {
    const en = theme === "dark";
    const headers = { "Access-Control-Allow-Origin": new URL(test.info().project.use.baseURL!).origin, "Access-Control-Allow-Credentials": "true", "Access-Control-Allow-Headers": "Authorization,Content-Type,X-Session-Transport", "Access-Control-Allow-Methods": "GET,POST,PATCH,PUT,DELETE,OPTIONS" };
    const errors: string[] = []; page.on("pageerror", error => errors.push(error.message));
    await page.setViewportSize({ width, height: 900 });
    await fixture(page, role, theme, en ? "en" : "fr");
    const me = { id: "fixture-account", firstName: "Mohamed", lastName: "Rami", role, bio: "" };
    const nadia = { id: "fixture-nadia", firstName: "Nadia", lastName: "Team", role: "USER", bio: "", profilePhotoId: "fixture-photo" };
    const group = { id: "fixture-group", name: "Team Chtaw", description: "", color: "#aabbcc", isGeneral: true, memberIds: [me.id, nadia.id] };
    let consumed = false, opens = 0, sent = 0;
    const messages = [{ id: "source-message", groupId: group.id, authorId: nadia.id, author: nadia, text: "@tous La séance commence", kind: "text", createdAt: "2026-11-18T09:00:00Z", mentionIds: [] as string[] }];
    await page.route("**/api/v1/groups", route => route.fulfill({ headers, json: [group] }));
    await page.route("**/api/v1/groups/fixture-group", route => route.fulfill({ headers, json: { ...group, members: [me, nadia] } }));
    await page.route("**/api/v1/profile-photos/**", route => route.fulfill({ headers, contentType: "image/png", body: picture }));
    await page.route("**/api/v1/groups/fixture-group/messages**", route => {
      if (route.request().method() === "OPTIONS") return route.fulfill({ status: 204, headers });
      if (route.request().method() === "POST") {
        const body = route.request().postDataJSON(); sent++;
        expect(body).toMatchObject({ text: "@Nadia Team @tous", mentionIds: [nadia.id] });
        const message = { ...messages[0]!, ...body, id: "new-message", authorId: me.id, author: me };
        messages.push(message); return route.fulfill({ status: 201, headers, json: message });
      }
      return route.fulfill({ headers, json: { items: messages, nextCursor: null } });
    });
    await page.route("**/api/v1/notifications?**", route => route.fulfill({ headers, json: { items: consumed ? [] : [{ id, groupId: group.id, groupName: group.name, title: "Nadia vous a mentionné", body: messages[0]!.text, type: "MENTION", entityId: "source-message", readAt: null, createdAt: "2026-11-18T09:00:00Z" }], unreadCount: consumed ? 0 : 1, nextCursor: null } }));
    await page.route(`**/api/v1/notifications/${id}/open`, route => {
      if (route.request().method() === "OPTIONS") return route.fulfill({ status: 204, headers });
      expect(route.request().method()).toBe("POST"); consumed = true; opens++;
      return route.fulfill({ headers, json: { href: `/app/groups/${group.id}?message=source-message`, unreadCount: 0 } });
    });
    await page.goto("/app/notifications");
    await page.getByRole("button", { name: /Nadia vous a mentionné/ }).click();
    await expect(page).toHaveURL(/message=source-message/); expect(opens).toBe(1);
    await expect(page.locator("#message-source-message")).toBeVisible();
    const input = page.getByRole("textbox", { name: en ? "Your message" : "Votre message", exact: true });
    await input.fill("@Nad");
    await expect(page.getByRole("option", { name: "@Nadia Team" })).toBeVisible();
    await expect(page.getByRole("option", { name: "@Nadia Team" }).locator("img")).toBeVisible();
    await page.screenshot({ path: test.info().outputPath("mention-picker.png") });
    const box = await page.getByRole("listbox").boundingBox();
    expect(box!.x).toBeGreaterThanOrEqual(0); expect(box!.x + box!.width).toBeLessThanOrEqual(width);
    await input.press("Enter");
    await expect(input).toHaveValue("@Nadia Team ");
    await input.press("End"); await input.pressSequentially("@tous");
    await page.getByRole("button", { name: /@tous/ }).click();
    await page.getByRole("button", { name: en ? "Send message" : "Envoyer le message", exact: true }).click();
    await expect(input).toHaveValue(""); expect(sent).toBe(1);
    await page.goto("/app/notifications");
    await expect(page.getByText(en ? "No notifications" : "Aucune notification", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: /Nadia vous a mentionné/ })).toHaveCount(0);
    expect(await page.locator("body").evaluate(node => node.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);
    expect(errors).toEqual([]);
  });
}
