import {NextResponse} from "next/server";
import {getUser} from "../../../../lib/auth";
import {db} from "../../../../lib/prisma";

const DEVICE_ID="primary";
export const dynamic="force-dynamic";

export async function GET(){
  const u=await getUser();
  if(u?.role!=="OWNER") return NextResponse.json({error:"Forbidden"},{status:403});
  const device=await db.biometricDevice.findUnique({where:{id:DEVICE_ID}});
  const enrollments=await db.fingerprintEnrollment.findMany({
    where:{active:true},
    include:{staff:{select:{id:true,staffCode:true,name:true}},device:{select:{id:true,name:true,model:true,serialNumber:true}}},
    orderBy:{createdAt:"desc"}
  });
  const requests=await db.fingerprintEnrollmentRequest.findMany({
    where:{status:"PENDING"},
    include:{staff:{select:{id:true,staffCode:true,name:true}}},
    orderBy:{createdAt:"desc"},take:50
  });
  return NextResponse.json({device,enrollments,requests});
}
export async function PATCH(req:Request){
  const u=await getUser();
  if(u?.role!=="OWNER") return NextResponse.json({error:"Forbidden"},{status:403});
  const b=await req.json(),data:any={};
  if(b.name!==undefined)data.name=String(b.name).trim()||"Veg Mantra Fingerprint Station";
  if(b.model!==undefined)data.model=String(b.model).trim()||null;
  if(b.serialNumber!==undefined)data.serialNumber=String(b.serialNumber).trim()||null;
  if(b.connectionType!==undefined)data.connectionType=String(b.connectionType).trim()||null;
  if(b.host!==undefined)data.host=String(b.host).trim()||null;
  if(b.port!==undefined)data.port=b.port?Number(b.port):null;
  if(b.enabled!==undefined)data.enabled=!!b.enabled;
  const device=await db.biometricDevice.upsert({where:{id:DEVICE_ID},update:data,create:{id:DEVICE_ID,name:data.name||"Veg Mantra Fingerprint Station",model:data.model||null,serialNumber:data.serialNumber||null,connectionType:data.connectionType||null,host:data.host||null,port:data.port||null,enabled:data.enabled??true}});
  await db.auditLog.create({data:{actorId:u.id,action:"biometric_device_updated",targetType:"BiometricDevice",targetId:DEVICE_ID,details:JSON.stringify(data)}});
  return NextResponse.json(device);
}
export async function POST(req:Request){
  const u=await getUser();
  if(u?.role!=="OWNER") return NextResponse.json({error:"Forbidden"},{status:403});
  const b=await req.json(),staffId=String(b.staffId||"");
  const staff=await db.user.findFirst({where:{id:staffId,role:"STAFF",active:true},select:{id:true,staffCode:true,name:true}});
  if(!staff)return NextResponse.json({error:"Active staff member not found"},{status:404});
  const device=await db.biometricDevice.findUnique({where:{id:DEVICE_ID}});
  if(!device)return NextResponse.json({error:"Configure the fingerprint device before starting enrollment."},{status:400});
  const existing=await db.fingerprintEnrollment.findFirst({where:{staffId:staff.id,active:true}});
  if(existing)return NextResponse.json({error:"This staff member already has an active fingerprint enrollment."},{status:409});
  const pending=await db.fingerprintEnrollmentRequest.findFirst({where:{staffId:staff.id,status:"PENDING"}});
  if(pending)return NextResponse.json(pending);
  const request=await db.fingerprintEnrollmentRequest.create({data:{staffId:staff.id,requestedById:u.id,deviceId:DEVICE_ID,fingerLabel:b.fingerLabel?String(b.fingerLabel):null,status:"PENDING",expiresAt:new Date(Date.now()+10*60*1000)}});
  await db.auditLog.create({data:{actorId:u.id,action:"fingerprint_enrollment_requested",targetType:"User",targetId:staff.id,details:JSON.stringify({staffCode:staff.staffCode,requestId:request.id,fingerLabel:b.fingerLabel||null})}});
  return NextResponse.json(request);
}
export async function DELETE(req:Request){
  const u=await getUser();
  if(u?.role!=="OWNER")return NextResponse.json({error:"Forbidden"},{status:403});
  const b=await req.json();
  const enrollment=await db.fingerprintEnrollment.findUnique({where:{id:String(b.id||"")},include:{staff:true}});
  if(!enrollment)return NextResponse.json({error:"Fingerprint enrollment not found"},{status:404});
  await db.$transaction(async tx=>{
    await tx.fingerprintEnrollment.update({where:{id:enrollment.id},data:{active:false}});
    await tx.biometricCommand.create({data:{deviceId:enrollment.deviceId,type:"DELETE_ENROLLMENT",deviceUserId:enrollment.deviceUserId,staffCode:enrollment.staff.staffCode,status:"PENDING",details:JSON.stringify({enrollmentId:enrollment.id})}});
    await tx.auditLog.create({data:{actorId:u.id,action:"fingerprint_enrollment_deleted",targetType:"FingerprintEnrollment",targetId:enrollment.id,details:JSON.stringify({staffId:enrollment.staffId,staffCode:enrollment.staff.staffCode,deviceUserId:enrollment.deviceUserId})}});
  });
  return NextResponse.json({ok:true});
}
