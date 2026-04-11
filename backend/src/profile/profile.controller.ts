import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { IsBoolean, IsIn, IsOptional, IsString, MinLength } from 'class-validator';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { ProfileService } from './profile.service';

class UpdateProfileDto {
  @IsOptional()
  @IsString()
  name?: string;
  @IsOptional()
  @IsString()
  studentId?: string;
  @IsOptional()
  @IsString()
  phone?: string;
  @IsOptional()
  @IsString()
  email?: string;
  @IsOptional()
  @IsString()
  grade?: string;
  @IsOptional()
  @IsString()
  major?: string;
  @IsOptional()
  @IsString()
  githubUrl?: string;
  @IsOptional()
  @IsString()
  identityZh?: string;
  @IsOptional()
  @IsString()
  identityEn?: string;
  @IsOptional()
  @IsString()
  identityRu?: string;
}

class AwardDto {
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
  proofUrl?: string;
}

class TagDto {
  @IsString()
  @MinLength(1)
  categoryZh!: string;
  @IsString()
  @MinLength(1)
  categoryEn!: string;
  @IsString()
  @MinLength(1)
  categoryRu!: string;
  @IsString()
  @MinLength(1)
  nameZh!: string;
  @IsString()
  @MinLength(1)
  nameEn!: string;
  @IsString()
  @MinLength(1)
  nameRu!: string;
}

class ReviewDto {
  @IsBoolean()
  approve!: boolean;
  @IsOptional()
  @IsString()
  reason?: string;
}

class ItemReviewDto {
  @IsBoolean()
  approve!: boolean;
  @IsOptional()
  @IsString()
  reason?: string;
}

class GradeMajorRequestDto {
  @IsOptional()
  @IsString()
  grade?: string;
  @IsOptional()
  @IsString()
  major?: string;
}

class SearchStudentsQuery {
  @IsOptional()
  @IsString()
  keyword?: string;
  @IsOptional()
  @IsString()
  @IsIn(['name', 'studentId', 'idCard'])
  mode?: 'name' | 'studentId' | 'idCard';
}

class AdminUpdateUserProfileDto {
  @IsOptional()
  @IsString()
  name?: string;
  @IsOptional()
  @IsString()
  studentId?: string;
  @IsOptional()
  @IsString()
  idCard?: string;
  @IsOptional()
  @IsString()
  phone?: string;
  @IsOptional()
  @IsString()
  grade?: string;
  @IsOptional()
  @IsString()
  major?: string;
  @IsOptional()
  @IsString()
  className?: string;
  @IsOptional()
  @IsString()
  githubUrl?: string;
  @IsOptional()
  @IsString()
  identityZh?: string;
  @IsOptional()
  @IsString()
  identityEn?: string;
  @IsOptional()
  @IsString()
  identityRu?: string;
}

class CreateMetaOptionDto {
  @IsString()
  @MinLength(1)
  name!: string;
}

@Controller('profile')
export class ProfileController {
  constructor(private profile: ProfileService) {}

