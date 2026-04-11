import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { OrganizationsModule } from './organizations/organizations.module';
import { TasksModule } from './tasks/tasks.module';
import { PlansModule } from './plans/plans.module';
import { TimetableModule } from './schedule/timetable.module';
import { ProfileModule } from './profile/profile.module';
import { NotificationsModule } from './notifications/notifications.module';
import { RemindersModule } from './reminders/reminders.module';
import { AuthorizationModule } from './authorization/authorization.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    AuthorizationModule,
    AuthModule,
    UsersModule,
    OrganizationsModule,
    TasksModule,
    PlansModule,
    TimetableModule,
    ProfileModule,
    NotificationsModule,
    RemindersModule,
  ],
})
export class AppModule {}
