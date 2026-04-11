import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MinLength,
} from 'class-validator';
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

  @IsString()
  @MinLength(1)
  descZh?: string;

  @IsString()
  @MinLength(1)
  descEn?: string;

  @IsString()
  @MinLength(1)
  descRu?: string;

  @IsOptional()
  @IsString()
  startAt?: string;

  @IsOptional()
  @IsString()
  endAt?: string;

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

  @IsOptional()
  @IsString()
  targetType?: 'ORGS' | 'ALL_STUDENTS' | 'GRADE' | 'MAJOR' | 'CLASS';

  @IsOptional()
  @IsString()
  targetGrade?: string;

  @IsOptional()
  @IsString()
  targetMajor?: string;

  @IsOptional()
  @IsString()
  targetClass?: string;
}

class OrgReviewTaskRequestDto {
  @IsBoolean()
  approve!: boolean;
  @IsOptional()
  @IsString()
  reason?: string;
}

class UpdateStatusDto {
  @IsEnum(TaskStatus)
  status!: TaskStatus;
}

class ReviewTaskRequestDto {
  @IsBoolean()
  approve!: boolean;
  @IsOptional()
  @IsString()
  reason?: string;
}

@Controller('tasks')
export class TasksController {
  constructor(private tasks: TasksService) {}

  @UseGuards(JwtAuthGuard)
  @Get()
  list(@Req() req: { user: { id: string; role: UserRole } }) {
    return this.tasks.listVisible(req.user.id, req.user.role);
  }

  @UseGuards(JwtAuthGuard)
  @Get('recommendations')
  recommendations(@Req() req: { user: { id: string; role: UserRole } }) {
    return this.tasks.recommendations(req.user.id, req.user.role);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.LEAGUE_ADMIN)
  @Get('admin/overview')
  overview() {
    return this.tasks.adminOverview();
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.LEAGUE_ADMIN)
  @Get('admin/requests')
  requests() {
    return this.tasks.pendingRequests();
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.LEAGUE_ADMIN)
  @Patch('admin/requests/:id/review')
  reviewRequest(
    @Req() req: { user: { id: string } },
    @Param('id') id: string,
    @Body() body: ReviewTaskRequestDto,
  ) {
    return this.tasks.reviewRequest(id, req.user.id, body.approve, body.reason);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ORG_ADMIN)
  @Get('org/requests')
  orgRequests(@Req() req: { user: { id: string } }) {
    return this.tasks.orgReviewRequests(req.user.id);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ORG_ADMIN)
  @Patch('org/requests/:id/review')
  orgReviewRequest(
    @Req() req: { user: { id: string } },
    @Param('id') id: string,
    @Body() body: OrgReviewTaskRequestDto,
  ) {
    return this.tasks.orgReviewRequest(id, req.user.id, body.approve, body.reason);
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

  @UseGuards(JwtAuthGuard)
  @Delete(':id')
  remove(@Req() req: { user: { id: string; role: UserRole } }, @Param('id') id: string) {
    return this.tasks.remove(req.user.id, req.user.role, id);
  }
}