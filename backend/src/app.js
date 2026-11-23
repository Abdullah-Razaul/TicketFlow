import express from 'express';
import { randomUUID } from 'node:crypto';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from './lib/prisma.js';
import { env } from './config/env.js';
import { authenticate, authorize } from './middleware/auth.js';
import { errorHandler } from './middleware/errorHandler.js';
import { calculatePrice } from './domain/pricing.js';
import { getRefund } from './domain/refundPolicy.js';
import { canTransition } from './domain/bookingStatus.js';
import { MockCardProvider } from './payments/MockCardProvider.js';
import { MockWalletProvider } from './payments/MockWalletProvider.js';

export const app = express();
app.use(helmet());
app.use(cors({ origin: env.CLIENT_ORIGIN.split(',') }));
app.use(express.json());
app.use(morgan('dev'));
app.get('/api/health', (_req,res)=>res.json({status:'ok',service:'ticketflow-api'}));
const asyncRoute = fn => (req,res,next)=>Promise.resolve(fn(req,res,next)).catch(next);
const bad = (message,status=400)=>Object.assign(new Error(message),{statusCode:status});
const tokenFor = user => jwt.sign({id:user.id,role:user.role,name:user.name},process.env.JWT_SECRET,{expiresIn:process.env.JWT_EXPIRES_IN||'1d'});

