import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';

const LOGIN_EMAIL = 'league@campus.demo';
const LOGIN_PASSWORD = 'demo123456';
const SEEDED_TASK_ID = '00000000-0000-4000-8000-0000000000t1';
const DEFAULT_DATABASE_URL = 'postgresql://campus:campus@localhost:5433/campus_smart?schema=public';

describe('App e2e baseline', () => {
  let app: INestApplication;
  let token = '';

  beforeAll(async () => {
    process.env.DATABASE_URL = process.env.DATABASE_URL || DEFAULT_DATABASE_URL;

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('POST /api/auth/login returns access token', async () => {
    const response = await request(app.getHttpServer()).post('/api/auth/login').send({
      email: LOGIN_EMAIL,
      password: LOGIN_PASSWORD,
    });

    expect(response.status).toBe(201);
    expect(response.body.accessToken).toEqual(expect.any(String));
    expect(response.body.user?.email).toBe(LOGIN_EMAIL);
    token = response.body.accessToken;
  });

  it('GET /api/users/me returns current user profile', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/users/me')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.email).toBe(LOGIN_EMAIL);
    expect(response.body.id).toEqual(expect.any(String));
    expect(response.body.role).toEqual(expect.any(String));
  });

  it('PATCH /api/tasks/:id/status updates seeded task status', async () => {
    const listResponse = await request(app.getHttpServer())
      .get('/api/tasks')
      .set('Authorization', `Bearer ${token}`);

    expect(listResponse.status).toBe(200);
    const seededTask = (listResponse.body as Array<{ id: string; status: string }>).find(
      (task) => task.id === SEEDED_TASK_ID,
    );
    expect(seededTask).toBeDefined();

    const nextStatus = seededTask?.status === 'DONE' ? 'IN_PROGRESS' : 'DONE';
    const response = await request(app.getHttpServer())
      .patch(`/api/tasks/${SEEDED_TASK_ID}/status`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: nextStatus });

    expect(response.status).toBe(200);
    expect(response.body.id).toBe(SEEDED_TASK_ID);
    expect(response.body.status).toBe(nextStatus);
  });
});
