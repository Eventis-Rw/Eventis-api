const {PrismaClient}=require('@prisma/client');const db=new PrismaClient();(async()=>{
const categories=[['music','Music'],['nightlife','Nightlife'],['tech','Tech'],['business','Business'],['sports','Sports'],['arts','Arts & Culture'],['food','Food & Drink'],['faith','Faith'],['community','Community'],['education','Education']];
for(const [i,[slug,name]] of categories.entries()) await db.category.upsert({where:{slug},create:{slug,name,position:(i+1)*10},update:{}});
for(const [accountType,prices] of [['PRIVATE',[5000,15000,120000]],['PUBLIC',[8000,25000,200000]]])for(const [i,interval] of ['WEEKLY','MONTHLY','YEARLY'].entries())await db.installmentPlan.upsert({where:{accountType_interval:{accountType,interval}},create:{accountType,interval,durationDays:[7,30,365][i],priceMinor:BigInt(prices[i])},update:{durationDays:[7,30,365][i],priceMinor:BigInt(prices[i]),isActive:true}});
console.log('Initialized categories and FindLove plan catalog; no demonstration users or events were seeded.');
})().finally(()=>db.$disconnect()).catch(e=>{console.error(e.message);process.exitCode=1});
