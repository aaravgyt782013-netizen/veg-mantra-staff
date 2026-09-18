import {NextResponse} from "next/server";
import {db} from "../../../../lib/prisma";
import {getUser} from "../../../../lib/auth";
import bcrypt from "bcryptjs";

export async function GET(){
  const u=await getUser();
  if(u?.role!=="OWNER") return NextResponse.json({error:"Forbidden"},{status:403});
  return NextResponse.json(await db.user.findMany({where:{role:{in:["OWNER","MANAGER"]}},select:{id:true,name:true,email:true,role:true,active:true,age:true,gender:true,createdAt:true},orderBy:{name:"asc"}}));
}
export async function POST(req:Request){
  const u=await getUser();
  if(u?.role!=="OWNER") return NextResponse.json({error:"Forbidden"},{status:403});
  try{
    const b=await req.json(),email=String(b.email||"").trim().toLowerCase(),name=String(b.name||"").trim(),password=String(b.password||"");
    const age=Number(b.age),gender=String(b.gender||"").trim();
    if(!email||!email.includes("@")||!name||!password||password.length<6||!Number.isInteger(age)||age<18||age>100||!gender)
      return NextResponse.json({error:"Name, valid email, age (18+), gender and a password of at least 6 characters are required."},{status:400});
    const existing=await db.user.findUnique({where:{email}});
    if(existing)return NextResponse.json({error:"That email is already registered. One email can only have one account."},{status:409});
    const user=await db.user.create({data:{name,email,age,gender,passwordHash:await bcrypt.hash(password,12),role:"MANAGER",active:true}});
    await db.auditLog.create({data:{actorId:u.id,action:"manager_created",targetType:"User",targetId:user.id,details:JSON.stringify({email,age,gender})}});
    return NextResponse.json({ok:true,id:user.id});
  }catch(error){console.error(error);return NextResponse.json({error:"Could not create manager. Please try again."},{status:500});}
}
export async function DELETE(req:Request){
  const u=await getUser();
  if(u?.role!=="OWNER")return NextResponse.json({error:"Forbidden"},{status:403});
  const b=await req.json(),target=await db.user.findUnique({where:{id:String(b.id||"")}});
  if(!target||target.role!=="MANAGER")return NextResponse.json({error:"Manager not found"},{status:404});
  await db.user.update({where:{id:target.id},data:{active:false}});
  await db.auditLog.create({data:{actorId:u.id,action:"manager_removed",targetType:"User",targetId:target.id,details:JSON.stringify({email:target.email,name:target.name})}});
  return NextResponse.json({ok:true});
}
export async function PATCH(req:Request){
  const u=await getUser();
  if(u?.role!=="OWNER")return NextResponse.json({error:"Forbidden"},{status:403});
  const b=await req.json();if(!b.id)return NextResponse.json({error:"Missing id"},{status:400});
  const target=await db.user.findUnique({where:{id:b.id}});
  if(!target||target.role!=="MANAGER")return NextResponse.json({error:"Invalid manager"},{status:400});
  const data:any={};if(b.name)data.name=String(b.name).trim();if(b.age!==undefined)data.age=Number(b.age);if(b.gender)data.gender=String(b.gender).trim();
  if(b.password){if(String(b.password).length<6)return NextResponse.json({error:"Password must be at least 6 characters."},{status:400});data.passwordHash=await bcrypt.hash(String(b.password),12);}
  const row=await db.user.update({where:{id:b.id},data});
  await db.auditLog.create({data:{actorId:u.id,action:"manager_updated",targetType:"User",targetId:b.id,details:JSON.stringify({name:data.name,age:data.age,gender:data.gender})}});
  return NextResponse.json({ok:true,row:{id:row.id,name:row.name,email:row.email,active:row.active,age:row.age,gender:row.gender}});
}