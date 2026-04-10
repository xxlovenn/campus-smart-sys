import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { IsString, MinLength } from 'class-validator';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { OrganizationsService } from './organizations.service';

class CreateOrgDto {
  @IsString()
  @MinLength(1)
  nameZh!: string;
  @IsString()
  @MinLength(1)
  nameEn!: string;
  @IsString()
  @MinLength(1)
  nameRu!: string;
  @IsString()
  @MinLength(1)
  typeZh!: string;
  @IsString()
  @MinLength(1)
  typeEn!: string;
  @IsString()
  @MinLength(1)
  typeRu!: string;
}

@Controller('organizations')
export class OrganizationsController {
  constructor(private orgs: OrganizationsService) {}

  @UseGuards(JwtAuthGuard)
  @Get()
  list(@Req() req: { user: { id: string; role: UserRole } }) {
    return this.orgs.listForUser(req.user.id, req.user.role);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.LEAGUE_ADMIN)
  @Post()
  create(@Body() body: CreateOrgDto) {
    return this.orgs.create(body);
  }
}
