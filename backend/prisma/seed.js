/* eslint-disable @typescript-eslint/no-require-imports */
const {
  PrismaClient,
  UserRole,
  OrganizationMemberRole,
  TaskStatus,
  PlanPriority,
  PlanSource,
  ProfileReviewStatus,
} = require('@prisma/client');
const bcrypt = require('bcrypt');
const { randomUUID } = require('crypto');

const prisma = new PrismaClient();

async function main() {
  const password = await bcrypt.hash('demo123456', 10);

  const league = await prisma.user.upsert({
    where: { email: 'league@campus.demo' },
    update: {},
    create: {
      id: randomUUID(),
      email: 'league@campus.demo',
      passwordHash: password,
      name: '团委管理员',
      studentId: 'ADMIN001',
      phone: '13800000001',
      role: UserRole.LEAGUE_ADMIN,
    },
  });

  const orgAdmin = await prisma.user.upsert({
    where: { email: 'org@campus.demo' },
    update: { role: UserRole.STUDENT },
    create: {
      id: randomUUID(),
      email: 'org@campus.demo',
      passwordHash: password,
      name: '社团负责人',
      studentId: 'ORG001',
      phone: '13800000002',
      role: UserRole.STUDENT,
    },
  });

  const student = await prisma.user.upsert({
    where: { email: 'student@campus.demo' },
    update: {},
    create: {
      id: randomUUID(),
      email: 'student@campus.demo',
      passwordHash: password,
      name: '演示学生',
      studentId: '20260001',
      phone: '13800000003',
      role: UserRole.STUDENT,
    },
  });

  const org1 = await prisma.organization.upsert({
    where: { id: '00000000-0000-4000-8000-000000000001' },
    update: {},
    create: {
      id: '00000000-0000-4000-8000-000000000001',
      nameZh: '计算机协会',
      nameEn: 'Computer Association',
      nameRu: 'Компьютерная ассоциация',
      typeZh: '社团',
      typeEn: 'Club',
      typeRu: 'Клуб',
    },
  });

  const org2 = await prisma.organization.upsert({
    where: { id: '00000000-0000-4000-8000-000000000002' },
    update: {},
    create: {
      id: '00000000-0000-4000-8000-000000000002',
      nameZh: '学生会',
      nameEn: 'Student Union',
      nameRu: 'Студенческий совет',
      typeZh: '学生会',
      typeEn: 'Student union',
      typeRu: 'Студсовет',
    },
  });

  await prisma.organizationMember.upsert({
    where: {
      userId_organizationId: { userId: orgAdmin.id, organizationId: org1.id },
    },
    update: {
      memberRole: OrganizationMemberRole.ORG_ADMIN,
      roleZh: '会长',
      roleEn: 'President',
      roleRu: 'Председатель',
    },
    create: {
      id: randomUUID(),
      userId: orgAdmin.id,
      organizationId: org1.id,
      memberRole: OrganizationMemberRole.ORG_ADMIN,
      roleZh: '会长',
      roleEn: 'President',
      roleRu: 'Председатель',
    },
  });

  await prisma.organizationMember.upsert({
    where: {
      userId_organizationId: { userId: student.id, organizationId: org1.id },
    },
    update: {},
    create: {
      id: randomUUID(),
      userId: student.id,
      organizationId: org1.id,
    },
  });

  await prisma.profile.upsert({
    where: { userId: student.id },
    update: {},
    create: {
      userId: student.id,
      githubUrl: 'https://github.com/demo-student',
      identityZh: '本科在读 / 计算机',
      identityEn: 'Undergraduate / CS',
      identityRu: 'Бакалавр / ИТ',
      reviewStatus: ProfileReviewStatus.PENDING,
    },
  });

  await prisma.scheduleEntry.deleteMany({ where: { userId: student.id } });
  await prisma.scheduleEntry.createMany({
    data: [
      {
        id: randomUUID(),
        userId: student.id,
        courseZh: '数据结构',
        courseEn: 'Data Structures',
        courseRu: 'Структуры данных',
        weekday: 1,
        startTime: '09:00',
        endTime: '10:40',
        locationZh: '教学楼 A101',
        locationEn: 'Building A101',
        locationRu: 'Ауд. A101',
      },
      {
        id: randomUUID(),
        userId: student.id,
        courseZh: '俄语口语',
        courseEn: 'Russian Speaking',
        courseRu: 'Разговорный русский',
        weekday: 3,
        startTime: '14:00',
        endTime: '15:40',
        locationZh: '语言中心',
        locationEn: 'Language Center',
        locationRu: 'Языковой центр',
      },
    ],
  });

  await prisma.personalPlan.deleteMany({ where: { userId: student.id } });
  await prisma.personalPlan.createMany({
    data: [
      {
        id: randomUUID(),
        userId: student.id,
        titleZh: '完成大赛项目文档',
        titleEn: 'Finish competition docs',
        titleRu: 'Документация проекта',
        priority: PlanPriority.HIGH,
        source: PlanSource.PERSONAL,
        dueAt: new Date(Date.now() + 3 * 86400000),
        syncedToTimeline: true,
      },
    ],
  });

  const taskId = '00000000-0000-4000-8000-0000000000t1';
  await prisma.task.upsert({
    where: { id: taskId },
    update: {},
    create: {
      id: taskId,
      titleZh: '跨组织活动筹备',
      titleEn: 'Cross-org event prep',
      titleRu: 'Подготовка межорганизационного мероприятия',
      descZh: '协调计算机协会与学生会的联合活动',
      descEn: 'Coordinate joint event',
      descRu: 'Совместное мероприятие',
      status: TaskStatus.IN_PROGRESS,
      dueAt: new Date(Date.now() + 5 * 86400000),
      creatorId: orgAdmin.id,
      assigneeId: student.id,
      primaryOrgId: org1.id,
    },
  });

  await prisma.taskOrganization.upsert({
    where: {
      taskId_organizationId: { taskId, organizationId: org2.id },
    },
    update: {},
    create: { taskId, organizationId: org2.id },
  });

  await prisma.award.deleteMany({ where: { profileUserId: student.id } });
  await prisma.award.createMany({
    data: [
      {
        id: randomUUID(),
        profileUserId: student.id,
        titleZh: '校级优秀学生',
        titleEn: 'University merit student',
        titleRu: 'Отличник университета',
      },
    ],
  });

  await prisma.skillTag.deleteMany({ where: { profileUserId: student.id } });
  await prisma.skillTag.createMany({
    data: [
      {
        id: randomUUID(),
        profileUserId: student.id,
        categoryZh: '技术',
        categoryEn: 'Tech',
        categoryRu: 'Технологии',
        nameZh: 'TypeScript',
        nameEn: 'TypeScript',
        nameRu: 'TypeScript',
      },
    ],
  });

  console.log('Seed completed. Demo passwords: demo123456');
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    prisma.$disconnect();
    process.exit(1);
  });
