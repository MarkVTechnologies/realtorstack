import type { Types } from 'mongoose';
import { Notification, User, type Role, type TenantDoc } from '../models/index.js';
import { sendEmail } from './mailer.js';
import { env } from '../config/env.js';

interface NotifyInput {
  tenant: TenantDoc;
  userIds: (Types.ObjectId | string | null | undefined)[];
  type: string;
  title: string;
  body: string;
  link?: string; // dashboard path, e.g. /app/leads/123
  email?: boolean;
}

/** In-app notification + email (NT-01 / LC-06), respecting per-user preferences. */
export async function notifyUsers({ tenant, userIds, type, title, body, link, email = true }: NotifyInput) {
  const ids = [...new Set(userIds.filter(Boolean).map(String))];
  if (!ids.length) return;
  const users = await User.find({ _id: { $in: ids }, tenantId: tenant._id, status: { $in: ['active', 'pending', 'invited'] } }).lean();
  await Promise.all(
    users.map(async (u) => {
      if (u.notificationPrefs?.inApp !== false) {
        await Notification.create({ tenantId: tenant._id, userId: u._id, type, title, body, link });
      }
      if (email && u.email && u.notificationPrefs?.email !== false) {
        await sendEmail({
          tenantId: tenant._id,
          to: u.email,
          subject: title,
          heading: title,
          lines: [`Hi ${u.name.split(' ')[0]},`, body],
          cta: link ? { label: 'Open in RealtorStack', url: `${env.CLIENT_URL}${link}` } : undefined,
          brandColor: tenant.brand?.primaryColor ?? undefined,
          firmName: tenant.name,
          template: type,
        });
      }
    }),
  );
}

/** Notify all staff members holding any of the given roles. */
export async function notifyRoles(tenant: TenantDoc, roles: Role[], input: Omit<NotifyInput, 'tenant' | 'userIds'>) {
  const users = await User.find({ tenantId: tenant._id, role: { $in: roles }, status: 'active' }).select('_id').lean();
  await notifyUsers({ tenant, userIds: users.map((u) => u._id), ...input });
}
