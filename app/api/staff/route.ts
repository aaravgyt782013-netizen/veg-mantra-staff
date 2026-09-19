import {NextResponse} from "next/server";
import bcrypt from "bcryptjs";
import {getUser} from "../../../lib/auth";
import {db} from "../../../lib/prisma";

function owner(req:Request){return getUser().then(u=>u?.role==="OWNER"?u:null)}

export async function GET(){
  const u=await getUser();
  if(!u||!["OWNER","MANAGER"].includes(u.role)) return NextResponse.json({error:"Forbidden"},{status:403});
  return NextResponse.json(await db.user.findMany({
    where:{role:"STAFF",active:true},
    select:{id:true,staffCode:true,name:true,age:true,gender:true,photoData:true},
    orderBy:{name:"asc"}
  }));
}

export async function POST(req:Request){
  const u=await getUser();
  if(u?.role!=="OWNER") return NextResponse.json({error:"Forbidden"},{status:403});
  try{
    const form=await req.formData();
    const name=String(form.get("name")||"").trim();
    const age=Number(form.get("age"));
    const gender=String(form.get("gender")||"").trim();
    const photo=form.get("photo");
    if(!name||!Number.isInteger(age)||age<14||age>100||!gender||!(photo instanceof File)) return NextResponse.json({error:"Name, valid age, gender and staff photo are required"},{status:400});
    if(!photo.type.startsWith("image/")) return NextResponse.json({error:"Photo must be an image"},{status:400});
    if(photo.size>2*1024*1024) return NextResponse.json({error:"Photo must be 2 MB or smaller"},{status:400});
    const bytes=new Uint8Array(await photo.arrayBuffer());
    let binary=""; for(const b of bytes) binary+=String.fromCharCode(b);
    const photoData=`data:${photo.type};base64,${Buffer.from(binary,"binary").toString("base64")}`;
    const last=await db.user.findFirst({where:{staffCode:{startsWith:"VM-"}},orderBy:{staffCode:"desc"},select:{staffCode:true}});
    const n=last?.staffCode?Number(last.staffCode.slice(3))+1:1;
    const staffCode=`VM-${String(n).padStart(4,"0")}`;
    const staff=await db.user.create({data:{staffCode,name,age,gender,photoData,role:"STAFF",active:true}});
    await db.auditLog.create({data:{actorId:u.id,action:"staff_created",targetType:"User",targetId:staff.id,details:JSON.stringify({staffCode,name,age,gender})}});
    return NextResponse.json({id:staff.id,staffCode});
  }catch{return NextResponse.json({error:"Could not create staff member"},{status:400})}
}

export async function PATCH(req:Request){
  const u=await getUser();
  if(u?.role!=="OWNER") return NextResponse.json({error:"Forbidden"},{status:403});
  const b=await req.json();
  if(!b.staffCode) return NextResponse.json({error:"Staff ID is required"},{status:400});
  const existing=await db.user.findFirst({where:{staffCode:String(b.staffCode),role:"STAFF"}});
  if(!existing) return NextResponse.json({error:"Staff ID not found"},{status:404});
  const data:any={};
  if(b.name!==undefined)data.name=String(b.name).trim();
  if(b.age!==undefined)data.age=Number(b.age);
  if(b.gender!==undefined)data.gender=String(b.gender).trim();
  if(b.active!==undefined)data.active=!!b.active;
  const staff=await db.user.update({where:{id:existing.id},data});
  await db.auditLog.create({data:{actorId:u.id,action:"staff_updated",targetType:"User",targetId:staff.id,details:JSON.stringify({staffCode:staff.staffCode,changes:data})}});
  return NextResponse.json({ok:true});
}

export async function DELETE(req:Request){
  const u=await getUser();
  if(u?.role!=="OWNER") return NextResponse.json({error:"Forbidden"},{status:403});
  const b=await req.json();
  const staff=await db.user.findFirst({where:{staffCode:String(b.staffCode||""),role:"STAFF"}});
  if(!staff) return NextResponse.json({error:"Staff ID not found"},{status:404});
  await db.$transaction(async tx=>{
    // A removed staff member must disappear completely, including every
    // attendance row and every audit entry where they were actor/target.
    await tx.auditLog.deleteMany({
      where:{
        OR:[
          {actorId:staff.id},
          {targetId:staff.id},
          {details:{contains:staff.id}},
          {details:{contains:staff.staffCode}}
        ]
      }
    });
    await tx.attendance.deleteMany({
      where:{
        OR:[
          {staffId:staff.id},
          {markedById:staff.id}
        ]
      }
    });
    await tx.user.delete({where:{id:staff.id}});
  });
  return NextResponse.json({ok:true});
}