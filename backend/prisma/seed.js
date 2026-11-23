import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
try {
 const passwordHash = await bcrypt.hash('TicketFlowDemo123!', 12);
 for (const user of [
  {name:'Demo Organizer',email:'organizer@ticketflow.demo',role:'ORGANIZER'},
  {name:'Demo Customer',email:'customer@ticketflow.demo',role:'CUSTOMER'}
 ]) await prisma.user.upsert({where:{email:user.email},update:{},create:{...user,passwordHash}});
 console.log('Demo accounts ready: organizer@ticketflow.demo / customer@ticketflow.demo (password: TicketFlowDemo123!)');
} finally { await prisma.$disconnect(); }
