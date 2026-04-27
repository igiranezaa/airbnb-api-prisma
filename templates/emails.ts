export function welcomeEmail(name: string, role: string) {
  return `
    <h1 style="color:#FF5A5F;">Welcome ${name}!</h1>
    <p>You registered as ${role}</p>
  `;
}

export function bookingConfirmationEmail(
  name: string,
  title: string,
  location: string,
  checkIn: string,
  checkOut: string,
  total: number
) {
  return `
    <h2>Booking Confirmed</h2>
    <p>${title} - ${location}</p>
    <p>${checkIn} → ${checkOut}</p>
    <h3>Total: $${total}</h3>
  `;
}

export function bookingCancellationEmail(
  name: string,
  title: string,
  checkIn: string,
  checkOut: string
) {
  return `
    <h2>Booking Cancelled</h2>
    <p>${title}</p>
    <p>${checkIn} → ${checkOut}</p>
  `;
}

export function passwordResetEmail(name: string, link: string) {
  return `
    <h2>Password Reset</h2>
    <a href="${link}">Reset Password</a>
  `;
}