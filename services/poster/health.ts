/**
 * Liveness, and the alarm that DeepWorm never had.
 *
 * DeepWorm's enclave ran out of gas in January 2025 and nobody noticed for
 * eighteen months. Everything in this file exists so that cannot happen
 * here: a /health endpoint a monitor can poll, and a gas alarm that shouts
 * somewhere a human actually looks, not just into a log.
 */

import { createServer } from 'node:http';

export interface HealthStatus {
  ok: boolean;
  network: string;
  chainId: number;
  stateAddress: string;
  feedAddress: string;
  poster: string;
  /** Organism, as the poster currently holds it. */
  tick: number;
  stateHash: string;
  lastPostedRound: string;
  lastPostAt: string | null;
  secondsSinceLastPost: number | null;
  /** Oracle. */
  feedRound: string;
  feedAnswer: string;
  feedUpdatedAt: string | null;
  feedStale: boolean;
  /** Gas. */
  posterBalanceEth: string;
  gasAlarmThresholdEth: string;
  gasAlarm: boolean;
  lastError: string | null;
  uptimeSeconds: number;
}

const started = Date.now();

/** Serve `read()` as JSON on PORT. 200 while ok, 503 when the gas alarm is on. */
export function startHealthServer(read: () => HealthStatus, port: number): void {
  createServer((req, res) => {
    if (req.url !== '/health' && req.url !== '/') {
      res.writeHead(404);
      res.end();
      return;
    }
    const status = { ...read(), uptimeSeconds: Math.floor((Date.now() - started) / 1000) };
    res.writeHead(status.ok ? 200 : 503, { 'content-type': 'application/json', 'cache-control': 'no-store' });
    res.end(JSON.stringify(status, null, 2));
  }).listen(port, () => console.log(`[wetware] /health on :${port}`));
}

/**
 * Where the alarm goes. Both are optional and read from the environment;
 * whichever is set gets the message. Throttled so a low balance produces one
 * message an hour, not one per poll.
 *
 *   ALERT_WEBHOOK_URL   any endpoint accepting POST {"text": "..."}; Slack and
 *                       Discord webhooks both do
 *   TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID   a Telegram bot message
 */
export class Alarm {
  private lastSentAt = 0;
  private readonly minIntervalMs: number;

  constructor(minIntervalMinutes = 60) {
    this.minIntervalMs = minIntervalMinutes * 60_000;
  }

  configured(): string[] {
    const targets: string[] = [];
    if (process.env.ALERT_WEBHOOK_URL) targets.push('webhook');
    if (process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID) targets.push('telegram');
    return targets;
  }

  /** Log loudly always; deliver externally at most once per interval. */
  async raise(message: string): Promise<void> {
    console.error(`\n[wetware] !!! ALARM !!! ${message}\n`);
    if (process.env.RUN_ONCE === '1') {
      // No memory between runs on a cron host, so throttle by the clock:
      // deliver only on the first run of each hour.
      if (new Date().getUTCMinutes() >= 10) return;
    } else {
      if (Date.now() - this.lastSentAt < this.minIntervalMs) return;
      this.lastSentAt = Date.now();
    }

    const text = `WETWARE alarm: ${message}`;
    const deliveries: Promise<unknown>[] = [];

    const webhook = process.env.ALERT_WEBHOOK_URL;
    if (webhook) {
      deliveries.push(
        fetch(webhook, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ text, content: text }),
        }),
      );
    }

    const token = process.env.TELEGRAM_BOT_TOKEN;
    const chat = process.env.TELEGRAM_CHAT_ID;
    if (token && chat) {
      deliveries.push(
        fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ chat_id: chat, text }),
        }),
      );
    }

    if (deliveries.length === 0) {
      console.error('[wetware] no alarm target configured (ALERT_WEBHOOK_URL or TELEGRAM_*). Nobody will hear this.');
      return;
    }
    const results = await Promise.allSettled(deliveries);
    for (const r of results) {
      if (r.status === 'rejected') console.error('[wetware] alarm delivery failed:', (r.reason as Error).message);
    }
  }
}
