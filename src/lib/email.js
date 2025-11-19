import nodemailer from 'nodemailer'
import { env, envHelpers } from './env.js'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

let transporter
export function getTransporter() {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: env.smtp.host,
      port: env.smtp.port,
      secure: env.smtp.secure, // true for 465, false for 587 (STARTTLS)
      auth: {
        user: env.smtp.user,
        pass: env.smtp.pass,
      },
    })
  }
  return transporter
}

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const TEMPLATES_DIR = path.resolve(__dirname, '..', 'emails')

export async function renderTemplate(templateFile, variables = {}) {
  const filePath = path.join(TEMPLATES_DIR, templateFile)
  let content = await readFile(filePath, 'utf8')

  for (const [key, value] of Object.entries(variables)) {
    const re = new RegExp(`{{\\s*${key}\\s*}}`, 'g')
    content = content.replace(re, String(value ?? ''))
  }
  return content
}

export async function sendEmail({ to, subject, html, text }) {
  const tx = getTransporter()
  const info = await tx.sendMail({
    from: env.smtp.from,
    to,
    subject,
    html,
    text,
  })
  return info
}

export async function sendVerificationEmail({ to, verifyUrl, appName = 'Nova English' }) {
  const expiryMinutes = Math.round(envHelpers.getVerificationTtlMs() / 60000)
  const durationText = expiryMinutes >= 1440
    ? `${expiryMinutes / 1440} day${expiryMinutes / 1440 > 1 ? 's' : ''}`
    : `${expiryMinutes} minute${expiryMinutes > 1 ? 's' : ''}`
  const footerText = `This link is valid for ${durationText}.`
  const html = await renderTemplate('verifyEmail.html', {
    app_name: appName,
    action_url: verifyUrl,
    support_email: env.smtp.user || 'support@' + env.appDomain,
    footer_text: footerText,
  })
  return sendEmail({
    to,
    subject: `${appName} — Verify your email address`,
    html,
  })
}

export async function sendPasswordResetEmail({ to, resetUrl, appName = 'Nova English' }) {
  const expiryMinutes = Math.round(envHelpers.getPasswordResetTtlMs() / 60000)
  const durationText = expiryMinutes >= 1440
    ? `${expiryMinutes / 1440} day${expiryMinutes / 1440 > 1 ? 's' : ''}`
    : `${expiryMinutes} minute${expiryMinutes > 1 ? 's' : ''}`
  const footerText = `This link is valid for ${durationText}.`
  const html = await renderTemplate('resetPassword.html', {
    app_name: appName,
    action_url: resetUrl,
    support_email: env.smtp.user || 'support@' + env.appDomain,
    footer_text: footerText,
  })
  return sendEmail({
    to,
    subject: `${appName} — Reset your password`,
    html,
  })
}

export async function sendPasswordChangedEmail({ to, appName = 'Nova English' }) {
  const html = await renderTemplate('passwordChanged.html', {
    app_name: appName,
    support_email: env.smtp.user || 'support@' + env.appDomain,
  })
  return sendEmail({
    to,
    subject: `${appName} — Your password was changed`,
    html,
  })
}

export async function verifySmtpConnection() {
  const tx = getTransporter()
  try {
    await tx.verify()
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err?.message || String(err) }
  }
}
