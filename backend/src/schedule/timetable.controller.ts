import { Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TimetableService } from './timetable.service';

@Controller('schedule')
export class TimetableController {
  constructor(private timetable: TimetableService) {}

  @UseGuards(JwtAuthGuard)
  @Get()
  list(@Req() req: { user: { id: string } }) {
    return this.timetable.getMerged(req.user.id);
  }

  /** Simulated: POST to trigger sync from school API */
  @UseGuards(JwtAuthGuard)
  @Post('sync-mock')
  sync(@Req() req: { user: { id: string } }) {
    return this.timetable.syncFromMock(req.user.id);
  }
}
