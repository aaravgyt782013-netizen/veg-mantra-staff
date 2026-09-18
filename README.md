# Veg Mantra Mohan Nagar Staff Portal

A role-based attendance portal for the cafe.

## Access
- Owner: can log in from anywhere.
- Manager: login and attendance actions require the approved cafe network.
- Staff: can log in but cannot mark their own attendance.

## Attendance
The staff member tells the manager they have arrived. The manager presses Check In. At the end of the shift the manager presses Check Out. The database stores the date, timestamps, staff member, and manager who marked the record.

Managers cannot edit or delete attendance. Only the Owner API can correct a record, and every correction is written to the audit log.

## Email
Set MANAGER_EMAIL, RESEND_API_KEY and EMAIL_FROM. Each check-in/check-out sends an immediate notification to the manager email.

## Wi-Fi restriction
A browser does not expose the Wi-Fi network name/SSID to a normal web application. Therefore the security layer uses the cafe network public IP address, not the SSID text. The requested Wi-Fi names are retained as CAFE_WIFI_NAMES. Set ALLOWED_CAFE_IPS to the cafe router's public IPv4 address(es) before production.

## Database
Use PostgreSQL. Set DATABASE_URL, then run:
npm install
npx prisma generate
npx prisma db push

Create the initial owner securely before production; do not commit passwords or secrets.