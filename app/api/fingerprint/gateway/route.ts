import {NextResponse} from "next/server";
import {db} from "../../../lib/prisma";
import {notifyManager} from "../../../lib/email";
const DEVICE_ID="primary";
export const dynamic="force-dynamic";
function authorized(req:Request){const expected=process.env.FINGERPRINT_GATEWAY_TOKEN;const got=(req.headers.get("authorization")||"").replace(/^Bearer\s+/i,"").trim();return !!expected&&got===expected;}
function istStart(now=new Date()){const p=new Intl.DateTimeFormat("en-US",{timeZone:"Asia/Kolkata",year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(now);const y=Number(p.find(x=>x.type==="year")!.value),m=Number(p.find(x=>x.type==="month")!.value),d=Number(p.find(x=>x.type==="day")!.value);return new Date(Date.UTC(y,m-1,d)-330*60*1000);}
export async function GET(req:Request){
  if(!authorized(req))return NextResponse.json({error:"Unauthorized"},{status:401});
  const device=await db.biometricDevice.findUnique({where:{id:DEVICE_ID}});
  if(!device||!device.enabled)return NextResponse.json({error:"Device disabled or not configured"},{status:409});
  await db.biometricDevice.update({where:{id:DEVICE_ID},data:{lastSeenAt:new Date()}});
  const requests=await db.fingerprintEnrollmentRequest.findMany({where:{deviceId:DEVICE_ID,status:"PENDING",OR:[{expiresAt:null},{expiresAt:{gt:new Date()}}]},include:{staff:{select:{id:true,staffCode:true,name:true}}},orderBy:{createdAt:"asc"},take:10});
  const commands=await db.biometricCommand.findMany({where:{deviceId:DEVICE_ID,status:"PENDING"},orderBy:{createdAt:"asc"},take:25});
  return NextResponse.json({device,requests,commands});
}
export async function POST(req:Request){
  if(!authorized(req))return NextResponse.json({error:"Unauthorized"},{status:401});
  const body=await req.json(),type=String(body.type||"");
  if(type==="enrollment-result"){
    const request=await db.fingerprintEnrollmentRequest.findUnique({where:{id:String(body.requestId||"")},include:{staff:true}});
    if(!request||request.deviceId!==DEVICE_ID)return NextResponse.json({error:"Enrollment request not found"},{status:404});
    if(request.status!=="PENDING")return NextResponse.json({error:"Enrollment request is no longer pending"},{status:409});
    if(!body.success)return NextResponse.json(await db.fingerprintEnrollmentRequest.update({where:{id:request.id},data:{status:"FAILED",completedAt:new Date()}}));
    const deviceUserId=String(body.deviceUserId||"").trim();
    if(!deviceUserId)return NextResponse.json({error:"deviceUserId is required for a successful enrollment"},{status:400});
    const enrollment=await db.$transaction(async tx=>{
      const row=await tx.fingerprintEnrollment.create({data:{staffId:request.staffId,deviceId:DEVICE_ID,deviceUserId,fingerLabel:body.fingerLabel?String(body.fingerLabel):request.fingerLabel||null,active:true}});
      await tx.fingerprintEnrollmentRequest.update({where:{id:request.id},data:{status:"COMPLETED",completedAt:new Date()}});
      await tx.auditLog.create({data:{action:"fingerprint_enrolled",targetType:"FingerprintEnrollment",targetId:row.id,details:JSON.stringify({staffId:request.staffId,staffCode:request.staff.staffCode,deviceUserId})}});
      return row;
    });
    return NextResponse.json(enrollment);
  }
  if(type==="scan"){
    const deviceUserId=String(body.deviceUserId||"").trim();
    const enrollment=await db.fingerprintEnrollment.findFirst({where:{deviceId:DEVICE_ID,deviceUserId,active:true},include:{staff:{select:{id:true,staffCode:true,name:true,photoData:true}}}});
    if(!enrollment)return NextResponse.json({error:"Fingerprint not recognized"},{status:404});
    const start=istStart(),end=new Date(start.getTime()+86400000);
    const row=await db.attendance.findFirst({where:{staffId:enrollment.staffId,date:{gte:start,lt:end}}});
    const state=!row?.checkIn?"CHECKIN":row.lunchStart?"LUNCH_RETURN":row.checkOut?"COMPLETE":"CHOOSE_ACTION";
    return NextResponse.json({staff:enrollment.staff,deviceUserId,attendance:row,screenState:state,actions:state==="CHECKIN"?["checkin"]:state==="LUNCH_RETURN"?["lunch"]:state==="COMPLETE"?[]:["lunch","checkout"]});
  }
  if(type==="attendance"){
    const deviceUserId=String(body.deviceUserId||"").trim(),action=String(body.action||"");
    if(!["checkin","checkout","lunch"].includes(action))return NextResponse.json({error:"Invalid action"},{status:400});
    const enrollment=await db.fingerprintEnrollment.findFirst({where:{deviceId:DEVICE_ID,deviceUserId,active:true},include:{staff:true}});
    if(!enrollment)return NextResponse.json({error:"Fingerprint not recognized"},{status:404});
    const staff=enrollment.staff,now=new Date(),start=istStart(now),end=new Date(start.getTime()+86400000);
    let row=await db.attendance.findFirst({where:{staffId:staff.id,date:{gte:start,lt:end}}});
    if(action==="checkin"){
      if(row?.checkIn)return NextResponse.json({error:"Already checked in today"},{status:400});
      row=row?await db.attendance.update({where:{id:row.id},data:{checkIn:now,status:"PRESENT",note:null,markedById:null}}):await db.attendance.create({data:{staffId:staff.id,date:start,checkIn:now,status:"PRESENT"}});
    }else if(action==="lunch"){
      if(!row?.checkIn)return NextResponse.json({error:"Check-in is required before lunch."},{status:400});
      if(row.checkOut)return NextResponse.json({error:"Shift is already checked out."},{status:400});
      if(row.lunchStart){const seconds=Math.max(0,Math.floor((now.getTime()-row.lunchStart.getTime())/1000));row=await db.attendance.update({where:{id:row.id},data:{lunchStart:null,lunchSeconds:{increment:seconds},markedById:null}})}else{row=await db.attendance.update({where:{id:row.id},data:{lunchStart:now,markedById:null}})}
    }else{
      if(!row?.checkIn)return NextResponse.json({error:"Check-in is required before check-out"},{status:400});
      if(row.lunchStart)return NextResponse.json({error:"End lunch before checking out."},{status:400});
      if(row.checkOut)return NextResponse.json({error:"Already checked out today"},{status:400});
      row=await db.attendance.update({where:{id:row.id},data:{checkOut:now,markedById:null}});
    }
    await db.auditLog.create({data:{action:"fingerprint_attendance_"+action,targetType:"Attendance",targetId:row.id,details:JSON.stringify({staffId:staff.id,staffCode:staff.staffCode,deviceUserId,source:"fingerprint_gateway"})}});
    await notifyManager("Fingerprint attendance: "+staff.name+" "+action,staff.name+" ("+staff.staffCode+") was marked "+action+" at "+now.toLocaleString("en-IN",{timeZone:"Asia/Kolkata"})+" by the fingerprint station.");
    await db.biometricDevice.update({where:{id:DEVICE_ID},data:{lastSeenAt:new Date()}});
    return NextResponse.json(row);
  }
  if(type==="command-complete"){
    const id=String(body.id||"");
    const row=await db.biometricCommand.update({where:{id},data:{status:body.success===false?"FAILED":"COMPLETED",completedAt:new Date(),details:body.details?String(body.details):undefined}});
    return NextResponse.json(row);
  }
  return NextResponse.json({error:"Unknown gateway request"},{status:400});
}
