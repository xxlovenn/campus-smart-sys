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
import { IsBoolean, IsOptional, IsString, MinLength } from 'class-validator';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { ProfileService } from './profile.service';

class UpdateProfileDto {
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

@Controller('profile')
export class ProfileController {
  constructor(private profile: ProfileService) {}

  @UseGuards(JwtAuthGuard)
  @Get('me')
  me(@Req() req: { user: { id: string } }) {
    return this.profile.getOrCreate(req.user.id);
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

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.LEAGUE_ADMIN)
  @Get('admin/pending')
  pending() {
    return this.profile.listPendingReviews();
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.LEAGUE_ADMIN)
  @Patch('admin/:userId/review')
  review(@Param('userId') userId: string, @Body() body: ReviewDto) {
    return this.profile.review(userId, body);
  }
}
