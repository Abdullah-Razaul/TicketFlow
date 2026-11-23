import {describe,it,expect} from 'vitest';
import {canTransition} from '../src/domain/bookingStatus.js';
import {calculatePrice} from '../src/domain/pricing.js';
import {getRefund} from '../src/domain/refundPolicy.js';
import {isHoldExpired} from '../src/domain/holdExpiry.js';

describe('Booking lifecycle',()=>{
 it('allows HELD to PENDING_PAYMENT',()=>expect(canTransition('HELD','PENDING_PAYMENT')).toBe(true));
 it('rejects EXPIRED to CONFIRMED',()=>expect(canTransition('EXPIRED','CONFIRMED')).toBe(false));
 it('rejects CONFIRMED to PENDING_PAYMENT',()=>expect(canTransition('CONFIRMED','PENDING_PAYMENT')).toBe(false));
});
describe('Pricing strategies',()=>{
 it('uses base price',()=>expect(calculatePrice(100,'BASE')).toBe(100));
 it('applies 20% early bird discount more than seven days ahead',()=>expect(calculatePrice(100,'EARLY_BIRD',new Date(Date.now()+9*86400000))).toBe(80));
 it('does not discount inside seven days',()=>expect(calculatePrice(100,'EARLY_BIRD',new Date(Date.now()+2*86400000))).toBe(100));
});
describe('Refund policy',()=>{
 it('refunds in full more than 24 hours before event',()=>expect(getRefund(new Date(Date.now()+25*3600000),new Date(),500)).toBe(500));
 it('does not refund within 24 hours',()=>expect(getRefund(new Date(Date.now()+2*3600000),new Date(),500)).toBe(0));
});
describe('Hold expiry',()=>{
 it('expires at the deadline',()=>expect(isHoldExpired(new Date('2026-01-01T00:00:00Z'),new Date('2026-01-01T00:00:00Z'))).toBe(true));
 it('does not expire before deadline',()=>expect(isHoldExpired(new Date('2026-01-01T00:01:00Z'),new Date('2026-01-01T00:00:00Z'))).toBe(false));
});
