import { randomUUID } from 'node:crypto';
import { getUser, verifyRequestOrigin } from '@netlify/identity';
import type { Config } from '@netlify/server';
import { and, eq, sql } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { campaignQuota } from '../../db/schema.js';
import { CAMPAIGN_ENDPOINT, CAMPAIGN_LIMIT, isRecipientEmail } from '../../src/utils/promotionEmail.js';

export const config: Config = { path: '/api/promotion-email' };

const quotaDay = sql<string>`(now() AT TIME ZONE 'America/Sao_Paulo')::date`;
const sameDay = sql`${campaignQuota.day} = ${quotaDay}`;
const quotaRow = eq(campaignQuota.id, 1);
const currentQuota = {
  sent: sql<number>`CASE WHEN ${sameDay} THEN ${campaignQuota.sent} ELSE 0 END`,
  remaining: sql<number>`CASE WHEN ${sameDay} THEN ${CAMPAIGN_LIMIT} - ${campaignQuota.reserved} ELSE ${CAMPAIGN_LIMIT} END`,
};

async function readQuota() {
  const [quota] = await db.select(currentQuota).from(campaignQuota).where(quotaRow);
  return quota ?? { sent: 0, remaining: CAMPAIGN_LIMIT };
}

function parseScriptUrl(value: string): URL | null {
  try {
    const url = new URL(value);
    return url.origin === 'https://script.google.com' && !url.username && !url.password &&
      /^\/macros\/s\/[\w-]+\/exec$/.test(url.pathname) && !url.search && !url.hash ? url : null;
  } catch {
    return null;
  }
}

async function sendThroughScript(script: URL, payload: { to_email: string; subject: string; html_body: string }) {
  const signal = AbortSignal.timeout(15_000);
  let response = await fetch(script, {
    method: 'POST',
    body: JSON.stringify(payload),
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    redirect: 'manual',
    signal,
  });
  if (response.status === 302 || response.status === 303) {
    const destination = new URL(response.headers.get('location') ?? '', script);
    await response.body?.cancel();
    if (destination.origin !== 'https://script.googleusercontent.com' ||
        destination.pathname !== '/macros/echo' || destination.username || destination.password) return false;
    response = await fetch(destination, { redirect: 'error', signal });
  }
  if (!response.ok) return false;
  const text = (await response.text()).trim();
  if (/^(ok|success)$/i.test(text)) return true;
  try {
    const result = JSON.parse(text);
    return result?.ok === true || result?.success === true || result?.status === 'success';
  } catch {
    return false;
  }
}

const json = (data: object, status = 200) => Response.json(data, {
  status,
  headers: { 'Cache-Control': 'no-store' },
});

export default async function handler(request: Request) {
  if (new URL(request.url).pathname !== CAMPAIGN_ENDPOINT) return json({ error: 'Rota inválida.' }, 404);
  if (request.method !== 'POST' && request.method !== 'GET') return json({ error: 'Método inválido.' }, 405);
  const user = await getUser();
  if (!user) return json({ error: 'Entre na conta autorizada para usar as campanhas.' }, 401);
  if (!user.roles?.includes('admin')) return json({ error: 'A conta não tem a função admin para disparar campanhas.' }, 403);

  try {
    if (request.method === 'GET') return json({ quota: await readQuota() });
    try {
      verifyRequestOrigin(request);
    } catch {
      return json({ error: 'Origem não autorizada.' }, 403);
    }
    const body = await request.json().catch(() => null);
    const script = typeof body?.scriptUrl === 'string' && parseScriptUrl(body.scriptUrl.trim());
    const { to, subject, html } = body ?? {};
    if (!script || typeof to !== 'string' || !isRecipientEmail(to) ||
        typeof subject !== 'string' || !subject.trim() || subject.length > 250 || /[\r\n]/.test(subject) ||
        typeof html !== 'string' || !html.trim() || html.length > 100_000) {
      return json({ error: 'Confira a URL /exec do Google Apps Script, o destinatário, o assunto e o HTML.' }, 400);
    }

    const reservationId = randomUUID();
    await db.insert(campaignQuota).values({ id: 1, day: quotaDay }).onConflictDoNothing();
    const [reservation] = await db.update(campaignQuota).set({
      day: quotaDay,
      reserved: sql`CASE WHEN ${sameDay} THEN ${campaignQuota.reserved} + 1 ELSE 1 END`,
      sent: currentQuota.sent,
      nextSendAt: sql`now() + interval '30 seconds'`,
      reservationId,
    }).where(and(quotaRow, sql`(${campaignQuota.day} <> ${quotaDay} OR ${campaignQuota.reserved} < ${CAMPAIGN_LIMIT})`,
      sql`${campaignQuota.nextSendAt} <= now()`)).returning({ id: campaignQuota.id });

    if (!reservation) {
      const quota = await readQuota();
      return json({ quota, error: quota.remaining === 0
        ? 'Limite diário de campanhas atingido.'
        : 'Há outro envio em andamento ou em intervalo de segurança. Nenhum novo e-mail foi disparado.' }, 429);
    }

    const confirmed = await sendThroughScript(script, { to_email: to, subject, html_body: html }).catch(() => false);
    await db.update(campaignQuota).set({
      sent: sql`${campaignQuota.sent} + ${confirmed ? 1 : 0}`,
      nextSendAt: sql`now() + interval '2 seconds'`,
      reservationId: null,
    }).where(and(quotaRow, eq(campaignQuota.reservationId, reservationId)));
    const quota = await readQuota();
    return confirmed ? json({ quota }) : json({ quota, error:
      'O Google Apps Script não confirmou o envio. A tentativa consome uma vaga de segurança. Confira o disparador antes de repetir.' }, 502);
  } catch {
    return json({ error: 'Não foi possível atualizar o controle de envios. Confira o contador antes de tentar de novo.' }, 503);
  }
}
