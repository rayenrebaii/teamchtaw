import "reflect-metadata";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { ForbiddenException, HttpException } from "@nestjs/common";
import { ContactDto, ContactService } from "../src/contact/contact.module";
import { Actor } from "../src/common/access";
import { contactClientIp } from "../src/contact/client-ip";
import type { Request } from "express";
const valid = { name: " Ada Lovelace ", email: "ada@example.test", subject: "registration", message: "Question about registration.", website: "" };
describe("Public contact validation and persistence", () => {
  it("ignores forwarded IPs from untrusted senders and resolves a configured proxy chain", () => {
    const request = { socket: { remoteAddress: "::ffff:127.0.0.1" }, headers: { "x-forwarded-for": "198.51.100.99, 10.0.0.2" } } as unknown as Request;
    expect(contactClientIp(request, [])).toBe("127.0.0.1");
    expect(contactClientIp(request, ["127.0.0.1"])).toBe("10.0.0.2");
    expect(contactClientIp(request, ["127.0.0.1", "10.0.0.2"])).toBe("198.51.100.99");
  });
  it.each([{ name: " " }, { email: "invalid" }, { subject: "ADMIN" }, { message: "short" }, { message: "x".repeat(5001) }, { website: "spam" }, { name: null }, { role: "ADMIN" }])("rejects invalid payload %j", async patch => {
    expect((await validate(plainToInstance(ContactDto, { ...valid, ...patch }), { whitelist: true, forbidNonWhitelisted: true })).length).toBeGreaterThan(0);
  });
  it("trims and accepts a valid payload", async () => {
    const dto = plainToInstance(ContactDto, valid);
    expect(await validate(dto)).toHaveLength(0); expect(dto.name).toBe("Ada Lovelace");
  });
  function fixture(count = 0) {
    const tx = { $queryRaw: jest.fn(), contactRequest: { count: jest.fn().mockResolvedValue(count), create: jest.fn(), findMany: jest.fn(), findUnique: jest.fn(), update: jest.fn() } };
    const db = { $transaction: (run: (t: unknown) => unknown) => run(tx) };
    const access = { actor: jest.fn().mockResolvedValue({ role: "ADMIN" }) };
    return { tx, access, service: new ContactService(db as never, access as never) };
  }
  it("stores the message without the honeypot or raw IP and acknowledges only after persistence", async () => {
    const { tx, service } = fixture();
    expect(await service.receive(valid as ContactDto, "127.0.0.1")).toEqual({ received: true });
    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
    const data = tx.contactRequest.create.mock.calls[0][0].data;
    expect(data.senderHash).toMatch(/^[a-f0-9]{64}$/); expect(data.website).toBeUndefined();
    expect(data.message).toBe(valid.message);
    tx.contactRequest.create.mockRejectedValue(new Error("database unavailable"));
    await expect(service.receive(valid as ContactDto, "127.0.0.1")).rejects.toThrow("database unavailable");
  });
  it("rejects a fourth message before writing, using the durable limit", async () => {
    const { tx, service } = fixture(3);
    await expect(service.receive(valid as ContactDto, "127.0.0.1")).rejects.toBeInstanceOf(HttpException);
    expect(tx.contactRequest.create).not.toHaveBeenCalled();
  });
  it("rechecks administrative permission for list, detail and status changes", async () => {
    const { tx, service, access } = fixture(); access.actor.mockRejectedValue(new ForbiddenException());
    for (const run of [() => service.list({} as Actor), () => service.get({} as Actor, "id"), () => service.update({} as Actor, "id", "PROCESSED")]) await expect(run()).rejects.toBeInstanceOf(ForbiddenException);
    expect(access.actor).toHaveBeenCalledWith(tx, {}, true, true);
    expect(tx.contactRequest.findMany).not.toHaveBeenCalled(); expect(tx.contactRequest.findUnique).not.toHaveBeenCalled(); expect(tx.contactRequest.update).not.toHaveBeenCalled();
  });
});
