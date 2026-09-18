import {PrismaClient} from "@prisma/client";
import bcrypt from "bcryptjs";
const db=new PrismaClient();
async function main(){
  const email=process.env.OWNER_EMAIL?.toLowerCase();
  const password=process.env.OWNER_PASSWORD;
  if(!email||!password) throw new Error("Set OWNER_EMAIL and OWNER_PASSWORD for the one-time seed");
  const hash=await bcrypt.hash(password,12);
  await db.user.upsert({
    where:{email},
    update:{name:process.env.OWNER_NAME||"Owner",passwordHash:hash,role:"OWNER",active:true},
    create:{name:process.env.OWNER_NAME||"Owner",email,passwordHash:hash,role:"OWNER"}
  });
  console.log("Owner account ready:",email);
}
main().finally(()=>db.$disconnect());