import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  Logger,
  ValidationPipe,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import type { Response } from "express";
import { randomUUID } from "node:crypto";
export const validationPipe = () =>
  new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    transformOptions: { enableImplicitConversion: false },
    validationError: { target: false, value: false },
  });
@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  private logger = new Logger("HTTP");
  catch(error: unknown, host: ArgumentsHost) {
    if (host.getType() !== "http") return;
    const response = host.switchToHttp().getResponse<Response>();
    const requestId = randomUUID();
    let status = 500;
    let message: unknown = "Erreur interne.";
    if (error instanceof HttpException) {
      status = error.getStatus();
      message = error.getResponse();
    } else if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === "P2002") {
        status = 409;
        message = "Cette ressource existe déjà.";
      } else if (["P2003", "P2025"].includes(error.code)) {
        status = 409;
        message = "Opération incompatible avec les données actuelles.";
      }
    }
    if (status === 500)
      this.logger.error(
        `requestId=${requestId} category=${error instanceof Error ? error.constructor.name : "Unknown"}`,
      );
    response
      .status(status)
      .json({ statusCode: status, message, requestId, timestamp: new Date().toISOString() });
  }
}