  @UseGuards(JwtAuthGuard)
  @Get('me')
  me(@Req() req: { user: { id: string } }) {
    return this.profile.getOrCreate(req.user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Get('options')
  optionsForUser() {
    return this.profile.listMetaOptions();
  }

  @UseGuards(JwtAuthGuard)
  @Patch('me')
  updateMe(@Req() req: { user: { id: string } }, @Body() body: UpdateProfileDto) {
    return this.profile.updateMe(req.user.id, body);
  }

  @UseGuards(JwtAuthGuard)
  @Post('awards')
  addAward(@Req() req: { user: { id: string } }, @Body() body: AwardDto) {
    return this.profile.addAward(req.user.id, body);
  }

  @UseGuards(JwtAuthGuard)
  @Delete('awards/:id')
  removeAward(@Req() req: { user: { id: string } }, @Param('id') id: string) {
    return this.profile.removeAward(req.user.id, id);
  }

  @UseGuards(JwtAuthGuard)
  @Post('tags')
  addTag(@Req() req: { user: { id: string } }, @Body() body: TagDto) {
    return this.profile.addTag(req.user.id, body);
  }

  @UseGuards(JwtAuthGuard)
  @Delete('tags/:id')
  removeTag(@Req() req: { user: { id: string } }, @Param('id') id: string) {
    return this.profile.removeTag(req.user.id, id);
  }

  @UseGuards(JwtAuthGuard)
  @Get('me/requests')
  myRequests(@Req() req: { user: { id: string } }) {
    return this.profile.myItemRequests(req.user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Get('me/grade-major-requests')
  myGradeMajorRequests(@Req() req: { user: { id: string } }) {
    return this.profile.myGradeMajorRequests(req.user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Post('me/grade-major-request')
  submitGradeMajorRequest(
    @Req() req: { user: { id: string } },
    @Body() body: GradeMajorRequestDto,
  ) {
    return this.profile.submitGradeMajorRequest(req.user.id, body.grade, body.major);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.LEAGUE_ADMIN)
  @Get('admin/pending')
  pending() {
    return this.profile.listPendingReviews();
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.LEAGUE_ADMIN)
  @Get('admin/review-stats')
  reviewStats() {
    return this.profile.reviewStats();
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.LEAGUE_ADMIN)
  @Patch('admin/:userId/review')
  review(@Param('userId') userId: string, @Body() body: ReviewDto) {
    return this.profile.review(userId, body);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.LEAGUE_ADMIN)
  @Get('admin/item-requests/pending')
  pendingItemRequests() {
    return this.profile.listPendingItemRequests();
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.LEAGUE_ADMIN)
  @Patch('admin/item-requests/awards/:id/review')
  reviewAwardRequest(
    @Param('id') id: string,
    @Body() body: ItemReviewDto,
    @Req() req: { user: { id: string } },
  ) {
    return this.profile.reviewAwardRequest(id, body, req.user.id);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.LEAGUE_ADMIN)
  @Patch('admin/item-requests/tags/:id/review')
  reviewTagRequest(
    @Param('id') id: string,
    @Body() body: ItemReviewDto,
    @Req() req: { user: { id: string } },
  ) {
    return this.profile.reviewTagRequest(id, body, req.user.id);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.LEAGUE_ADMIN)
  @Get('admin/grade-major-requests/pending')
  pendingGradeMajorRequests() {
    return this.profile.pendingGradeMajorRequests();
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.LEAGUE_ADMIN)
  @Patch('admin/grade-major-requests/:id/review')
  reviewGradeMajorRequest(
    @Param('id') id: string,
    @Body() body: ItemReviewDto,
    @Req() req: { user: { id: string } },
  ) {
    return this.profile.reviewGradeMajorRequest(id, body, req.user.id);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.LEAGUE_ADMIN)
  @Get('admin/user/:userId')
  getUserProfile(@Param('userId') userId: string) {
    return this.profile.getAdminUserProfile(userId);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.LEAGUE_ADMIN, UserRole.ORG_ADMIN)
  @Get('admin/students')
  searchStudents(
    @Req() req: { user: { id: string; role: UserRole } },
    @Query() query: SearchStudentsQuery,
  ) {
    const mode = query.mode ?? 'name';
    return this.profile.searchStudents(query.keyword ?? '', mode, req.user.id, req.user.role);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.LEAGUE_ADMIN)
  @Patch('admin/user/:userId')
  adminUpdateUserProfile(
    @Param('userId') userId: string,
    @Body() body: AdminUpdateUserProfileDto,
  ) {
    return this.profile.adminUpdateUserProfile(userId, body);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.LEAGUE_ADMIN)
  @Get('admin/options')
  options() {
    return this.profile.listMetaOptions();
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.LEAGUE_ADMIN)
  @Post('admin/options/grades')
  addGrade(@Body() body: CreateMetaOptionDto) {
    return this.profile.addGrade(body.name);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.LEAGUE_ADMIN)
  @Post('admin/options/majors')
  addMajor(@Body() body: CreateMetaOptionDto) {
    return this.profile.addMajor(body.name);
  }
}
