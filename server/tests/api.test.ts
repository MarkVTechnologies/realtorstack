import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { connectDb, disconnectDb } from '../src/db/connect.js';
import { createApp } from '../src/app.js';
import { seedDemo, DEMO_PASSWORD } from '../src/seed.js';
import { Lead, Tenant } from '../src/models/index.js';

const app = createApp();

async function login(email: string) {
  const agent = request.agent(app);
  const res = await agent.post('/api/auth/login').send({ email, password: DEMO_PASSWORD });
  expect(res.status).toBe(200);
  return agent;
}

beforeAll(async () => {
  await connectDb({ ephemeral: true });
  await seedDemo({ log: () => {} });
}, 120_000);

afterAll(async () => {
  await disconnectDb();
});

describe('API', () => {
  it('serves public site data without auth', async () => {
    const res = await request(app).get('/api/public/sites/oakwood');
    expect(res.status).toBe(200);
    expect(res.body.firm.name).toBe('Oakwood Homes & Estates');
    expect(res.body.estates.length).toBe(3);
    const realtor = await request(app).get('/api/public/sites/oakwood/realtors/tobi-adewale');
    expect(realtor.body.active).toBe(true);
    expect(realtor.body.realtor.whatsapp).toBe('+2348061112222');
  });

  it('resolves short links and attributes a public lead to the realtor', async () => {
    const vid = 'apitestvisitor01';
    const link = await request(app).post('/api/public/shortlink').send({ code: 'tobi001', estate: 'oak-gardens', vid, channel: 'whatsapp' });
    expect(link.body).toEqual({ firm: 'oakwood', realtor: 'tobi-adewale', estate: 'oak-gardens' });
    const lead = await request(app).post('/api/public/leads').send({ firm: 'oakwood', realtor: 'femi-johnson', estate: 'oak-gardens', name: 'Api Buyer', phone: '0809 123 4567', consent: true, vid });
    expect(lead.status).toBe(201);
    const tenant = await Tenant.findOne({ slug: 'oakwood' });
    const stored = await Lead.findOne({ tenantId: tenant!._id, phone: '+2348091234567' }).populate('realtorId', 'name');
    expect((stored!.realtorId as unknown as { name: string }).name).toBe('Tobi Adewale'); // first touch was Tobi's short link
  });

  it('requires consent and rejects bad phone numbers', async () => {
    const noConsent = await request(app).post('/api/public/leads').send({ firm: 'oakwood', name: 'X Y', phone: '08091234567' });
    expect(noConsent.status).toBe(400);
    const badPhone = await request(app).post('/api/public/leads').send({ firm: 'oakwood', name: 'X Y', phone: '1234567', consent: true });
    expect(badPhone.status).toBe(400);
  });

  it('books an inspection only into an available slot', async () => {
    const slots = await request(app).get('/api/public/sites/oakwood/estates/oak-gardens/slots');
    expect(slots.status).toBe(200);
    expect(slots.body.length).toBeGreaterThan(0);
    const s = slots.body[0];
    const ok = await request(app).post('/api/public/bookings').send({ firm: 'oakwood', realtor: 'amaka-eze', estate: 'oak-gardens', date: s.date, time: s.time, name: 'Booker', phone: '08055554444', consent: true });
    expect(ok.status).toBe(201);
    expect(ok.body.meetingPoint).toMatch(/Admiralty/);
    const bad = await request(app).post('/api/public/bookings').send({ firm: 'oakwood', estate: 'oak-gardens', date: '2020-01-01', time: '10:00', name: 'Booker', phone: '08055554444', consent: true });
    expect(bad.status).toBe(400);
  });

  it('enforces roles: realtors only see their own leads; finance cannot override', async () => {
    const tobi = await login('tobi@example.com');
    const mine = await tobi.get('/api/leads');
    expect(mine.status).toBe(200);
    expect(mine.body.items.every((l: { realtor: { name: string } | null }) => l.realtor?.name === 'Tobi Adewale')).toBe(true);
    const settings = await tobi.patch('/api/firm').send({ name: 'Hacked' });
    expect(settings.status).toBe(403);

    const finance = await login('finance@oakwood.ng');
    const leads = await finance.get('/api/leads');
    const anyLead = leads.body.items[0];
    const override = await finance.post(`/api/leads/${anyLead._id}/attribution`).send({ realtorId: null, reason: 'test' });
    expect(override.status).toBe(403);
  });

  it('resolves an open conflict and exposes dashboards', async () => {
    const admin = await login('admin@oakwood.ng');
    const open = await admin.get('/api/conflicts?status=open');
    expect(open.body.items.length).toBe(1);
    const c = open.body.items[0];
    const res = await admin.post(`/api/conflicts/${c._id}/resolve`).send({ realtorId: c.current.id, reason: 'First link confirmed from evidence' });
    expect(res.status).toBe(200);
    const dash = await admin.get('/api/analytics/firm');
    expect(dash.status).toBe(200);
    expect(dash.body.totals.leads).toBeGreaterThan(0);
    const statement = await admin.get('/api/commissions/statement?format=pdf');
    expect(statement.status).toBe(200);
    expect(statement.headers['content-type']).toMatch(/pdf/);
  });
});
