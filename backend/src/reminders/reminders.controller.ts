import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RemindersService } from './reminders.service';

@Controller('reminders')
export class RemindersController {
  constructor(private reminders: RemindersService) {}

  @UseGuards(JwtAuthGuard)
  @Get('upcoming')
  upcoming(@Req() req: { user: { id: string } }) {
    return this.reminders.upcomingForUser(req.user.id);
  }
}
