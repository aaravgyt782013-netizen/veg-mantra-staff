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
  try{
    const b=await req.json();
    const email=String(b.email||"").trim().toLowerCase();
    const name=String(b.name||"Manager").trim()||"Manager";
    const password=String(b.password||"");
    if(!email||!email.includes("@")||!password||password.length<6)
      return NextResponse.json({error:"Enter a valid manager email and a password of at least 6 characters."},{status:400});

    const existing=await db.user.findUnique({where:{email}});
    if(existing) return NextResponse.json({error:"That email is already registered. Use a different email."},{status:409});

    const user=await db.user.create({
      data:{name,email,passwordHash:await bcrypt.hash(password,12),role:"MANAGER",active:true}
    });
    await db.auditLog.create({
      data:{actorId:u.id,action:"manager_created",targetType:"User",targetId:user.id,details:JSON.stringify({email:user.email})}
    });
    return NextResponse.json({ok:true,id:user.id});
  }catch(error){
    console.error("Manager creation failed:",error);
    return NextResponse.json({error:"Could not create the manager. Please try again after the database is available."},{status:500});
  }
}

export async function PATCH(req:Request){
  const u=await getUser();
  if(u?.role!=="OWNER") return NextResponse.json({error:"Forbidden"},{status:403});
  const b=await req.json();
  if(!b.id)return NextResponse.json({error:"Missing id"},{status:400});
  const target=await db.user.findUnique({where:{id:b.id}});
  if(!target||target.role!=="MANAGER")return NextResponse.json({error:"Invalid manager"},{status:400});
  const data:any={};
  if(b.active!==undefined)data.active=!!b.active;
  if(b.name)data.name=String(b.name).trim();
  if(b.password){
    if(String(b.password).length<6)return NextResponse.json({error:"Password must be at least 6 characters."},{status:400});
    data.passwordHash=await bcrypt.hash(String(b.password),12);
  }
  const row=await db.user.update({where:{id:b.id},data});
  await db.auditLog.create({data:{actorId:u.id,action:"manager_updated",targetType:"User",targetId:b.id,details:JSON.stringify({active:data.active,name:data.name})}});
  return NextResponse.json({ok:true,row:{id:row.id,name:row.name,email:row.email,active:row.active}});
}