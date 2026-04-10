import { Controller, Get, Param, Patch, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { NotificationsService } from './notifications.service';

@Controller('notifications')
export class NotificationsController {
  constructor(private notifications: NotificationsService) {}

  @UseGuards(JwtAuthGuard)
  @Get()
  list(@Req() req: { user: { id: string } }) {
    return this.notifications.list(req.user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Patch(':id/read')
  read(@Req() req: { user: { id: string } }, @Param('id') id: string) {
    return this.notifications.markRead(req.user.id, id);
  }

  @UseGuards(JwtAuthGuard)
  @Patch('read-all')
  readAll(@Req() req: { user: { id: string } }) {
    return this.notifications.markAllRead(req.user.id);
  }
}
