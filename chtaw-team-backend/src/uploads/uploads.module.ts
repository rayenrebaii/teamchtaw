import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Injectable,
  Logger,
  Module,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  Res,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiPropertyOptional, ApiTags } from "@nestjs/swagger";
import { ConfigService } from "@nestjs/config";
import { IsOptional, IsString, MaxLength } from "class-validator";
import type { Response } from "express";
import sharp from "sharp";
import { randomUUID } from "node:crypto";
import { PrismaService } from "../prisma/prisma.module";
import { AccessService, Actor } from "../common/access";
import { DomainEvents } from "../common/events";
import { presentMessage, messageInclude } from "../common/presenters";
import { Admin, CurrentUser } from "../auth/security";
import { MediaStorage, Storage } from "./storage.module";
export class PhotoDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(1000) caption?: string;
}
export async function sanitizeImage(bytes: Buffer, max: number) {
  if (!bytes.length || bytes.length > max) throw new BadRequestException("Image trop volumineuse.");
  try {
    const metadata = await sharp(bytes, { limitInputPixels: 25000000, animated: false }).metadata();
    if (!["jpeg", "png", "webp", "gif"].includes(metadata.format ?? "")) throw Error();
    const result = await sharp(bytes, { limitInputPixels: 25000000, animated: false })
      .rotate()
      .resize({ width: 2400, height: 2400, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 85 })
      .toBuffer({ resolveWithObject: true });
    return { buffer: result.data, width: result.info.width, height: result.info.height };
  } catch {
    throw new BadRequestException("Fichier image non reconnu, corrompu ou dimensions excessives.");
  }
}
@Injectable()
export class UploadsService {
  private logger = new Logger(UploadsService.name);
  constructor(
    private db: PrismaService,
    private access: AccessService,
    private events: DomainEvents,
    private config: ConfigService,
    @Storage() private storage: MediaStorage,
  ) {}
  async photo(actor: Actor, groupId: string, file: Express.Multer.File | undefined, dto: PhotoDto) {
    await this.db.$transaction((tx) => this.access.group(tx, actor, groupId, true));
    if (!file) throw new BadRequestException("Image requise dans le champ file.");
    const image = await sanitizeImage(
      file.buffer,
      this.config.getOrThrow<number>("UPLOAD_MAX_BYTES"),
    );
    const key = `${randomUUID()}.webp`;
    await this.storage.put(key, image.buffer);
    let message;
    try {
      message = await this.db.$transaction(async (tx) => {
        await this.access.group(tx, actor, groupId, true);
        const media = await tx.media.create({
          data: {
            groupId,
            uploaderId: actor.id,
            storageKey: key,
            mimeType: "image/webp",
            size: image.buffer.length,
            width: image.width,
            height: image.height,
          },
        });
        return presentMessage(
          await tx.message.create({
            include: messageInclude,
            data: {
              groupId,
              authorId: actor.id,
              kind: "photo",
              text: dto.caption ?? "",
              mediaId: media.id,
            },
          }),
        );
      });
    } catch (error) {
      await this.storage
        .remove(key)
        .catch(() => this.logger.warn("Failed to clean uncommitted image"));
      throw error;
    }
    await this.events.publish({ name: "message:created", groupId, payload: message });
    return message;
  }
  async open(actor: Actor, id: string) {
    const media = await this.db.$transaction(async (tx) => {
      const media = await tx.media.findUnique({ where: { id } });
      if (!media) throw new NotFoundException("Image introuvable.");
      await this.access.group(tx, actor, media.groupId);
      return media;
    });
    try {
      return { media, stream: await this.storage.open(media.storageKey) };
    } catch {
      throw new NotFoundException("Image indisponible.");
    }
  }
}
@ApiTags("Uploads")
@ApiBearerAuth()
@Controller()
export class UploadsController {
  constructor(private uploads: UploadsService) {}
  @Admin()
  @Post("groups/:groupId/photos")
  @ApiConsumes("multipart/form-data")
  @ApiBody({
    schema: {
      type: "object",
      properties: {
        file: { type: "string", format: "binary" },
        caption: { type: "string", maxLength: 1000 },
      },
      required: ["file"],
    },
  })
  @UseInterceptors(
    FileInterceptor("file", {
      limits: { fileSize: 10485760, files: 1, fields: 1, fieldSize: 4096, parts: 2 },
    }),
  )
  photo(
    @CurrentUser() actor: Actor,
    @Param("groupId", ParseUUIDPipe) groupId: string,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body() dto: PhotoDto,
  ) {
    return this.uploads.photo(actor, groupId, file, dto);
  }
  @Get("uploads/:id") async open(
    @CurrentUser() actor: Actor,
    @Param("id", ParseUUIDPipe) id: string,
    @Res({ passthrough: true }) response: Response,
  ) {
    const { media, stream } = await this.uploads.open(actor, id);
    response.set({
      "Content-Type": media.mimeType,
      "Content-Length": String(media.size),
      "Cache-Control": "private, no-store",
      "Content-Disposition": `inline; filename="${media.id}.webp"`,
      "X-Content-Type-Options": "nosniff",
    });
    return new StreamableFile(stream);
  }
}
@Module({ providers: [UploadsService], controllers: [UploadsController] })
export class UploadsModule {}
