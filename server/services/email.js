/**
 * Email Service - SendGrid Integration
 * Handles transactional emails for authentication flows
 */

import sgMail from '@sendgrid/mail';
import { config } from '../config/env.js';

let isConfigured = false;

function initializeSendGrid() {
  if (config.email.sendgridApiKey) {
    sgMail.setApiKey(config.email.sendgridApiKey);
    isConfigured = true;
    console.log('[Email] SendGrid configured');
  } else {
    console.warn('[Email] SendGrid API key not configured - emails will not be sent');
  }
}

// Initialize on module load
initializeSendGrid();

/**
 * Send email via SendGrid
 */
async function sendEmail({ to, subject, text, html }) {
  if (!isConfigured) {
    console.warn('[Email] SendGrid not configured, skipping email to:', to);
    // In development, log the email content for testing
    if (config.server.nodeEnv === 'development') {
      console.log('[Email] Would send email:', { to, subject, text: text?.substring(0, 200) });
    }
    return { success: false, error: 'Email service not configured' };
  }

  const msg = {
    to,
    from: {
      email: config.email.fromAddress,
      name: config.email.fromName,
    },
    subject,
    text,
    html,
  };

  try {
    await sgMail.send(msg);
    console.log(`[Email] Sent "${subject}" to ${to}`);
    return { success: true };
  } catch (error) {
    console.error('[Email] Send error:', error.message);
    if (error.response) {
      console.error('[Email] SendGrid response:', error.response.body);
    }
    return { success: false, error: error.message };
  }
}

/**
 * Send email verification email
 */
export async function sendVerificationEmail(email, token, firstName) {
  const baseUrl = config.email.frontendUrl.replace(/\/+$/, ''); // Remove trailing slashes
  const verificationUrl = `${baseUrl}/verify-email?token=${token}`;

  const subject = 'Verify your Ramblaa account';
  const text = `Hi ${firstName},

Welcome to Ramblaa! Please verify your email by clicking the link below:

${verificationUrl}

This link expires in 24 hours.

If you didn't create an account, you can safely ignore this email.

Best,
The Ramblaa Team`;

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="background: linear-gradient(135deg, #6366f1 0%, #1e1b4b 100%); padding: 40px; text-align: center;">
        <h1 style="color: white; margin: 0;">Ramblaa</h1>
      </div>
      <div style="padding: 40px; background: #f9fafb;">
        <h2 style="color: #1f2937;">Welcome, ${firstName}!</h2>
        <p style="color: #4b5563; font-size: 16px;">Thank you for signing up. Please verify your email address to activate your account.</p>
        <div style="text-align: center; margin: 30px 0;">
          <a href="${verificationUrl}" style="background: #6366f1; color: white; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-weight: 600; display: inline-block;">Verify Email Address</a>
        </div>
        <p style="color: #6b7280; font-size: 14px;">This link expires in 24 hours.</p>
        <p style="color: #6b7280; font-size: 14px;">If the button doesn't work, copy and paste this URL:<br/><a href="${verificationUrl}" style="color: #6366f1;">${verificationUrl}</a></p>
      </div>
      <div style="padding: 20px; text-align: center; color: #9ca3af; font-size: 12px;">
        If you didn't create this account, you can safely ignore this email.
      </div>
    </div>
  `;

  return sendEmail({ to: email, subject, text, html });
}

/**
 * Send password reset email
 */
export async function sendPasswordResetEmail(email, token, firstName) {
  const baseUrl = config.email.frontendUrl.replace(/\/+$/, ''); // Remove trailing slashes
  const resetUrl = `${baseUrl}/reset-password?token=${token}`;

  const subject = 'Reset your Ramblaa password';
  const text = `Hi ${firstName},

We received a request to reset your password. Click the link below to set a new password:

${resetUrl}

This link expires in 1 hour.

If you didn't request this, you can safely ignore this email. Your password won't change.

Best,
The Ramblaa Team`;

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="background: linear-gradient(135deg, #6366f1 0%, #1e1b4b 100%); padding: 40px; text-align: center;">
        <h1 style="color: white; margin: 0;">Ramblaa</h1>
      </div>
      <div style="padding: 40px; background: #f9fafb;">
        <h2 style="color: #1f2937;">Password Reset Request</h2>
        <p style="color: #4b5563; font-size: 16px;">Hi ${firstName}, we received a request to reset your password. Click the button below to set a new password.</p>
        <div style="text-align: center; margin: 30px 0;">
          <a href="${resetUrl}" style="background: #6366f1; color: white; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-weight: 600; display: inline-block;">Reset Password</a>
        </div>
        <p style="color: #6b7280; font-size: 14px;">This link expires in 1 hour.</p>
        <p style="color: #6b7280; font-size: 14px;">If the button doesn't work, copy and paste this URL:<br/><a href="${resetUrl}" style="color: #6366f1;">${resetUrl}</a></p>
      </div>
      <div style="padding: 20px; text-align: center; color: #9ca3af; font-size: 12px;">
        If you didn't request this password reset, you can safely ignore this email. Your password won't change.
      </div>
    </div>
  `;

  return sendEmail({ to: email, subject, text, html });
}

export default {
  sendEmail,
  sendVerificationEmail,
  sendPasswordResetEmail,
};
