import { Body, Controller, Delete, Get, HttpCode, Module, Param, ParseUUIDPipe, Patch, Post } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { Admin, CurrentUser } from "../auth/security";
import { Actor } from "../common/access";
import { EstablishmentDto } from "./establishments.dto";
import { EstablishmentsService } from "./establishments.service";

@ApiTags("Establishments")
@ApiBearerAuth()
@Admin()
@Controller("admin/establishments")
export class EstablishmentsController {
  constructor(private establishments: EstablishmentsService) {}
  @Get() list(@CurrentUser() actor: Actor) { return this.establishments.list(actor); }
  @Get(":id") get(@CurrentUser() actor: Actor, @Param("id", ParseUUIDPipe) id: string) {
    return this.establishments.get(actor, id);
  }
  @Post() create(@CurrentUser() actor: Actor, @Body() dto: EstablishmentDto) {
    return this.establishments.create(actor, dto);
  }
  @Patch(":id") update(@CurrentUser() actor: Actor, @Param("id", ParseUUIDPipe) id: string, @Body() dto: EstablishmentDto) {
    return this.establishments.update(actor, id, dto);
  }
  @Delete(":id") @HttpCode(204) remove(@CurrentUser() actor: Actor, @Param("id", ParseUUIDPipe) id: string) {
    return this.establishments.remove(actor, id);
  }
}

@Module({ controllers: [EstablishmentsController], providers: [EstablishmentsService] })
export class EstablishmentsModule {}
