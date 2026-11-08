import { INestApplication } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import helmet from "helmet";
import { json, urlencoded, type Request, type Response, type NextFunction } from "express";
import { ApiExceptionFilter, validationPipe } from "./common/http";
import { RestrictedSocketAdapter } from "./realtime/socket.adapter";
export function configureApp(app: INestApplication) {
  const config = app.get(ConfigService);
  const origins = config.getOrThrow<string[]>("CORS_ORIGINS");
  app.setGlobalPrefix("api/v1");
  app.use(helmet());
  app.use("/api/v1/notifications", (_request: Request, response: Response, next: NextFunction) => { response.setHeader("Cache-Control", "private, no-store"); next(); });
  app.use(json({ limit: "32kb" }));
  app.use(urlencoded({ extended: false, limit: "32kb" }));
  app.enableCors({
    origin: (origin: string | undefined, cb: (error: Error | null, allow?: boolean) => void) =>
      cb(null, !origin || origins.includes(origin)),
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
    allowedHeaders: ["Authorization", "Content-Type", "X-Session-Transport"],
    maxAge: 600,
  });
  app.useGlobalPipes(validationPipe());
  app.useGlobalFilters(new ApiExceptionFilter());
  app.useWebSocketAdapter(new RestrictedSocketAdapter(app, origins));
  app.enableShutdownHooks();
  if (config.get<boolean>("SWAGGER_ENABLED")) {
    const doc = SwaggerModule.createDocument(
      app,
      new DocumentBuilder()
        .setTitle("Team Chtaw API")
        .setDescription(
          "Backend communautaire. Tous les endpoints hors auth/health nécessitent Bearer JWT. Les routes de conversation exigent APPROVED et une appartenance au groupe.",
        )
        .setVersion("1.0.0")
        .addBearerAuth()
        .build(),
    );
    SwaggerModule.setup("docs", app, doc, { swaggerOptions: { persistAuthorization: false } });
  }
  return app;
}
