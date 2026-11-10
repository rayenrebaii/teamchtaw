import {
  Body,
  Controller,
  Delete,
  HttpCode,
  Get,
  Module,
  Param,
  ParseUUIDPipe,
  Patch,
  Put,
  Query,
} from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { Organizer, CurrentUser } from "../auth/security";
import { Actor } from "../common/access";
import { AttendanceService } from "./attendance.service";
import { AttendanceQueryDto, PersonalAttendanceQueryDto } from "./attendance.dto";
import {
  ConfirmAbsenceDto,
  SessionParticipantDto,
  SaveAttendanceDto,
  UpdateSessionDto,
} from "./polls.dto";
import { MandatoryAttendanceService } from "./mandatory-attendance.service";
import { SessionManagementService } from "./session-management.service";

@ApiTags("Attendance")
@ApiBearerAuth()
@Controller()
export class AttendanceController {
  constructor(
    private attendance: AttendanceService,
    private mandatory: MandatoryAttendanceService,
    private management: SessionManagementService,
  ) {}
  @Organizer() @Get("organizer/absence-alerts/:id") alertDetail(@CurrentUser() actor: Actor, @Param("id", ParseUUIDPipe) id: string) {
    return this.attendance.alertDetail(actor, id);
  }
  @Organizer() @Put("organizer/absence-alerts/:id/confirm") confirmAlert(@CurrentUser() actor: Actor, @Param("id", ParseUUIDPipe) id: string) {
    return this.attendance.alertDetail(actor, id, true);
  }
  @Organizer() @Delete("polls/:id/options/:optionId") removeSlot(
    @CurrentUser() actor: Actor, @Param("id", ParseUUIDPipe) id: string, @Param("optionId", ParseUUIDPipe) optionId: string,
  ) { return this.management.removeSlot(actor, id, optionId); }
  @Organizer() @Delete("polls/:id") @HttpCode(204) remove(@CurrentUser() actor: Actor, @Param("id", ParseUUIDPipe) id: string) {
    return this.management.remove(actor, id);
  }
  @Organizer() @Get("admin/attendance/sessions") sessions(
    @CurrentUser() actor: Actor,
    @Query() query: AttendanceQueryDto,
  ) {
    return this.mandatory.sessions(actor, query);
  }
  @Organizer() @Get("admin/attendance/reports") reports(
    @CurrentUser() actor: Actor,
    @Query() query: AttendanceQueryDto,
  ) {
    return this.mandatory.reports(actor, query);
  }
  @Organizer() @Put("polls/:id/attendance/absence/:userId") confirm(
    @CurrentUser() actor: Actor,
    @Param("id", ParseUUIDPipe) id: string,
    @Param("userId", ParseUUIDPipe) userId: string,
    @Body() dto: ConfirmAbsenceDto,
  ) {
    return this.mandatory.confirmAbsence(actor, id, userId, dto);
  }
  @Organizer() @Put("polls/:id/attendance/participants/:userId") participant(
    @CurrentUser() actor: Actor,
    @Param("id", ParseUUIDPipe) id: string,
    @Param("userId", ParseUUIDPipe) userId: string,
    @Body() dto: SessionParticipantDto,
  ) {
    return this.mandatory.participant(actor, id, userId, dto);
  }
  @Organizer() @Get("admin/attendance") overview(
    @CurrentUser() actor: Actor,
    @Query() query: AttendanceQueryDto,
  ) {
    return this.attendance.overview(actor, query);
  }
  @Organizer() @Get("polls/:id/attendance") roster(
    @CurrentUser() actor: Actor,
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    return this.attendance.roster(actor, id);
  }
  @Organizer() @Put("polls/:id/attendance") save(
    @CurrentUser() actor: Actor,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: SaveAttendanceDto,
  ) {
    return this.attendance.save(actor, id, dto);
  }
  @Organizer() @Patch("polls/:id") update(
    @CurrentUser() actor: Actor,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: UpdateSessionDto,
  ) {
    return this.attendance.update(actor, id, dto);
  }
  @Organizer() @Get("users/:id/attendance") history(
    @CurrentUser() actor: Actor,
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    return this.attendance.history(actor, id);
  }
  @Get("attendance/me") mine(@CurrentUser() actor: Actor, @Query() query: PersonalAttendanceQueryDto) {
    return this.attendance.personalHistory(actor, query);
  }
  @Organizer() @Get("admin/absence-alerts") alerts(@CurrentUser() actor: Actor) {
    return this.attendance.alerts(actor);
  }
  @Organizer() @Patch("admin/absence-alerts/:id/read") read(
    @CurrentUser() actor: Actor,
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    return this.attendance.readAlert(actor, id);
  }
}
@Module({
  providers: [AttendanceService, MandatoryAttendanceService, SessionManagementService],
  controllers: [AttendanceController],
})
export class AttendanceModule {}
