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
const PRESET_GRADES = ['2020', '2021', '2022', '2023', '2024', '2025'];
const PRESET_MAJORS = [
  '计算机科学与技术',
  '软件工程',
  '数据科学与大数据技术',
  '人工智能',
  '网络工程',
  '信息安全',
  '电子信息工程',
  '通信工程',
  '自动化',
  '机械工程',
  '土木工程',
  '工商管理',
  '市场营销',
  '会计学',
  '金融学',
  '经济学',
  '法学',
  '英语',
  '俄语',
  '汉语言文学',
];

const COMMON_CLUBS = [
  {
    nameZh: '计算机协会',
    nameEn: 'Computer Association',
    nameRu: 'Компьютерная ассоциация',
    typeZh: '学术科技类',
    typeEn: 'Academic & Tech',
    typeRu: 'Академический и технический',
    descriptionZh: '开展编程学习、技术分享与竞赛组织。',
    descriptionEn: 'Coding study, tech sharing, and contest organization.',
    descriptionRu: 'Изучение программирования, обмен опытом и организация конкурсов.',
    account: 'club.cs@campus.demo',
    password: 'ClubCS2026!',
  },
  {
    nameZh: '人工智能社',
    nameEn: 'AI Club',
    nameRu: 'Клуб ИИ',
    typeZh: '学术科技类',
    typeEn: 'Academic & Tech',
    typeRu: 'Академический и технический',
    descriptionZh: '组织机器学习实践、模型应用与项目路演。',
    descriptionEn: 'ML practice, model application, and project demos.',
    descriptionRu: 'Практика ML, применение моделей и проектные демонстрации.',
    account: 'club.ai@campus.demo',
    password: 'ClubAI2026!',
  },
  {
    nameZh: '青年志愿者协会',
    nameEn: 'Youth Volunteers Association',
    nameRu: 'Ассоциация волонтеров',
    typeZh: '公益服务类',
    typeEn: 'Public Service',
    typeRu: 'Общественная служба',
    descriptionZh: '开展校内外志愿服务、公益活动与社区协作。',
    descriptionEn: 'Volunteer service, public welfare, and community cooperation.',
    descriptionRu: 'Волонтерская деятельность, благотворительность и сотрудничество с сообществом.',
    account: 'club.volunteer@campus.demo',
    password: 'ClubVOL2026!',
  },
  {
    nameZh: '创新创业协会',
    nameEn: 'Innovation & Entrepreneurship Club',
    nameRu: 'Клуб инноваций и предпринимательства',
    typeZh: '创新实践类',
    typeEn: 'Innovation Practice',
    typeRu: 'Инновационная практика',
    descriptionZh: '聚焦项目孵化、商业策划与创业训练。',
    descriptionEn: 'Project incubation, business planning, and startup training.',
    descriptionRu: 'Инкубация проектов, бизнес-планирование и стартап-подготовка.',
    account: 'club.ie@campus.demo',
    password: 'ClubIE2026!',
  },
  {
    nameZh: '体育竞技协会',
    nameEn: 'Sports Association',
    nameRu: 'Спортивная ассоциация',
    typeZh: '文体活动类',
    typeEn: 'Sports & Culture',
    typeRu: 'Спорт и культура',
    descriptionZh: '组织球类赛事、体能训练与校际交流。',
    descriptionEn: 'Ball games, fitness training, and inter-school exchange.',
    descriptionRu: 'Турниры, тренировки и межвузовское взаимодействие.',
    account: 'club.sports@campus.demo',
    password: 'ClubSP2026!',
  },
  {
    nameZh: '音乐与艺术社',
    nameEn: 'Music and Arts Club',
    nameRu: 'Музыкально-художественный клуб',
    typeZh: '文艺活动类',
    typeEn: 'Arts & Culture',
    typeRu: 'Искусство и культура',
    descriptionZh: '开展乐队排练、舞台演出与艺术展览。',
    descriptionEn: 'Band rehearsal, stage performance, and art exhibitions.',
    descriptionRu: 'Репетиции, выступления и художественные выставки.',
    account: 'club.arts@campus.demo',
    password: 'ClubART2026!',
  },
];

