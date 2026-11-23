import { prisma } from '../lib/prisma.js';

export async function releaseExpiredHolds() {
  const now = new Date();
  const expiredBookings = await prisma.booking.findMany({
    where: { status: { in: ['HELD', 'PENDING_PAYMENT'] }, seats: { some: { seat: { status: 'HELD', holdExpiresAt: { lte: now } } } } },
    select: { id: true, status: true, seats: { select: { seatId: true } } }
  });
  for (const booking of expiredBookings) {
    await prisma.$transaction(async tx => {
      await tx.booking.update({ where: { id: booking.id }, data: { status: 'EXPIRED' } });
      await tx.bookingStatusHistory.create({ data: { bookingId: booking.id, fromStatus: booking.status, toStatus: 'EXPIRED', note: 'Automatic hold expiry' } });
      await tx.seat.updateMany({ where: { id: { in: booking.seats.map(s => s.seatId) }, status: 'HELD', holdExpiresAt: { lte: now } }, data: { status: 'AVAILABLE', holdExpiresAt: null, holdToken: null } });
    });
  }
  await prisma.seat.updateMany({ where: { status: 'HELD', holdExpiresAt: { lte: now } }, data: { status: 'AVAILABLE', holdExpiresAt: null, holdToken: null } });
  return expiredBookings.length;
}
