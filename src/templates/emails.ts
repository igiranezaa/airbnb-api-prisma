export function welcomeEmail(name: string, role: string): string {
  return `
    <h1>Welcome, ${name}!</h1>
    <p>Your account has been created successfully as a <strong>${role}</strong>.</p>
    <p>You can now log in and start using the platform.</p>
  `;
}

export function passwordResetEmail(name: string, link: string): string {
  return `
    <h1>Reset your password</h1>
    <p>Hi ${name},</p>
    <p>Click the link below to reset your password. This link expires in <strong>30 minutes</strong>.</p>
    <a href="${link}">${link}</a>
    <p>If you didn't request this, you can safely ignore this email.</p>
  `;
}

export function emailVerificationEmail(name: string, link: string): string {
  return `
    <h1>Verify your email address</h1>
    <p>Hi ${name},</p>
    <p>Click the link below to verify your email. This link expires in 24 hours.</p>
    <a href="${link}">${link}</a>
    <p>If you didn't create an account, you can safely ignore this email.</p>
  `;
}

export function accountLockedEmail(name: string, unlockTime: string): string {
  return `
    <h1>Account Locked</h1>
    <p>Hi ${name},</p>
    <p>Your account has been temporarily locked due to 5 consecutive failed login attempts.</p>
    <p>Your account will be automatically unlocked at <strong>${unlockTime}</strong>.</p>
    <p>If this wasn't you, please reset your password immediately.</p>
  `;
}

export function bookingConfirmationEmail(
  name: string,
  listingTitle: string,
  location: string,
  checkIn: string,
  checkOut: string,
  totalPrice: number
): string {
  return `
    <h1>Booking Confirmed!</h1>
    <p>Hi ${name}, your booking is confirmed.</p>
    <ul>
      <li><strong>Listing:</strong> ${listingTitle}</li>
      <li><strong>Location:</strong> ${location}</li>
      <li><strong>Check-in:</strong> ${checkIn}</li>
      <li><strong>Check-out:</strong> ${checkOut}</li>
      <li><strong>Total:</strong> $${totalPrice}</li>
    </ul>
  `;
}

export function bookingCancellationEmail(
  name: string,
  listingTitle: string,
  checkIn: string,
  checkOut: string
): string {
  return `
    <h1>Booking Cancelled</h1>
    <p>Hi ${name}, your booking has been cancelled.</p>
    <ul>
      <li><strong>Listing:</strong> ${listingTitle}</li>
      <li><strong>Check-in:</strong> ${checkIn}</li>
      <li><strong>Check-out:</strong> ${checkOut}</li>
    </ul>
  `;
}