async function main() {
  const password = await bcrypt.hash('demo123456', 10);

  const league = await prisma.user.upsert({
    where: { email: 'league@campus.demo' },
    update: {
      idCard: '110101198001011234',
      grade: '2022',
      major: '学生事务管理',
      className: '团委管理班',
    },
    create: {
      id: randomUUID(),
      email: 'league@campus.demo',
      passwordHash: password,
      name: '团委管理员',
      studentId: 'ADMIN001',
      phone: '13800000001',
      idCard: '110101198001011234',
      grade: '2022',
      major: '学生事务管理',
      className: '团委管理班',
      role: UserRole.LEAGUE_ADMIN,
    },
  });

  const orgAdmin = await prisma.user.upsert({
    where: { email: 'org@campus.demo' },
    update: {
      role: UserRole.STUDENT,
      idCard: '110101199501011111',
      grade: '2023',
      major: '计算机科学',
      className: '计科1班',
    },
    create: {
      id: randomUUID(),
      email: 'org@campus.demo',
      passwordHash: password,
      name: '社团负责人',
      studentId: 'ORG001',
      phone: '13800000002',
      idCard: '110101199501011111',
      grade: '2023',
      major: '计算机科学',
      className: '计科1班',
      role: UserRole.STUDENT,
    },
  });

  const student = await prisma.user.upsert({
    where: { email: 'student@campus.demo' },
    update: {
      idCard: '110101200601011234',
      grade: '2023',
      major: '计算机科学',
      className: '计科1班',
    },
    create: {
      id: randomUUID(),
      email: 'student@campus.demo',
      passwordHash: password,
      name: '演示学生',
      studentId: '20260001',
      phone: '13800000003',
      idCard: '110101200601011234',
      grade: '2023',
      major: '计算机科学',
      className: '计科1班',
      role: UserRole.STUDENT,
    },
  });

  const approvedStudent = await prisma.user.upsert({
    where: { email: 'student.approved@campus.demo' },
    update: {
      idCard: '110101200512125678',
      grade: '2022',
      major: '软件工程',
      className: '软工2班',
    },
    create: {
      id: randomUUID(),
      email: 'student.approved@campus.demo',
      passwordHash: password,
      name: '已通过学生',
      studentId: '20260002',
      phone: '13800000004',
      idCard: '110101200512125678',
      grade: '2022',
      major: '软件工程',
      className: '软工2班',
      role: UserRole.STUDENT,
    },
  });

  const rejectedStudent = await prisma.user.upsert({
    where: { email: 'student.rejected@campus.demo' },
    update: {
      idCard: '110101200410102222',
      grade: '2021',
      major: '数据科学与大数据技术',
      className: '数科3班',
    },
    create: {
      id: randomUUID(),
      email: 'student.rejected@campus.demo',
      passwordHash: password,
      name: '已驳回学生',
      studentId: '20260003',
      phone: '13800000005',
      idCard: '110101200410102222',
      grade: '2021',
      major: '数据科学与大数据技术',
      className: '数科3班',
      role: UserRole.STUDENT,
    },
  });

  const studentUnionAccount = 'club.union@campus.demo';
  const studentUnionPassword = 'ClubUNION2026!';
  const studentUnionPasswordHash = await bcrypt.hash(studentUnionPassword, 10);
  const studentUnionAdmin = await prisma.user.upsert({
    where: { email: studentUnionAccount },
    update: {
      name: '学生会组织账号',
      passwordHash: studentUnionPasswordHash,
      isOrgAccount: true,
      role: UserRole.STUDENT,
    },
    create: {
      id: randomUUID(),
      email: studentUnionAccount,
      passwordHash: studentUnionPasswordHash,
      name: '学生会组织账号',
      isOrgAccount: true,
      role: UserRole.STUDENT,
    },
  });

  const org1 = await prisma.organization.upsert({
    where: { id: '00000000-0000-4000-8000-000000000001' },
    update: {
      descriptionZh: '面向全校的计算机技术交流社团',
      descriptionEn: 'Campus-wide technology community',
      descriptionRu: 'Техническое сообщество кампуса',
      leaderUserId: orgAdmin.id,
    },
    create: {
      id: '00000000-0000-4000-8000-000000000001',
      nameZh: '计算机协会',
      nameEn: 'Computer Association',
      nameRu: 'Компьютерная ассоциация',
      descriptionZh: '面向全校的计算机技术交流社团',
      descriptionEn: 'Campus-wide technology community',
      descriptionRu: 'Техническое сообщество кампуса',
      typeZh: '社团',
      typeEn: 'Club',
      typeRu: 'Клуб',
      leaderUserId: orgAdmin.id,
    },
  });

  const org2 = await prisma.organization.upsert({
    where: { id: '00000000-0000-4000-8000-000000000002' },
    update: {
      descriptionZh: '负责校园学生事务协调',
      descriptionEn: 'Coordinates student affairs on campus',
      descriptionRu: 'Координация студенческих дел',
      leaderUserId: league.id,
      adminUserId: studentUnionAdmin.id,
      adminAccount: studentUnionAccount,
      adminPassword: studentUnionPassword,
    },
    create: {
      id: '00000000-0000-4000-8000-000000000002',
      nameZh: '学生会',
      nameEn: 'Student Union',
      nameRu: 'Студенческий совет',
      descriptionZh: '负责校园学生事务协调',
      descriptionEn: 'Coordinates student affairs on campus',
      descriptionRu: 'Координация студенческих дел',
      typeZh: '学生会',
      typeEn: 'Student union',
      typeRu: 'Студсовет',
      leaderUserId: league.id,
      adminUserId: studentUnionAdmin.id,
      adminAccount: studentUnionAccount,
      adminPassword: studentUnionPassword,
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
      userId_organizationId: { userId: studentUnionAdmin.id, organizationId: org2.id },
    },
    update: {
      memberRole: OrganizationMemberRole.ORG_ADMIN,
      roleZh: '系统组织账号',
      roleEn: 'System org account',
      roleRu: 'Системная учетная запись',
    },
    create: {
      id: randomUUID(),
      userId: studentUnionAdmin.id,
      organizationId: org2.id,
      memberRole: OrganizationMemberRole.ORG_ADMIN,
      roleZh: '系统组织账号',
      roleEn: 'System org account',
      roleRu: 'Системная учетная запись',
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
    update: {
      submittedAt: new Date(Date.now() - 6 * 3600000),
      reviewedAt: null,
      reviewedById: null,
      rejectReason: null,
      reviewStatus: ProfileReviewStatus.PENDING,
    },
    create: {
      userId: student.id,
      githubUrl: 'https://github.com/demo-student',
      identityZh: '本科在读 / 计算机',
      identityEn: 'Undergraduate / CS',
      identityRu: 'Бакалавр / ИТ',
      reviewStatus: ProfileReviewStatus.PENDING,
      submittedAt: new Date(Date.now() - 6 * 3600000),
    },
  });

  await prisma.profile.upsert({
    where: { userId: approvedStudent.id },
    update: {
      githubUrl: 'https://github.com/demo-approved',
      identityZh: '本科在读 / 软件工程',
      identityEn: 'Undergraduate / Software Engineering',
      identityRu: 'Бакалавр / Программная инженерия',
      reviewStatus: ProfileReviewStatus.APPROVED,
      rejectReason: null,
      submittedAt: new Date(Date.now() - 3 * 86400000),
      reviewedAt: new Date(Date.now() - 2 * 86400000),
      reviewedById: league.id,
    },
    create: {
      userId: approvedStudent.id,
      githubUrl: 'https://github.com/demo-approved',
      identityZh: '本科在读 / 软件工程',
      identityEn: 'Undergraduate / Software Engineering',
      identityRu: 'Бакалавр / Программная инженерия',
      reviewStatus: ProfileReviewStatus.APPROVED,
      rejectReason: null,
      submittedAt: new Date(Date.now() - 3 * 86400000),
      reviewedAt: new Date(Date.now() - 2 * 86400000),
      reviewedById: league.id,
    },
  });

  await prisma.profile.upsert({
    where: { userId: rejectedStudent.id },
    update: {
      githubUrl: '',
      identityZh: '本科在读 / 数据科学',
      identityEn: 'Undergraduate / Data Science',
      identityRu: 'Бакалавр / Data Science',
      reviewStatus: ProfileReviewStatus.REJECTED,
      rejectReason: '身份证与学籍信息不一致，请补充证明材料后重新提交',
      submittedAt: new Date(Date.now() - 2 * 86400000),
      reviewedAt: new Date(Date.now() - 1 * 86400000),
      reviewedById: league.id,
    },
    create: {
      userId: rejectedStudent.id,
      githubUrl: '',
      identityZh: '本科在读 / 数据科学',
      identityEn: 'Undergraduate / Data Science',
      identityRu: 'Бакалавр / Data Science',
      reviewStatus: ProfileReviewStatus.REJECTED,
      rejectReason: '身份证与学籍信息不一致，请补充证明材料后重新提交',
      submittedAt: new Date(Date.now() - 2 * 86400000),
      reviewedAt: new Date(Date.now() - 1 * 86400000),
      reviewedById: league.id,
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
  await prisma.award.deleteMany({ where: { profileUserId: approvedStudent.id } });
  await prisma.award.deleteMany({ where: { profileUserId: rejectedStudent.id } });
  await prisma.award.createMany({
    data: [
      {
        id: randomUUID(),
        profileUserId: student.id,
        titleZh: '校级优秀学生',
        titleEn: 'University merit student',
        titleRu: 'Отличник университета',
      },
      {
        id: randomUUID(),
        profileUserId: approvedStudent.id,
        titleZh: '省级创新竞赛二等奖',
        titleEn: 'Provincial Innovation Contest - 2nd Prize',
        titleRu: '2-е место в региональном инновационном конкурсе',
      },
    ],
  });

  await prisma.skillTag.deleteMany({ where: { profileUserId: student.id } });
  await prisma.skillTag.deleteMany({ where: { profileUserId: approvedStudent.id } });
  await prisma.skillTag.deleteMany({ where: { profileUserId: rejectedStudent.id } });
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
      {
        id: randomUUID(),
        profileUserId: approvedStudent.id,
        categoryZh: '组织',
        categoryEn: 'Organization',
        categoryRu: 'Организация',
        nameZh: '项目统筹',
        nameEn: 'Project Coordination',
        nameRu: 'Координация проектов',
      },
      {
        id: randomUUID(),
        profileUserId: rejectedStudent.id,
        categoryZh: '志愿',
        categoryEn: 'Volunteer',
        categoryRu: 'Волонтерство',
        nameZh: '活动协助',
        nameEn: 'Event Assistance',
        nameRu: 'Помощь в мероприятиях',
      },
    ],
  });

  for (const name of PRESET_GRADES) {
    await prisma.gradeOption.upsert({
      where: { name },
      update: {},
      create: { id: randomUUID(), name },
    });
  }
  for (const name of PRESET_MAJORS) {
    await prisma.majorOption.upsert({
      where: { name },
      update: {},
      create: { id: randomUUID(), name },
    });
  }

  for (const club of COMMON_CLUBS) {
    const passwordHash = await bcrypt.hash(club.password, 10);
    const adminUser = await prisma.user.upsert({
      where: { email: club.account },
      update: {
        name: `${club.nameZh}组织账号`,
        passwordHash,
        isOrgAccount: true,
        role: UserRole.STUDENT,
      },
      create: {
        id: randomUUID(),
        email: club.account,
        passwordHash,
        name: `${club.nameZh}组织账号`,
        isOrgAccount: true,
        role: UserRole.STUDENT,
      },
    });

    const existingOrg = await prisma.organization.findFirst({
      where: { nameZh: club.nameZh },
      select: { id: true },
    });

    const org = existingOrg
      ? await prisma.organization.update({
          where: { id: existingOrg.id },
          data: {
            nameEn: club.nameEn,
            nameRu: club.nameRu,
            typeZh: club.typeZh,
            typeEn: club.typeEn,
            typeRu: club.typeRu,
            descriptionZh: club.descriptionZh,
            descriptionEn: club.descriptionEn,
            descriptionRu: club.descriptionRu,
            adminUserId: adminUser.id,
            adminAccount: club.account,
            adminPassword: club.password,
          },
        })
      : await prisma.organization.create({
          data: {
            id: randomUUID(),
            nameZh: club.nameZh,
            nameEn: club.nameEn,
            nameRu: club.nameRu,
            typeZh: club.typeZh,
            typeEn: club.typeEn,
            typeRu: club.typeRu,
            descriptionZh: club.descriptionZh,
            descriptionEn: club.descriptionEn,
            descriptionRu: club.descriptionRu,
            adminUserId: adminUser.id,
            adminAccount: club.account,
            adminPassword: club.password,
          },
        });

    await prisma.organizationMember.upsert({
      where: {
        userId_organizationId: { userId: adminUser.id, organizationId: org.id },
      },
      update: {
        memberRole: OrganizationMemberRole.ORG_ADMIN,
        roleZh: '系统组织账号',
        roleEn: 'System org account',
        roleRu: 'Системная учетная запись',
      },
      create: {
        id: randomUUID(),
        userId: adminUser.id,
        organizationId: org.id,
        memberRole: OrganizationMemberRole.ORG_ADMIN,
        roleZh: '系统组织账号',
        roleEn: 'System org account',
        roleRu: 'Системная учетная запись',
      },
    });
  }

  console.log('Seed completed. Demo passwords: demo123456');
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    prisma.$disconnect();
    process.exit(1);
  });
