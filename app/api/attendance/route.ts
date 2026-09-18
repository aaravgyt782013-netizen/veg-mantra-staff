import {NextResponse} from "next/server";
import {db} from "../../../lib/prisma";
import {getUser} from "../../../lib/auth";
import {cafeNetworkAllowed} from "../../../lib/network";
import {notifyManager} from "../../../lib/email";

function istDayStart(now=new Date()){
  const parts=new Intl.DateTimeFormat("en-US",{timeZone:"Asia/Kolkata",year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(now);
  const y=Number(parts.find(x=>x.type==="year")!.value),m=Number(parts.find(x=>x.type==="month")!.value),d=Number(parts.find(x=>x.type==="day")!.value);
  return new Date(Date.UTC(y,m-1,d)-330*60*1000);
}

export async function GET(){
  const u=await getUser();
  if(!u||!["OWNER","MANAGER"].includes(u.role))return NextResponse.json({error:"Forbidden"},{status:403});
  const rows=await db.attendance.findMany({include:{staff:true,markedBy:true},orderBy:{date:"desc"},take:500});
  const start=istDayStart(),end=new Date(start.getTime()+86400000);
  const active=await db.user.findMany({where:{role:"STAFF",active:true},select:{id:true,staffCode:true,name:true,age:true,gender:true,photoData:true}});
  const todayIds=new Set(rows.filter(r=>r.date>=start&&r.date<end).map(r=>r.staffId));
  const virtualAbsent=active.filter(s=>!todayIds.has(s.id)).map(s=>({id:`absent-${s.id}-${start.getTime()}`,staffId:s.id,date:start,checkIn:null,checkOut:null,status:"ABSENT",markedBy:null,staff:s,virtual:true}));
  return NextResponse.json([...virtualAbsent,...rows]);
}

export async function POST(req:Request){
  const u=await getUser();
  if(!u||!["OWNER","MANAGER"].includes(u.role))return NextResponse.json({error:"Forbidden"},{status:403});
  if(u.role==="MANAGER"&&!cafeNetworkAllowed(req))return NextResponse.json({error:"Cafe network required"},{status:403});
  const {staffId,action}=await req.json();
  if(!staffId||!["checkin","checkout"].includes(action))return NextResponse.json({error:"Invalid attendance request"},{status:400});
  const staff=await db.user.findFirst({where:{id:staffId,role:"STAFF",active:true}});
  if(!staff)return NextResponse.json({error:"Active staff member not found"},{status:404});
  const now=new Date(),start=istDayStart(now),end=new Date(start.getTime()+86400000);
  let row=await db.attendance.findFirst({where:{staffId,date:{gte:start,lt:end}}});
  if(action==="checkin"){
    if(row?.checkIn)return NextResponse.json({error:"Already checked in today"},{status:400});
    row=row?await db.attendance.update({where:{id:row.id},data:{checkIn:now,markedById:u.id,status:"PRESENT"}}):await db.attendance.create({data:{staffId,markedById:u.id,date:start,checkIn:now,status:"PRESENT"}});
  }else{
    if(!row?.checkIn)return NextResponse.json({error:"Check-in is required before check-out"},{status:400});
    if(row.checkOut)return NextResponse.json({error:"Already checked out today"},{status:400});
    row=await db.attendance.update({where:{id:row.id},data:{checkOut:now,markedById:u.id}});
  }
  await db.auditLog.create({data:{actorId:u.id,action:`attendance_${action}`,targetType:"Attendance",targetId:row.id,details:JSON.stringify({staffId,staffCode:staff.staffCode})}});
  await notifyManager(`Attendance: ${staff.name} ${action}`,`${staff.name} (${staff.staffCode}) was marked ${action} at ${now.toLocaleString("en-IN",{timeZone:"Asia/Kolkata"})}. Marked by ${u.name}.`);
  return NextResponse.json(row);
}