app.post('/api/auth/register', asyncRoute(async(req,res)=>{
  const data=z.object({name:z.string().min(2),email:z.string().email(),password:z.string().min(8),role:z.enum(['ORGANIZER','CUSTOMER'])}).parse(req.body);
  const exists=await prisma.user.findUnique({where:{email:data.email}}); if(exists) throw bad('Email already registered',409);
const { password, ...userData } = data;

const user = await prisma.user.create({
  data: {
    ...userData,
    passwordHash: await bcrypt.hash(password, 12),
  },
});  res.status(201).json({token:tokenFor(user),user:{id:user.id,name:user.name,email:user.email,role:user.role}});
}));
app.post('/api/auth/login',asyncRoute(async(req,res)=>{
  const {email,password}=z.object({email:z.string().email(),password:z.string().min(1)}).parse(req.body);
  const user=await prisma.user.findUnique({where:{email}}); if(!user||!(await bcrypt.compare(password,user.passwordHash))) throw bad('Invalid email or password',401);
  res.json({token:tokenFor(user),user:{id:user.id,name:user.name,email:user.email,role:user.role}});
}));
app.get('/api/events',asyncRoute(async(req,res)=>{
  const page=Math.max(1,Number(req.query.page)||1), limit=Math.min(20,Math.max(1,Number(req.query.limit)||9));
  const where={startsAt:{gt:new Date()},...(req.query.q?{name:{contains:String(req.query.q)}}:{}),...(req.query.city?{city:{contains:String(req.query.city),mode:'insensitive'}}:{}),...(req.query.date?{startsAt:{gte:new Date(String(req.query.date)+'T00:00:00.000Z'),lt:new Date(new Date(String(req.query.date)+'T00:00:00.000Z').getTime()+86400000)}}:{})};
  const [items,total]=await Promise.all([prisma.event.findMany({where,skip:(page-1)*limit,take:limit,orderBy:{startsAt:'asc'},include:{categories:true,_count:{select:{seats:true}}}}),prisma.event.count({where})]);
  res.json({items,total,page,pages:Math.ceil(total/limit)});
}));
app.get('/api/events/mine', authenticate, authorize('ORGANIZER'), asyncRoute(async (req, res) => {
  const items = await prisma.event.findMany({
    where: { organizerId: req.user.id },
    orderBy: { startsAt: 'asc' },
    include: { categories: true }
  });
  res.json(items);
}));
app.get('/api/events/:id',asyncRoute(async(req,res)=>{
 const event=await prisma.event.findUnique({where:{id:req.params.id},include:{categories:true,seats:{orderBy:[{rowLabel:'asc'},{seatNumber:'asc'}]}}}); if(!event) throw bad('Event not found',404);
 await expireSeats(event.id); const fresh=await prisma.event.findUnique({where:{id:event.id},include:{categories:true,seats:{orderBy:[{rowLabel:'asc'},{seatNumber:'asc'}]}}}); res.json(fresh);
}));
app.post('/api/events',authenticate,authorize('ORGANIZER'),asyncRoute(async(req,res)=>{
 const d=z.object({name:z.string().min(3),description:z.string().optional(),city:z.string().min(2),venue:z.string().min(2),startsAt:z.string().datetime(),rows:z.coerce.number().int().min(1).max(30),seatsPerRow:z.coerce.number().int().min(1).max(40),pricingStrategy:z.enum(['BASE','EARLY_BIRD']).default('BASE'),categories:z.array(z.object({name:z.string().min(2),basePrice:z.coerce.number().positive()})).min(1)}).parse(req.body);
 if(new Date(d.startsAt)<=new Date()) throw bad('Event date must be in the future');
 const event=await prisma.$transaction(async tx=>{const e=await tx.event.create({data:{organizerId:req.user.id,name:d.name,description:d.description,city:d.city,venue:d.venue,startsAt:new Date(d.startsAt),rows:d.rows,seatsPerRow:d.seatsPerRow,pricingStrategy:d.pricingStrategy}}); const cats=[]; for(const c of d.categories) cats.push(await tx.seatCategory.create({data:{eventId:e.id,name:c.name,basePrice:c.basePrice}})); const seats=[]; for(let r=0;r<d.rows;r++) for(let n=1;n<=d.seatsPerRow;n++) seats.push({eventId:e.id,rowLabel:String.fromCharCode(65+r),seatNumber:n,categoryId:cats[Math.min(cats.length-1,Math.floor(r/d.rows*cats.length))].id}); await tx.seat.createMany({data:seats}); return e;});
 res.status(201).json(event);
}));
app.put('/api/events/:id',authenticate,authorize('ORGANIZER'),asyncRoute(async(req,res)=>{
 const e=await prisma.event.findUnique({where:{id:req.params.id}}); if(!e) throw bad('Event not found',404); if(e.organizerId!==req.user.id) throw bad('You can only edit your own events',403);
 const d=z.object({name:z.string().min(3).optional(),description:z.string().optional(),city:z.string().min(2).optional(),venue:z.string().min(2).optional(),startsAt:z.string().datetime().optional()}).parse(req.body);
 res.json(await prisma.event.update({where:{id:e.id},data:{...d,...(d.startsAt?{startsAt:new Date(d.startsAt)}:{})}}));
}));
app.delete('/api/events/:id',authenticate,authorize('ORGANIZER'),asyncRoute(async(req,res)=>{const e=await prisma.event.findUnique({where:{id:req.params.id}});if(!e)throw bad('Event not found',404);if(e.organizerId!==req.user.id)throw bad('Forbidden',403);if(await prisma.booking.count({where:{eventId:e.id,status:'CONFIRMED'}}))throw bad('Cannot delete an event with confirmed bookings');await prisma.event.delete({where:{id:e.id}});res.json({message:'Event deleted'});}));

