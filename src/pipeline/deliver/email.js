'use strict';

const nodemailer = require('nodemailer');

/**
 * Pluggable delivery. SMTP emailer when SMTP_* + BRIEF_EMAIL_TO are configured;
 * otherwise a no-op that logs (so a run never fails just because email isn't
 * wired up). Add other channels (Slack, webhook) by implementing send().
 */
class SmtpEmailer {
  constructor({ host, port, secure, user, pass, from, to }) {
    this.from = from || user;
    this.to = to;
    this.transport = nodemailer.createTransport({
      host,
      port: Number(port) || 587,
      secure: secure != null ? secure : Number(port) === 465,
      auth: user ? { user, pass } : undefined,
    });
    this.name = 'smtp';
  }

  async send({ subject, html, text }) {
    const info = await this.transport.sendMail({ from: this.from, to: this.to, subject, html, text });
    return { ok: true, messageId: info.messageId, accepted: info.accepted };
  }
}

class NullDeliverer {
  constructor(log) {
    this.log = log || console;
    this.name = 'null';
  }
  async send() {
    this.log.warn('[deliver] no SMTP configured (set SMTP_HOST + BRIEF_EMAIL_TO) — skipping email');
    return { ok: false, skipped: true };
  }
}

function makeDeliverer(env = process.env, log = console) {
  if (env.SMTP_HOST && env.BRIEF_EMAIL_TO) {
    return new SmtpEmailer({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      user: env.SMTP_USER,
      pass: env.SMTP_PASS,
      from: env.BRIEF_EMAIL_FROM,
      to: env.BRIEF_EMAIL_TO,
    });
  }
  return new NullDeliverer(log);
}

module.exports = { makeDeliverer, SmtpEmailer, NullDeliverer };
