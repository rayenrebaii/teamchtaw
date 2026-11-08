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
import { Admin, CurrentUser } from "../auth/security";
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
  @Admin() @Delete("polls/:id/options/:optionId") removeSlot(
    @CurrentUser() actor: Actor, @Param("id", ParseUUIDPipe) id: string, @Param("optionId", ParseUUIDPipe) optionId: string,
  ) { return this.management.removeSlot(actor, id, optionId); }
  @Admin() @Delete("polls/:id") @HttpCode(204) remove(@CurrentUser() actor: Actor, @Param("id", ParseUUIDPipe) id: string) {
    return this.management.remove(actor, id);
  }
  @Admin() @Get("admin/attendance/sessions") sessions(
    @CurrentUser() actor: Actor,
    @Query() query: AttendanceQueryDto,
  ) {
    return this.mandatory.sessions(actor, query);
  }
  @Admin() @Get("admin/attendance/reports") reports(
    @CurrentUser() actor: Actor,
    @Query() query: AttendanceQueryDto,
  ) {
    return this.mandatory.reports(actor, query);
  }
  @Admin() @Put("polls/:id/attendance/absence/:userId") confirm(
    @CurrentUser() actor: Actor,
    @Param("id", ParseUUIDPipe) id: string,
    @Param("userId", ParseUUIDPipe) userId: string,
    @Body() dto: ConfirmAbsenceDto,
  ) {
    return this.mandatory.confirmAbsence(actor, id, userId, dto);
  }
  @Admin() @Put("polls/:id/attendance/participants/:userId") participant(
    @CurrentUser() actor: Actor,
    @Param("id", ParseUUIDPipe) id: string,
    @Param("userId", ParseUUIDPipe) userId: string,
    @Body() dto: SessionParticipantDto,
  ) {
    return this.mandatory.participant(actor, id, userId, dto);
  }
  @Admin() @Get("admin/attendance") overview(
    @CurrentUser() actor: Actor,
    @Query() query: AttendanceQueryDto,
  ) {
    return this.attendance.overview(actor, query);
  }
  @Admin() @Get("polls/:id/attendance") roster(
    @CurrentUser() actor: Actor,
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    return this.attendance.roster(actor, id);
  }
  @Admin() @Put("polls/:id/attendance") save(
    @CurrentUser() actor: Actor,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: SaveAttendanceDto,
  ) {
    return this.attendance.save(actor, id, dto);
  }
  @Admin() @Patch("polls/:id") update(
    @CurrentUser() actor: Actor,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: UpdateSessionDto,
  ) {
    return this.attendance.update(actor, id, dto);
  }
  @Admin() @Get("users/:id/attendance") history(
    @CurrentUser() actor: Actor,
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    return this.attendance.history(actor, id);
  }
  @Get("attendance/me") mine(@CurrentUser() actor: Actor, @Query() query: PersonalAttendanceQueryDto) {
    return this.attendance.personalHistory(actor, query);
  }
  @Admin() @Get("admin/absence-alerts") alerts(@CurrentUser() actor: Actor) {
    return this.attendance.alerts(actor);
  }
  @Admin() @Patch("admin/absence-alerts/:id/read") read(
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