async function expireSeats(eventId){
 const now=new Date();
 const expired=await prisma.booking.findMany({where:{eventId,status:{in:['HELD','PENDING_PAYMENT']},seats:{some:{seat:{holdExpiresAt:{lte:now}}}}},select:{id:true,status:true,seats:{select:{seatId:true}}}});
 for(const booking of expired){
  await prisma.$transaction(async tx=>{
   await tx.booking.update({where:{id:booking.id},data:{status:'EXPIRED'}});
   await tx.bookingStatusHistory.create({data:{bookingId:booking.id,fromStatus:booking.status,toStatus:'EXPIRED',note:'Seat hold expired'}});
   await tx.seat.updateMany({where:{id:{in:booking.seats.map(x=>x.seatId)},status:'HELD',holdExpiresAt:{lte:now}},data:{status:'AVAILABLE',holdExpiresAt:null,holdToken:null}});
  });
 }
 await prisma.seat.updateMany({where:{eventId,status:'HELD',holdExpiresAt:{lte:now}},data:{status:'AVAILABLE',holdExpiresAt:null,holdToken:null}});
}
app.get('/api/events/:id/seats',asyncRoute(async(req,res)=>{await expireSeats(req.params.id);res.json(await prisma.seat.findMany({where:{eventId:req.params.id},include:{category:true},orderBy:[{rowLabel:'asc'},{seatNumber:'asc'}]}));}));
app.post('/api/bookings/hold',authenticate,authorize('CUSTOMER'),asyncRoute(async(req,res)=>{
 const {eventId,seatIds}=z.object({eventId:z.string().uuid(),seatIds:z.array(z.string().uuid()).min(1).max(8)}).parse(req.body); if(new Set(seatIds).size!==seatIds.length)throw bad('Duplicate seats selected');
 const holdToken=randomUUID(), expires=new Date(Date.now()+env.HOLD_MINUTES*60000);
 const result=await prisma.$transaction(async tx=>{
  const event=await tx.event.findUnique({where:{id:eventId},include:{seats:{where:{id:{in:seatIds}},include:{category:true}}}}); if(!event||event.seats.length!==seatIds.length)throw bad('Invalid event or seats',404);
  await tx.seat.updateMany({where:{id:{in:seatIds},eventId,status:'HELD',holdExpiresAt:{lte:new Date()}},data:{status:'AVAILABLE',holdExpiresAt:null,holdToken:null}});
  const changed=await tx.seat.updateMany({where:{id:{in:seatIds},eventId,status:'AVAILABLE'},data:{status:'HELD',holdExpiresAt:expires,holdToken}}); if(changed.count!==seatIds.length)throw bad('One or more seats are no longer available',409);
  const total=event.seats.reduce((sum,s)=>sum+calculatePrice(Number(s.category.basePrice),event.pricingStrategy,event.startsAt),0);
  const booking=await tx.booking.create({data:{userId:req.user.id,eventId,status:'HELD',total,idempotencyKey:randomUUID(),seats:{create:event.seats.map(s=>({seatId:s.id,price:calculatePrice(Number(s.category.basePrice),event.pricingStrategy,event.startsAt)}))},history:{create:{toStatus:'HELD',note:'Seats temporarily held'}}},include:{seats:{include:{seat:true}}}}); return booking;
 }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }); res.status(201).json({...result,holdExpiresAt:expires});
}));
const providers={card:new MockCardProvider(),wallet:new MockWalletProvider()};
app.post('/api/bookings/:id/pay',authenticate,authorize('CUSTOMER'),asyncRoute(async(req,res)=>{
 const {provider='card'}=z.object({provider:z.enum(['card','wallet']).default('card')}).parse(req.body); const p=providers[provider];
 const result=await prisma.$transaction(async tx=>{
  const b=await tx.booking.findUnique({where:{id:req.params.id},include:{seats:{include:{seat:true}}}}); if(!b||b.userId!==req.user.id)throw bad('Booking not found',404);
  const existing=await tx.payment.findFirst({where:{bookingId:b.id,status:'SUCCEEDED'}}); if(existing)return {booking:b,payment:existing,replayed:true};
  if(b.status!=='HELD'||b.seats.some(s=>s.seat.status!=='HELD'||s.seat.holdExpiresAt<=new Date()))throw bad('Hold expired. Please select seats again',409);
  if(!canTransition(b.status,'PENDING_PAYMENT'))throw bad('Invalid booking status transition');
  await tx.booking.update({where:{id:b.id},data:{status:'PENDING_PAYMENT'}});
  await tx.bookingStatusHistory.create({data:{bookingId:b.id,fromStatus:b.status,toStatus:'PENDING_PAYMENT',note:'Payment initiated'}});
  const payment=await p.charge({amount:Number(b.total),idempotencyKey:b.idempotencyKey});
  await tx.payment.create({data:{bookingId:b.id,provider,providerReference:payment.reference,idempotencyKey:b.idempotencyKey,amount:b.total,status:'SUCCEEDED'}});
  if(!canTransition('PENDING_PAYMENT','CONFIRMED'))throw bad('Invalid booking status transition');
  await tx.booking.update({where:{id:b.id},data:{status:'CONFIRMED'}}); await tx.bookingStatusHistory.create({data:{bookingId:b.id,fromStatus:'PENDING_PAYMENT',toStatus:'CONFIRMED',note:'Mock payment successful'}});
  console.info('[EMAIL MOCK] Booking confirmation sent to user', req.user.id, b.id);
  await tx.seat.updateMany({where:{id:{in:b.seats.map(s=>s.seatId)},holdToken:{not:null}},data:{status:'BOOKED',holdExpiresAt:null,holdToken:null}});
  await tx.notification.create({data:{userId:req.user.id,channel:'IN_APP',type:'BOOKING_CONFIRMED',message:`Your booking ${b.id} is confirmed.`}});
  return {booking:{...b,status:'CONFIRMED'},payment,replayed:false};
 }); res.json(result);
}));
app.get('/api/bookings/mine',authenticate,asyncRoute(async(req,res)=>{await expireAll();res.json(await prisma.booking.findMany({where:{userId:req.user.id},include:{event:true,seats:{include:{seat:true}},history:true,payments:true},orderBy:{createdAt:'desc'}}));}));
app.post('/api/bookings/:id/cancel',authenticate,asyncRoute(async(req,res)=>{
 const result=await prisma.$transaction(async tx=>{const b=await tx.booking.findUnique({where:{id:req.params.id},include:{event:true,seats:true}});if(!b||b.userId!==req.user.id)throw bad('Booking not found',404);if(!['HELD','PENDING_PAYMENT','CONFIRMED'].includes(b.status))throw bad('Booking cannot be cancelled',409);const refund=getRefund(b.event.startsAt,new Date(),Number(b.total));await tx.booking.update({where:{id:b.id},data:{status:'CANCELLED'}});await tx.bookingStatusHistory.create({data:{bookingId:b.id,fromStatus:b.status,toStatus:'CANCELLED',note:`Refund amount: ${refund}`}});await tx.seat.updateMany({where:{id:{in:b.seats.map(s=>s.seatId)}},data:{status:'AVAILABLE',holdExpiresAt:null,holdToken:null}});await tx.notification.create({data:{userId:req.user.id,channel:'IN_APP',type:'BOOKING_CANCELLED',message:`Booking cancelled. Refund amount: ${refund}`}});return {message:'Booking cancelled',refund};});res.json(result);
}));
app.get('/api/notifications',authenticate,asyncRoute(async(req,res)=>res.json(await prisma.notification.findMany({where:{userId:req.user.id},orderBy:{createdAt:'desc'}}))));
app.patch('/api/notifications/:id/read',authenticate,asyncRoute(async(req,res)=>{const n=await prisma.notification.updateMany({where:{id:req.params.id,userId:req.user.id},data:{readAt:new Date()}});if(!n.count)throw bad('Notification not found',404);res.json({message:'Notification marked as read'});}));
async function expireAll(){const expired=await prisma.seat.findMany({where:{status:'HELD',holdExpiresAt:{lte:new Date()}},select:{id:true}});if(expired.length)await prisma.seat.updateMany({where:{id:{in:expired.map(s=>s.id)}},data:{status:'AVAILABLE',holdExpiresAt:null,holdToken:null}});}
app.use((_req,res)=>res.status(404).json({error:'Route not found'}));
app.use(errorHandler);
