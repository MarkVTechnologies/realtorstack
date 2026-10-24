import bcrypt from 'bcryptjs';
import sharp from 'sharp';
import { pathToFileURL } from 'node:url';
import type { Types } from 'mongoose';
import { Estate, Product, RealtorProfile, Tenant, Touch, User, Booking, ShareEvent, type TenantDoc } from './models/index.js';
import { createRealtor } from './services/realtors.js';
import { ingestLeadEvent } from './services/attribution.js';
import { recordPayment } from './services/commission.js';
import { storeImage } from './services/storage.js';
import { randomToken } from './lib/crypto.js';
import { addDays, lagosDateKey, lagosDateTime } from './lib/format.js';

export const DEMO_PASSWORD = 'Password123!';

/** Generates a simple branded placeholder photo so demo sites look realistic without stock images. */
async function placeholder(tenantId: string, title: string, hueA: string, hueB: string, seed: number) {
  const hills = Array.from({ length: 4 }, (_, i) => {
    const y = 520 + i * 60 + (seed % 3) * 10;
    return `<path d="M0 ${y} Q 400 ${y - 120 + i * 20} 800 ${y - 30} T 1600 ${y - 10} V 1000 H 0 Z" fill="#ffffff" opacity="${0.08 + i * 0.05}"/>`;
  }).join('');
  const houses = Array.from({ length: 6 }, (_, i) => {
    const x = 150 + i * 230 + (seed * 37) % 60;
    const h = 120 + ((i + seed) % 3) * 40;
    return `<g opacity="0.9"><rect x="${x}" y="${760 - h}" width="150" height="${h}" fill="#ffffff" opacity="0.85"/><path d="M${x - 15} ${760 - h} L${x + 75} ${700 - h} L${x + 165} ${760 - h} Z" fill="#ffffff"/><rect x="${x + 55}" y="${760 - 60}" width="40" height="60" fill="${hueA}" opacity="0.6"/></g>`;
  }).join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="1000"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${hueA}"/><stop offset="1" stop-color="${hueB}"/></linearGradient></defs><rect width="1600" height="1000" fill="url(#g)"/><circle cx="${1250 - seed * 40}" cy="230" r="110" fill="#fff" opacity="0.25"/>${hills}${houses}<rect y="760" width="1600" height="240" fill="#ffffff" opacity="0.18"/></svg>`;
  const buf = await sharp(Buffer.from(svg)).png().toBuffer();
  return storeImage(tenantId, buf);
}

export async function seedDemo({ log = console.log }: { log?: (...a: unknown[]) => void } = {}) {
  if (await Tenant.exists({ slug: 'oakwood' })) {
    log('[seed] demo firm already exists — skipping');
    return;
  }
  log('[seed] creating demo firm "Oakwood Homes & Estates"…');
  const tenant: TenantDoc = await Tenant.create({
    name: 'Oakwood Homes & Estates',
    slug: 'oakwood',
    cacNumber: 'RC 1234567',
    brand: { primaryColor: '#0f5132', accentColor: '#c9a227', theme: 'modern' },
    contact: { phone: '+2348031234567', whatsapp: '+2348031234567', email: 'sales@oakwood.ng', address: '12 Admiralty Way, Lekki Phase 1, Lagos' },
    registration: { code: randomToken(9), enabled: true, requireApproval: true },
    billing: { status: 'pilot', seatLimit: 100, monthlyFee: 0 },
    settings: {
      site: {
        heroTitle: 'Own land in Lagos’ fastest-growing corridor',
        heroSubtitle: 'Verified titles, flexible installment plans and free weekly site inspections.',
        whyBuy: [
          { title: 'Verified titles', text: 'Every estate comes with genuine, checkable title documents.' },
          { title: 'Flexible payments', text: 'Spread payments over up to 18 months with a small deposit.' },
          { title: 'Free inspections', text: 'Join our free weekend inspection bus from Lekki.' },
        ],
        faqs: [
          { q: 'Can I pay in installments?', a: 'Yes. Most plots have 6, 12 and 18-month plans. Your realtor will share the schedule.' },
          { q: 'When do I get my documents?', a: 'Contract of sale and receipt immediately; allocation letter and survey after full payment.' },
          { q: 'Is there a fee to inspect?', a: 'No — site inspections are free. Book a slot on this page.' },
        ],
      },
    },
    privacyPolicy:
      'Oakwood Homes & Estates (the controller) collects your name, phone number and email when you enquire, so that our realtors can contact you about properties you are interested in. RealtorStack processes this data on our behalf. We do not sell your data. You can ask us to export or delete your data at any time by emailing sales@oakwood.ng.',
  });
  const tid = String(tenant._id);

  const hash = await bcrypt.hash(DEMO_PASSWORD, 12);
  const staff = [
    { role: 'owner', name: 'Chidi Okafor', email: 'owner@oakwood.ng' },
    { role: 'admin', name: 'Bisi Adeyemi', email: 'admin@oakwood.ng' },
    { role: 'sales_manager', name: 'Adaeze Nwosu', email: 'sales@oakwood.ng' },
    { role: 'finance', name: 'Kunle Bello', email: 'finance@oakwood.ng' },
  ] as const;
  const users: Record<string, InstanceType<typeof User>> = {};
  for (const s of staff) {
    users[s.role] = await User.create({ tenantId: tenant._id, ...s, passwordHash: hash, status: 'active' });
  }

  // Estates with generated images
  const lekki = await Estate.create({
    tenantId: tenant._id,
    name: 'Oak Gardens',
    slug: 'oak-gardens',
    tagline: 'Dry, gated plots 5 minutes from the Lekki Free Trade Zone',
    description:
      'Oak Gardens is a serviced residential estate in Eleko, Ibeju-Lekki, minutes from the Lekki Free Trade Zone, Dangote Refinery and the new Lekki Deep Sea Port.\n\nThe estate is fully fenced and gated, with good road network, drainage and electricity. Build immediately after allocation.',
    location: { state: 'Lagos', lga: 'Ibeju-Lekki', area: 'Eleko', address: 'Eleko Junction, off Lekki-Epe Expressway', lat: 6.4569, lng: 3.9046 },
    documents: ['C of O', 'Registered Survey', 'Deed of Assignment'],
    amenities: ['Gated & fenced', 'Good road network', 'Drainage', 'Electricity', '24/7 security', 'Recreation park'],
    status: 'selling',
    inspection: { days: [3, 6], times: ['10:00', '13:00'], meetingPoint: 'Oakwood office, 12 Admiralty Way, Lekki Phase 1', transportNotes: 'Free bus departs 30 minutes before each slot.', daysAhead: 30, capacityPerSlot: 18 },
    shareCaption: '🏡 Own a plot at {estate}, {location}! C of O title. Prices from {price} with flexible installments. Book a FREE inspection: {link}',
    sortOrder: 1,
  });
  const abuja = await Estate.create({
    tenantId: tenant._id,
    name: 'Cedar Court',
    slug: 'cedar-court',
    tagline: 'Luxury terraces in Lokogoma, Abuja',
    description: 'Cedar Court is a boutique development of 4-bedroom terraces with BQ in Lokogoma, Abuja. Off-plan pricing with 18-month payment plans.',
    location: { state: 'FCT', lga: 'AMAC', area: 'Lokogoma', address: 'Lokogoma District, Abuja', lat: 8.9806, lng: 7.4776 },
    documents: ['C of O', 'Building Approval'],
    amenities: ['Swimming pool', 'Gym', 'Solar street lights', 'Children’s play area', 'Central water'],
    status: 'selling',
    inspection: { days: [6], times: ['11:00'], meetingPoint: 'Cedar Court site office, Lokogoma', daysAhead: 30 },
    sortOrder: 2,
  });
  const epe = await Estate.create({
    tenantId: tenant._id,
    name: 'Palm Ridge',
    slug: 'palm-ridge',
    tagline: 'Affordable plots near the new Epe airport corridor',
    description: 'Palm Ridge is our newest estate in Epe, Lagos. Register interest for pre-launch prices.',
    location: { state: 'Lagos', lga: 'Epe', area: 'Ketu-Epe' },
    documents: ["Governor's Consent", 'Excision'],
    amenities: ['Gated', 'Proposed shopping mall'],
    status: 'coming_soon',
    inspection: { days: [6], times: ['12:00'], meetingPoint: 'Epe roundabout', daysAhead: 30 },
    sortOrder: 3,
  });
  const imgs = [
    [lekki, ['#0f5132', '#2f8f5b'], ['#14532d', '#65a30d']],
    [abuja, ['#1e3a8a', '#0e7490'], ['#312e81', '#7c3aed']],
    [epe, ['#9a3412', '#d97706'], ['#7c2d12', '#ca8a04']],
  ] as const;
  for (const [estate, a, b] of imgs) {
    const one = await placeholder(tid, estate.name, a[0], a[1], 1);
    const two = await placeholder(tid, `${estate.name} · Site view`, b[0], b[1], 2);
    estate.set('media.images', [{ ...one, alt: `${estate.name} estate entrance` }, { ...two, alt: `${estate.name} site view` }]);
    await estate.save();
  }

  const p300 = await Product.create({
    tenantId: tenant._id, estateId: lekki._id, name: '300 sqm plot', size: '300 sqm', type: 'plot', outrightPrice: 6_500_000, sortOrder: 1,
    plans: [
      { name: '6 months', depositAmount: 1_500_000, tenorMonths: 6, monthlyAmount: 900_000, totalPrice: 6_900_000 },
      { name: '12 months', depositAmount: 1_500_000, tenorMonths: 12, monthlyAmount: 480_000, totalPrice: 7_260_000 },
    ],
  });
  await Product.create({
    tenantId: tenant._id, estateId: lekki._id, name: '600 sqm plot', size: '600 sqm', type: 'plot', outrightPrice: 12_000_000, sortOrder: 2,
    plans: [{ name: '12 months', depositAmount: 3_000_000, tenorMonths: 12, monthlyAmount: 820_000, totalPrice: 12_840_000 }],
    promo: { price: 11_000_000, label: 'Early-bird price', startsAt: addDays(new Date(), -3), endsAt: addDays(new Date(), 30) },
  });
  await Product.create({
    tenantId: tenant._id, estateId: abuja._id, name: '4-bed terrace + BQ', size: '4 bed', type: 'house', outrightPrice: 95_000_000,
    plans: [{ name: '18 months', depositAmount: 25_000_000, tenorMonths: 18, monthlyAmount: 4_200_000, totalPrice: 100_600_000 }],
    commission: { type: 'percent', value: 3 },
  });
  await Product.create({ tenantId: tenant._id, estateId: epe._id, name: '500 sqm plot', size: '500 sqm', type: 'plot', outrightPrice: 3_500_000, plans: [] });

  // Realtors
  const tobi = await createRealtor({ tenant, name: 'Tobi Adewale', phone: '08061112222', email: 'tobi@example.com', status: 'active', source: 'invite' });
  const amaka = await createRealtor({ tenant, name: 'Amaka Eze', phone: '08073334444', email: 'amaka@example.com', status: 'active', source: 'invite' });
  const femi = await createRealtor({ tenant, name: 'Femi Johnson', phone: '08095556666', status: 'active', source: 'csv' });
  await createRealtor({ tenant, name: 'Grace Okon', phone: '08117778888', status: 'pending', source: 'registration_link' });
  await createRealtor({ tenant, name: 'Sani Musa', phone: '09012223333', email: 'sani@example.com', status: 'invited', source: 'invite' });
  for (const r of [tobi, amaka, femi]) {
    r.user.passwordHash = hash;
    r.user.phoneVerifiedAt = new Date();
    await r.user.save();
  }
  await RealtorProfile.updateOne({ tenantId: tenant._id, userId: tobi.user._id }, {
    $set: {
      bio: 'I help busy professionals buy verified land in Lekki and Ibeju-Lekki without stress. 5+ years in real estate, 120+ happy clients.',
      areasServed: ['Lekki', 'Ibeju-Lekki', 'Ajah'],
      testimonials: [{ name: 'Mrs. Funke A.', text: 'Tobi was patient and honest. I paid in installments and got my documents on time.' }],
      lastShareAt: new Date(),
    },
  });

  // Simulated activity to make dashboards meaningful
  const now = new Date();
  const days = (n: number) => addDays(now, -n);
  type Ch = 'whatsapp' | 'instagram' | 'facebook' | 'qr';
  const visit = (realtorId: Types.ObjectId, vid: string, at: Date, channel: Ch = 'whatsapp', estateId: Types.ObjectId = lekki._id) =>
    Touch.create({ tenantId: tenant._id, realtorId, estateId, type: 'shortlink', channel, vid, at, phone: null });

  for (const [i, r] of [tobi, tobi, amaka, femi].entries()) {
    await ShareEvent.create({ tenantId: tenant._id, realtorId: r.user._id, estateId: lekki._id, channel: 'whatsapp', at: days(i * 3) });
  }
  for (let i = 0; i < 60; i++) {
    const r = [tobi, amaka, femi][i % 3];
    await visit(r.user._id, `seedvisitor${i}`, days(i % 28), (['whatsapp', 'instagram', 'facebook', 'qr'] as const)[i % 4], i % 2 ? lekki._id : abuja._id);
  }

  // Funmi: came via Tobi's link, enquired → booked → paid deposit
  await visit(tobi.user._id, 'funmivisitor01', days(12));
  const funmi = await ingestLeadEvent({ tenant, phone: '08023456789', name: 'Funmi Lawal', email: 'funmi@example.com', realtorId: tobi.user._id, vid: 'funmivisitor01', channel: 'whatsapp', estateId: lekki._id, eventType: 'form', message: 'Is the 300sqm still available? I want the 12 month plan.', consent: true, at: days(12) });
  // Later she clicks Amaka's link too → competing claim, first touch keeps Tobi
  await visit(amaka.user._id, 'funmivisitor02', days(5), 'instagram');
  await ingestLeadEvent({ tenant, phone: '+234 802 345 6789', name: 'Funmi Lawal', realtorId: amaka.user._id, vid: 'funmivisitor02', channel: 'instagram', estateId: lekki._id, eventType: 'whatsapp_click', consent: true, at: days(5) });
  const slotDay = lagosDateKey(days(8));
  await Booking.create({ tenantId: tenant._id, leadId: funmi.lead._id, estateId: lekki._id, realtorId: tobi.user._id, slotAt: lagosDateTime(slotDay, '10:00'), dateKey: slotDay, time: '10:00', attendees: 2, name: 'Funmi Lawal', phone: funmi.lead.phone, status: 'attended' });
  await recordPayment({ tenant, leadId: String(funmi.lead._id), amount: 1_500_000, type: 'deposit', productId: String(p300._id), planName: '12 months', reference: 'TRF-OAK-0001', paidAt: days(4), provider: 'bank_transfer', actorId: users.finance._id, actorRole: 'finance' });

  // Emeka: Amaka's lead, outright purchase → commission earned
  await visit(amaka.user._id, 'emekavisitor01', days(20), 'facebook');
  const emeka = await ingestLeadEvent({ tenant, phone: '08151234567', name: 'Emeka Obi', realtorId: amaka.user._id, vid: 'emekavisitor01', channel: 'facebook', estateId: lekki._id, eventType: 'form', consent: true, at: days(20) });
  await recordPayment({ tenant, leadId: String(emeka.lead._id), amount: 6_500_000, type: 'outright', productId: String(p300._id), reference: 'TRF-OAK-0002', paidAt: days(15), provider: 'bank_transfer', actorId: users.finance._id, actorRole: 'finance' });

  // A few fresh leads
  const fresh = [
    { name: 'Ngozi Umeh', phone: '08034561234', r: tobi, estate: abuja },
    { name: 'Yusuf Ibrahim', phone: '08098761234', r: femi, estate: lekki },
    { name: 'Kemi Alabi', phone: '07012349876', r: amaka, estate: abuja },
    { name: 'David Etim', phone: '08187654321', r: null, estate: lekki },
  ];
  for (const [i, f] of fresh.entries()) {
    await ingestLeadEvent({ tenant, phone: f.phone, name: f.name, realtorId: f.r?.user._id ?? null, estateId: f.estate._id, eventType: 'form', channel: 'whatsapp', consent: true, at: days(i + 1) });
  }
  // Upcoming inspection
  const upcoming = lagosDateKey(addDays(now, 3));
  const ngozi = await ingestLeadEvent({ tenant, phone: '08034561234', realtorId: tobi.user._id, estateId: lekki._id, eventType: 'booking', consent: true });
  await Booking.create({ tenantId: tenant._id, leadId: ngozi.lead._id, estateId: lekki._id, realtorId: tobi.user._id, slotAt: lagosDateTime(upcoming, '10:00'), dateKey: upcoming, time: '10:00', attendees: 1, name: 'Ngozi Umeh', phone: ngozi.lead.phone });

  // Switch the firm to review-on-conflict so the queue demo is visible, then create one open conflict.
  tenant.set('settings.attribution.model', 'first_touch_review');
  await tenant.save();
  await visit(femi.user._id, 'kemivisitor02', days(0), 'whatsapp', abuja._id);
  await ingestLeadEvent({ tenant, phone: '07012349876', realtorId: femi.user._id, vid: 'kemivisitor02', estateId: abuja._id, eventType: 'form', message: 'Can I see the terrace this weekend?', consent: true });
  tenant.set('settings.attribution.model', 'first_touch');
  await tenant.save();

  log('[seed] demo ready');
  log(`[seed]   staff logins (password ${DEMO_PASSWORD}): owner@oakwood.ng, admin@oakwood.ng, sales@oakwood.ng, finance@oakwood.ng`);
  log(`[seed]   realtor login: tobi@example.com / ${DEMO_PASSWORD}  (or OTP with 08061112222)`);
}

// `npm run seed` (stop the dev server first when using the embedded database)
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const { connectDb, disconnectDb } = await import('./db/connect.js');
  await connectDb();
  await seedDemo();
  await disconnectDb();
}
