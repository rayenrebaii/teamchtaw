import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Module,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
} from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { Actor } from "../common/access";
import { Admin, CurrentUser } from "../auth/security";
import { GroupsService } from "./groups.service";
import { CreateGroupDto, MoveMemberDto, UpdateGroupDto } from "./groups.dto";
import { GroupJoinRequestsService } from "./group-join-requests.service";
import { IsIn } from "class-validator";
class JoinReviewDto {
  @IsIn(["APPROVED", "REJECTED"]) status!: "APPROVED" | "REJECTED";
}
@ApiTags("Groups")
@ApiBearerAuth()
@Controller("groups")
export class GroupsController {
  constructor(private groups: GroupsService, private joinRequests: GroupJoinRequestsService) {}
  @Get() list(@CurrentUser() actor: Actor) {
    return this.groups.list(actor);
  }
  @Get("directory") directory(@CurrentUser() actor: Actor) {
    return this.joinRequests.directory(actor);
  }
  @Admin() @Get("join-requests") pending(@CurrentUser() actor: Actor) {
    return this.joinRequests.pending(actor);
  }
  @Admin() @Patch("join-requests/:id") reviewJoinRequest(
    @CurrentUser() actor: Actor, @Param("id", ParseUUIDPipe) id: string, @Body() dto: JoinReviewDto,
  ) {
    return this.joinRequests.review(actor, id, dto.status);
  }
  @Post(":id/join-requests") requestJoin(@CurrentUser() actor: Actor, @Param("id", ParseUUIDPipe) id: string) {
    return this.joinRequests.request(actor, id);
  }
  @Get(":id") get(@CurrentUser() actor: Actor, @Param("id", ParseUUIDPipe) id: string) {
    return this.groups.get(actor, id);
  }
  @Admin() @Post() create(@CurrentUser() actor: Actor, @Body() dto: CreateGroupDto) {
    return this.groups.create(actor, dto);
  }
  @Admin() @Patch(":id") update(
    @CurrentUser() actor: Actor,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: UpdateGroupDto,
  ) {
    return this.groups.update(actor, id, dto);
  }
  @Admin() @Delete(":id") @HttpCode(204) delete(
    @CurrentUser() actor: Actor,
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    return this.groups.delete(actor, id);
  }
  @Admin() @Put(":id/members/:userId") member(
    @CurrentUser() actor: Actor,
    @Param("id", ParseUUIDPipe) id: string,
    @Param("userId", ParseUUIDPipe) userId: string,
  ) {
    return this.groups.member(actor, id, userId, true);
  }
  @Admin() @Delete(":id/members/:userId") remove(
    @CurrentUser() actor: Actor,
    @Param("id", ParseUUIDPipe) id: string,
    @Param("userId", ParseUUIDPipe) userId: string,
  ) {
    return this.groups.member(actor, id, userId, false);
  }
  @Admin() @Post("members/:userId/move") move(
    @CurrentUser() actor: Actor,
    @Param("userId", ParseUUIDPipe) userId: string,
    @Body() dto: MoveMemberDto,
  ) {
    return this.groups.move(actor, userId, dto.fromGroupId, dto.toGroupId);
  }
}
@Module({ controllers: [GroupsController], providers: [GroupsService, GroupJoinRequestsService], exports: [GroupsService] })
export class GroupsModule {}
