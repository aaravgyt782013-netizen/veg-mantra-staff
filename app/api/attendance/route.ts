import {NextResponse} from "next/server";
import {db} from "../../../lib/prisma"; import {getUser} from "../../../lib/auth"; import {cafeNetworkAllowed} from "../../../lib/network"; import {notifyManager} from "../../../lib/email";
export async function GET(){const u=await getUser();if(!u)return NextResponse.json({error:"Unauthorized"},{status:401});const rows=await db.attendance.findMany({include:{staff:true,markedBy:true},orderBy:{date:"desc"},take:200});return NextResponse.json(rows);}
export async function POST(req:Request){
 const u=await getUser(); if(!u||!["OWNER","MANAGER"].includes(u.role)) return NextResponse.json({error:"Forbidden"},{status:403});
 if(u.role!=="OWNER"&&!cafeNetworkAllowed(req)) return NextResponse.json({error:"Cafe network required"},{status:403});
 const {staffId,action}=await req.json(); const now=new Date(); const start=new Date(now);start.setHours(0,0,0,0); const end=new Date(start);end.setDate(end.getDate()+1);
 let row=await db.attendance.findFirst({where:{staffId,date:{gte:start,lt:end}}});
 if(action==="checkin"){
   if(row?.checkIn)return NextResponse.json({error:"Already checked in"},{status:400});
   row=row?await db.attendance.update({where:{id:row.id},data:{checkIn:now,status:"PRESENT"}}):await db.attendance.create({data:{staffId,markedById:u.id,date:start,checkIn:now,status:"PRESENT"}});
 } else if(action==="checkout"){
   if(!row?.checkIn)return NextResponse.json({error:"Staff has not checked in today"},{status:400});
   if(row.checkOut)return NextResponse.json({error:"Already checked out"},{status:400});
   row=await db.attendance.update({where:{id:row.id},data:{checkOut:now}});
 } else return NextResponse.json({error:"Invalid action"},{status:400});
 await db.auditLog.create({data:{actorId:u.id,action:`attendance_${action}`,targetType:"Attendance",targetId:row.id,details:JSON.stringify({staffId})}});
 const staff=await db.user.findUnique({where:{id:staffId}});
 if(staff) await notifyManager(`Attendance: ${staff.name} ${action}`,`${staff.name} was marked ${action} at ${now.toLocaleString("en-IN",{timeZone:"Asia/Kolkata"})}. Marked by ${u.name}.`);
 return NextResponse.json(row);
}