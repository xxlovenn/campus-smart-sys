import { Body, Controller, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { IsArray, IsEnum, IsOptional, IsString, IsUUID, MinLength } from 'class-validator';
import { TaskStatus, UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { TasksService } from './tasks.service';

class CreateTaskDto {
  @IsString()
  @MinLength(1)
  titleZh!: string;
  @IsString()
  @MinLength(1)
  titleEn!: string;
  @IsString()
  @MinLength(1)
  titleRu!: string;
  @IsOptional()
  @IsString()
  descZh?: string;
  @IsOptional()
  @IsString()
  descEn?: string;
  @IsOptional()
  @IsString()
  descRu?: string;
  @IsOptional()
  @IsString()
  dueAt?: string;
  @IsOptional()
  @IsUUID()
  assigneeId?: string;
  @IsOptional()
  @IsUUID()
  primaryOrgId?: string;
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  relatedOrgIds?: string[];
}

class UpdateStatusDto {
  @IsEnum(TaskStatus)
  status!: TaskStatus;
}

@Controller('tasks')
export class TasksController {
  constructor(private tasks: TasksService) {}

  @UseGuards(JwtAuthGuard)
  @Get()
  list(@Req() req: { user: { id: string; role: UserRole } }) {
    return this.tasks.listVisible(req.user.id, req.user.role);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.LEAGUE_ADMIN)
  @Get('admin/overview')
  overview() {
    return this.tasks.adminOverview();
  }

  @UseGuards(JwtAuthGuard)
  @Post()
  create(@Req() req: { user: { id: string; role: UserRole } }, @Body() body: CreateTaskDto) {
    return this.tasks.create(req.user.id, req.user.role, body);
  }

  @UseGuards(JwtAuthGuard)
  @Patch(':id/status')
  updateStatus(
    @Req() req: { user: { id: string; role: UserRole } },
    @Param('id') id: string,
    @Body() body: UpdateStatusDto,
  ) {
    return this.tasks.updateStatus(req.user.id, req.user.role, id, body.status);
  }
}
