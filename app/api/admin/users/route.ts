import {NextResponse} from "next/server";
import bcrypt from "bcryptjs";
import {db} from "../../../../lib/prisma";
import {getUser} from "../../../../lib/auth";

export async function GET(){
  const u=await getUser();
  if(u?.role!=="OWNER") return NextResponse.json({error:"Forbidden"},{status:403});
  return NextResponse.json(await db.user.findMany({
    where:{role:{in:["OWNER","MANAGER"]}},
    select:{id:true,name:true,email:true,role:true,active:true,createdAt:true},
    orderBy:{name:"asc"}
  }));
}

export async function POST(req:Request){
  const u=await getUser();
  if(u?.role!=="OWNER") return NextResponse.json({error:"Forbidden"},{status:403});
  const b=await req.json();
  if(!b.email||!b.password||b.role!=="MANAGER") return NextResponse.json({error:"Manager email and password are required"},{status:400});
  try{
    const user=await db.user.create({data:{name:String(b.name||"Manager"),email:String(b.email).toLowerCase(),passwordHash:await bcrypt.hash(String(b.password),12),role:"MANAGER"}});
    await db.auditLog.create({data:{actorId:u.id,action:"manager_created",targetType:"User",targetId:user.id,details:JSON.stringify({email:user.email})}});
    return NextResponse.json({id:user.id});
  }catch{return NextResponse.json({error:"Manager email already exists or account could not be created"},{status:400})}
}

export async function PATCH(req:Request){
  const u=await getUser();
  if(u?.role!=="OWNER") return NextResponse.json({error:"Forbidden"},{status:403});
  const b=await req.json();
  if(!b.id)return NextResponse.json({error:"Missing id"},{status:400});
  const target=await db.user.findUnique({where:{id:b.id}});
  if(!target||target.role==="OWNER")return NextResponse.json({error:"Invalid manager"},{status:400});
  const data:any={};
  if(b.active!==undefined)data.active=!!b.active;
  if(b.name)data.name=String(b.name);
  if(b.password)data.passwordHash=await bcrypt.hash(String(b.password),12);
  const row=await db.user.update({where:{id:b.id},data});
  await db.auditLog.create({data:{actorId:u.id,action:"manager_updated",targetType:"User",targetId:b.id,details:JSON.stringify(data)}});
  return NextResponse.json({ok:true,row:{id:row.id,name:row.name,email:row.email,active:row.active}});
}