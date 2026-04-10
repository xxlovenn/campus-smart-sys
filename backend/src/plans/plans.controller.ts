import { Body, Controller, Delete, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { IsBoolean, IsEnum, IsOptional, IsString, MinLength } from 'class-validator';
import { PlanPriority, PlanSource } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PlansService } from './plans.service';

class CreatePlanDto {
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
  @IsEnum(PlanPriority)
  priority?: PlanPriority;
  @IsOptional()
  @IsEnum(PlanSource)
  source?: PlanSource;
  @IsOptional()
  @IsString()
  dueAt?: string;
  @IsOptional()
  @IsBoolean()
  syncedToTimeline?: boolean;
}

@Controller('plans')
export class PlansController {
  constructor(private plans: PlansService) {}

  @UseGuards(JwtAuthGuard)
  @Get()
  list(@Req() req: { user: { id: string } }) {
    return this.plans.list(req.user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Get('timeline')
  timeline(@Req() req: { user: { id: string } }) {
    return this.plans.timeline(req.user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Post()
  create(@Req() req: { user: { id: string } }, @Body() body: CreatePlanDto) {
    return this.plans.create(req.user.id, body);
  }

  @UseGuards(JwtAuthGuard)
  @Delete(':id')
  remove(@Req() req: { user: { id: string } }, @Param('id') id: string) {
    return this.plans.remove(req.user.id, id);
  }
}
