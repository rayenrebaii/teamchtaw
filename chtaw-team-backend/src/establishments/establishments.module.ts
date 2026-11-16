import { Body, Controller, Delete, Get, Global, HttpCode, Module, Param, ParseUUIDPipe, Patch, Post } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { Admin, CurrentUser, Public } from "../auth/security";
import { Actor } from "../common/access";
import { EstablishmentDto } from "./establishments.dto";
import { EstablishmentsService } from "./establishments.service";
import { StudentSchoolsService } from "./student-schools.service";
import { PrismaService } from "../prisma/prisma.module";
import { IsIn, IsUUID } from "class-validator";

class ReviewSchoolDto { @IsIn(["APPROVED", "REJECTED"]) status!: "APPROVED" | "REJECTED"; }
class AssignSchoolDto { @IsUUID() establishmentId!: string; }

@Controller("establishments")
export class PublicEstablishmentsController {
  constructor(private db: PrismaService) {}
  @Public() @Get() list() { return this.db.establishment.findMany({ select: { id: true, name: true }, orderBy: [{ name: "asc" }, { id: "asc" }] }); }
}

@Admin() @ApiBearerAuth() @Controller("admin")
export class StudentSchoolsController {
  constructor(private schools: StudentSchoolsService) {}
  @Get("establishment-suggestions") list(@CurrentUser() actor: Actor) { return this.schools.suggestions(actor); }
  @Patch("establishment-suggestions/:id") review(@CurrentUser() actor: Actor, @Param("id", ParseUUIDPipe) id: string, @Body() dto: ReviewSchoolDto) {
    return this.schools.review(actor, id, dto.status);
  }
  @Patch("students/:id/establishment") assign(@CurrentUser() actor: Actor, @Param("id", ParseUUIDPipe) id: string, @Body() dto: AssignSchoolDto) {
    return this.schools.assign(actor, id, dto.establishmentId);
  }
}

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

@Global()
@Module({ controllers: [EstablishmentsController, PublicEstablishmentsController, StudentSchoolsController], providers: [EstablishmentsService, StudentSchoolsService], exports: [StudentSchoolsService] })
export class EstablishmentsModule {}
