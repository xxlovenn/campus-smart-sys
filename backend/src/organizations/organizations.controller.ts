import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { IsEnum, IsOptional, IsString, IsUUID, MinLength } from 'class-validator';
import { OrganizationMemberRole, OrganizationStatus, UserRole } from '@prisma/client';
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
  @IsOptional()
  @IsString()
  descriptionZh?: string;
  @IsOptional()
  @IsString()
  descriptionEn?: string;
  @IsOptional()
  @IsString()
  descriptionRu?: string;
  @IsString()
  @MinLength(1)
  typeZh!: string;
  @IsString()
  @MinLength(1)
  typeEn!: string;
  @IsString()
  @MinLength(1)
  typeRu!: string;
  @IsOptional()
  @IsUUID()
  leaderUserId?: string;
}

class DeleteOrgDto {
  @IsString()
  @MinLength(1)
  operatorName!: string;
}

class AddOrgMemberDto {
  @IsUUID()
  userId!: string;
  @IsOptional()
  @IsEnum(OrganizationMemberRole)
  memberRole?: OrganizationMemberRole;
  @IsOptional()
  @IsString()
  roleZh?: string;
  @IsOptional()
  @IsString()
  roleEn?: string;
  @IsOptional()
  @IsString()
  roleRu?: string;
}

class UpdateOrgDto {
  @IsString()
  @MinLength(1)
  nameZh!: string;
  @IsString()
  @MinLength(1)
  nameEn!: string;
  @IsString()
  @MinLength(1)
  nameRu!: string;
  @IsOptional()
  @IsString()
  descriptionZh?: string;
  @IsOptional()
  @IsString()
  descriptionEn?: string;
  @IsOptional()
  @IsString()
  descriptionRu?: string;
  @IsString()
  @MinLength(1)
  typeZh!: string;
  @IsString()
  @MinLength(1)
  typeEn!: string;
  @IsString()
  @MinLength(1)
  typeRu!: string;
  @IsOptional()
  @IsUUID()
  leaderUserId?: string;
}

class UpdateOrgStatusDto {
  @IsEnum(OrganizationStatus)
  status!: OrganizationStatus;
}

class UpdateOrgCredentialDto {
  @IsString()
  @MinLength(6)
  account!: string;
  @IsString()
  @MinLength(6)
  password!: string;
}

class QueryOrgLogsDto {
  @IsOptional()
  @IsString()
  limit?: string;
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

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.LEAGUE_ADMIN)
  @Get('admin/list')
  adminList() {
    return this.orgs.adminList();
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.LEAGUE_ADMIN, UserRole.ORG_ADMIN)
  @Get(':id/detail')
  detail(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Req() req: { user: { id: string; role: UserRole } },
  ) {
    return this.orgs.detail(id, req.user.id, req.user.role);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.LEAGUE_ADMIN, UserRole.ORG_ADMIN)
  @Patch(':id')
  update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: UpdateOrgDto,
    @Req() req: { user: { id: string; role: UserRole } },
  ) {
    return this.orgs.update(id, body, req.user.id, req.user.role);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.LEAGUE_ADMIN, UserRole.ORG_ADMIN)
  @Patch(':id/status')
  updateStatus(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: UpdateOrgStatusDto,
    @Req() req: { user: { id: string; role: UserRole } },
  ) {
    return this.orgs.updateStatus(id, body.status, req.user.id, req.user.role);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.LEAGUE_ADMIN, UserRole.ORG_ADMIN)
  @Get(':id/change-logs')
  changeLogs(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Query() query: QueryOrgLogsDto,
    @Req() req: { user: { id: string; role: UserRole } },
  ) {
    const limit = Number(query.limit ?? 20) || 20;
    return this.orgs.changeLogs(id, req.user.id, req.user.role, limit);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.LEAGUE_ADMIN, UserRole.ORG_ADMIN)
  @Post(':id/members')
  addMember(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: AddOrgMemberDto,
    @Req() req: { user: { id: string; role: UserRole } },
  ) {
    return this.orgs.addMember(id, body, req.user.id, req.user.role);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.LEAGUE_ADMIN, UserRole.ORG_ADMIN)
  @Delete(':id/members/:userId')
  removeMember(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('userId', new ParseUUIDPipe()) userId: string,
    @Req() req: { user: { id: string; role: UserRole } },
  ) {
    return this.orgs.removeMember(id, userId, req.user.id, req.user.role);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.LEAGUE_ADMIN)
  @Patch(':id/credential')
  updateCredential(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: UpdateOrgCredentialDto,
  ) {
    return this.orgs.updateCredential(id, body.account, body.password);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.LEAGUE_ADMIN)
  @Delete(':id')
  remove(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: DeleteOrgDto,
  ) {
    return this.orgs.remove(id, body.operatorName);
  }
}
