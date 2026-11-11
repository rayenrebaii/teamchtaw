import {
  Body,
  Controller,
  Delete,
  NotFoundException,
  Get,
  Injectable,
  Module,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  BadRequestException,
} from "@nestjs/common";
import { ApiBearerAuth, ApiProperty, ApiTags } from "@nestjs/swagger";
import { Transform } from "class-transformer";
import { IsString, MaxLength, MinLength } from "class-validator";
import { PrismaService } from "../prisma/prisma.module";
import { AccessService, Actor } from "../common/access";
import { DomainEvents } from "../common/events";
import { presentMessage, messageInclude } from "../common/presenters";
import { PageDto } from "../common/query.dto";
import { Admin, CurrentUser } from "../auth/security";
export class SendMessageDto {
  @ApiProperty({ maxLength: 4000 })
  @IsString()
  @MinLength(1)
  @MaxLength(4000)
  @Transform(({ value }: { value: unknown }) => (typeof value === "string" ? value.trim() : value))
  text!: string;
}
@Injectable()
export class MessagesService {
  constructor(
    private db: PrismaService,
    private access: AccessService,
    private events: DomainEvents,
  ) {}
  history(actor: Actor, groupId: string, query: PageDto) {
    return this.db.$transaction(async (tx) => {
      await this.access.group(tx, actor, groupId);
      if (query.cursor && !(await tx.message.findFirst({ where: { id: query.cursor, groupId } })))
        throw new BadRequestException("Curseur invalide pour ce groupe.");
      const items = await tx.message.findMany({
        include: messageInclude,
        where: { groupId },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: query.limit + 1,
        ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
      });
      return {
        items: items.slice(0, query.limit).map(presentMessage),
        nextCursor: items.length > query.limit ? items[query.limit - 1]?.id : null,
      };
    });
  }
  async remove(actor: Actor, groupId: string, id: string) {
    await this.db.$transaction(async (tx) => {
      await this.access.group(tx, actor, groupId, true);
      const message = await tx.message.findFirst({ where: { id, groupId } });
      if (!message) throw new NotFoundException("Message introuvable.");
      await tx.notification.deleteMany({ where: { entityId: id } });
      await tx.message.delete({ where: { id } });
    });
    await this.events.publish({ name: "message:deleted", groupId, payload: { messageId: id } });
    return { messageId: id };
  }
  async send(actor: Actor, groupId: string, dto: SendMessageDto) {
    const message = await this.db.$transaction(async (tx) => {
      await this.access.group(tx, actor, groupId);
      return presentMessage(
        await tx.message.create({
          data: { groupId, authorId: actor.id, kind: "text", text: dto.text },
          include: messageInclude,
        }),
      );
    });
    await this.events.publish({ name: "message:created", groupId, payload: message });
    return message;
  }
}
@ApiTags("Messages")
@ApiBearerAuth()
@Controller("groups/:groupId/messages")
export class MessagesController {
  constructor(private messages: MessagesService) {}
  @Admin() @Delete(":id") remove(
    @CurrentUser() actor: Actor,
    @Param("groupId", ParseUUIDPipe) groupId: string,
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    return this.messages.remove(actor, groupId, id);
  }
  @Get() history(
    @CurrentUser() actor: Actor,
    @Param("groupId", ParseUUIDPipe) groupId: string,
    @Query() query: PageDto,
  ) {
    return this.messages.history(actor, groupId, query);
  }
  @Post() send(
    @CurrentUser() actor: Actor,
    @Param("groupId", ParseUUIDPipe) groupId: string,
    @Body() dto: SendMessageDto,
  ) {
    return this.messages.send(actor, groupId, dto);
  }
}
@Module({
  controllers: [MessagesController],
  providers: [MessagesService],
  exports: [MessagesService],
})
export class MessagesModule {}
