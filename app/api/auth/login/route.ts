import {NextResponse} from "next/server";
import bcrypt from "bcryptjs";
import {z} from "zod";
import {db} from "../../../../lib/prisma";
import {setSession} from "../../../../lib/auth";
import {cafeNetworkAllowed} from "../../../../lib/network";

const schema=z.object({email:z.string().email(),password:z.string().min(1)});

export async function POST(req:Request){
  const body=schema.parse(await req.json());
  const user=await db.user.findUnique({where:{email:body.email.toLowerCase()}});
  if(!user||!user.active||!["OWNER","MANAGER"].includes(user.role)||!user.passwordHash||!(await bcrypt.compare(body.password,user.passwordHash)))
    return NextResponse.json({error:"Invalid email or password"},{status:401});
  if(user.role==="MANAGER"&&!cafeNetworkAllowed(req))
    return NextResponse.json({error:"Manager access is only available from the approved cafe network."},{status:403});
  await setSession(user.id);
  return NextResponse.json({redirect:user.role==="OWNER"?"/admin":"/manager"});
}