const express=require("express");
const session=require("express-session");
const bcrypt=require("bcryptjs");
const crypto=require("crypto");
const path=require("path");
const fs=require("fs");
const multer=require("multer");
const QRCode=require("qrcode");
const db=require("./database");

const app=express(), PORT=process.env.PORT||3000;
const uploadDir=path.join(__dirname,"uploads");
fs.mkdirSync(uploadDir,{recursive:true});
app.disable("x-powered-by");
app.use(express.json({limit:"40kb"}));
app.use(session({
 secret:process.env.SESSION_SECRET||"CHANGE_THIS_SECRET_BEFORE_DEPLOYMENT",
 resave:false,saveUninitialized:false,
 cookie:{httpOnly:true,sameSite:"lax",secure:process.env.NODE_ENV==="production",maxAge:8*60*60*1000}
}));
app.use(express.static(path.join(__dirname,"public")));
const upload=multer({
 storage:multer.diskStorage({
  destination:(req,file,cb)=>cb(null,uploadDir),
  filename:(req,file,cb)=>cb(null,crypto.randomUUID()+path.extname(file.originalname).toLowerCase())
 }),
 limits:{fileSize:5*1024*1024},
 fileFilter:(req,file,cb)=>{
  const ok=["application/pdf","image/jpeg","image/png","image/webp"].includes(file.mimetype);
  cb(ok?null:new Error("Only PDF, JPG, PNG or WEBP files are allowed."),ok);
 }
});
const stages=["Harvested","Quality Inspection","Processing","Packaged","Transferred","Distributed","Retail"];
const roles=["admin","beekeeper","processing","customer"];
const writeHits=new Map();
function rateLimit(req,res,next){
 const key=req.ip||"unknown",now=Date.now(),old=writeHits.get(key);
 if(!old||now-old.start>60000){writeHits.set(key,{start:now,count:1});return next();}
 old.count++; if(old.count>40)return res.status(429).json({success:false,message:"Too many requests. Try again in one minute."}); next();
}
setInterval(()=>{const now=Date.now();for(const [k,v] of writeHits)if(now-v.start>120000)writeHits.delete(k)},60000).unref();
function auth(req,res,next){if(!req.session.user)return res.status(401).json({success:false,message:"Please log in first."});next();}
function role(...allowed){return (req,res,next)=>{if(!req.session.user)return res.status(401).json({success:false,message:"Please log in first."});if(!allowed.includes(req.session.user.role))return res.status(403).json({success:false,message:"Your account role cannot perform this action."});next();};}
function audit(req,action,type,id=""){db.prepare("INSERT INTO audit_log(user_id,action,entity_type,entity_id,created_at) VALUES(?,?,?,?,?)").run(req.session.user?.id||null,action,type,String(id),new Date().toISOString());}
function text(v,max=120){return typeof v==="string"&&v.trim().length>0&&v.trim().length<=max;}
function dateOk(v){if(typeof v!=="string"||!/^\d{4}-\d{2}-\d{2}$/.test(v))return false;const d=new Date(v+"T00:00:00Z");return !Number.isNaN(d.getTime())&&d.toISOString().slice(0,10)===v;}
function batchData(b){return {batch_id:b.batch_id,beekeeper:b.beekeeper,honey_type:b.honey_type,quantity:Number(b.quantity),harvest_date:b.harvest_date,location:b.location,hive_id:b.hive_id??null,apiary_id:b.apiary_id??null,previous_hash:b.previous_hash,created_at:b.created_at};}
function hashRecord(r){return crypto.createHash("sha256").update(JSON.stringify(r)).digest("hex");}
function safeBatch(b){return {...b,quantity:Number(b.quantity)};}
function getBatch(id){return db.prepare("SELECT * FROM honey_batches WHERE batch_id=?").get(id);}
function batchVisibleTo(req,b){return req.session.user?.role==="admin"||req.session.user?.role==="processing"||req.session.user?.role==="beekeeper"||req.session.user?.role==="customer";}
app.get("/",(req,res)=>res.sendFile(path.join(__dirname,"public","index.html")));
app.get("/track/:batchId",(req,res)=>res.sendFile(path.join(__dirname,"public","index.html")));
app.get("/api/health",(req,res)=>res.json({success:true,message:"HoneyChain server is running"}));
app.get("/api/me",(req,res)=>res.json({success:true,user:req.session.user||null}));
app.post("/api/auth/register",rateLimit,async(req,res)=>{
 const {name,email,password,role="customer"}=req.body||{};
 if(!text(name,100)||!text(email,180)||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||typeof password!=="string"||password.length<8||password.length>100)
  return res.status(400).json({success:false,message:"Enter a name, valid email and password of at least 8 characters."});
 // Public registration cannot grant elevated roles.
 if(!["customer","beekeeper"].includes(role))return res.status(400).json({success:false,message:"Public registration supports customer or beekeeper accounts only."});
 try{
  const hash=await bcrypt.hash(password,12),created=new Date().toISOString();
  const info=db.prepare("INSERT INTO users(name,email,password_hash,role,created_at) VALUES(?,?,?,?,?)").run(name.trim(),email.trim().toLowerCase(),hash,role,created);
  req.session.user={id:Number(info.lastInsertRowid),name:name.trim(),email:email.trim().toLowerCase(),role};
  audit(req,"register","user",info.lastInsertRowid);
  res.status(201).json({success:true,user:req.session.user});
 }catch(e){if(e.code==="SQLITE_CONSTRAINT_UNIQUE")return res.status(409).json({success:false,message:"An account with this email already exists."});throw e;}
});
app.post("/api/auth/login",rateLimit,async(req,res)=>{
 const {email,password}=req.body||{};
 if(!text(email,180)||typeof password!=="string")return res.status(400).json({success:false,message:"Enter your email and password."});
 const u=db.prepare("SELECT * FROM users WHERE email=?").get(email.trim().toLowerCase());
 if(!u||!(await bcrypt.compare(password,u.password_hash)))return res.status(401).json({success:false,message:"Incorrect email or password."});
 req.session.regenerate(err=>{if(err)return res.status(500).json({success:false,message:"Could not start session."});req.session.user={id:u.id,name:u.name,email:u.email,role:u.role};audit(req,"login","user",u.id);res.json({success:true,user:req.session.user});});
});
app.post("/api/auth/logout",auth,(req,res)=>req.session.destroy(()=>res.json({success:true,message:"Logged out."})));

app.get("/api/dashboard",auth,(req,res)=>{
 const batches=db.prepare("SELECT COUNT(*) count,COALESCE(SUM(quantity),0) quantity FROM honey_batches").get();
 const apiaries=db.prepare("SELECT COUNT(*) count FROM apiaries").get();
 const hives=db.prepare("SELECT COUNT(*) count FROM hives").get();
 const reports=db.prepare("SELECT COUNT(*) count FROM quality_reports").get();
 const stagesCount=db.prepare("SELECT COUNT(*) count FROM batch_stages").get();
 const recent=db.prepare("SELECT batch_id,honey_type,quantity,harvest_date,location,created_at FROM honey_batches ORDER BY id DESC LIMIT 8").all();
 res.json({success:true,stats:{batches:batches.count,quantity:Number(batches.quantity),apiaries:apiaries.count,hives:hives.count,qualityReports:reports.count,recordedEvents:stagesCount.count},recent});
});

// Beekeeper/apiary and hive management
app.get("/api/apiaries",auth,(req,res)=>res.json({success:true,apiaries:db.prepare("SELECT a.*,u.name beekeeper_name FROM apiaries a LEFT JOIN users u ON u.id=a.beekeeper_user_id ORDER BY a.id DESC").all()}));
app.post("/api/apiaries",role("admin","beekeeper"),rateLimit,(req,res)=>{
 const {name,location,notes=""}=req.body||{};
 if(!text(name,120)||!text(location,160)||typeof notes!=="string"||notes.length>500)return res.status(400).json({success:false,message:"Enter valid apiary name/location; notes must be under 500 characters."});
 const info=db.prepare("INSERT INTO apiaries(name,location,beekeeper_user_id,notes,created_at) VALUES(?,?,?,?,?)").run(name.trim(),location.trim(),req.session.user.role==="beekeeper"?req.session.user.id:null,notes.trim(),new Date().toISOString());
 audit(req,"create","apiary",info.lastInsertRowid);res.status(201).json({success:true,apiary:db.prepare("SELECT * FROM apiaries WHERE id=?").get(info.lastInsertRowid)});
});
app.get("/api/hives",auth,(req,res)=>res.json({success:true,hives:db.prepare("SELECT h.*,a.name apiary_name FROM hives h JOIN apiaries a ON a.id=h.apiary_id ORDER BY h.id DESC").all()}));
app.post("/api/hives",role("admin","beekeeper"),rateLimit,(req,res)=>{
 const {apiaryId,hiveCode,species="",notes=""}=req.body||{};
 if(!Number.isInteger(Number(apiaryId))||!text(hiveCode,80)||typeof species!=="string"||species.length>100||typeof notes!=="string"||notes.length>500)return res.status(400).json({success:false,message:"Enter valid hive code and apiary."});
 if(!db.prepare("SELECT id FROM apiaries WHERE id=?").get(Number(apiaryId)))return res.status(404).json({success:false,message:"Apiary not found."});
 try{const info=db.prepare("INSERT INTO hives(apiary_id,hive_code,species,notes,created_at) VALUES(?,?,?,?,?)").run(Number(apiaryId),hiveCode.trim(),species.trim(),notes.trim(),new Date().toISOString());audit(req,"create","hive",info.lastInsertRowid);res.status(201).json({success:true,hive:db.prepare("SELECT * FROM hives WHERE id=?").get(info.lastInsertRowid)});}catch(e){if(e.code==="SQLITE_CONSTRAINT_UNIQUE")return res.status(409).json({success:false,message:"Hive code already exists."});throw e;}
});

// Public, read-only batch summaries for the landing page. Write endpoints remain authenticated.
app.get("/api/public/batches",(req,res)=>res.json({success:true,batches:db.prepare("SELECT batch_id,beekeeper,honey_type,quantity,harvest_date,location,created_at FROM honey_batches ORDER BY id DESC LIMIT 30").all().map(safeBatch)}));
app.get("/api/batches",auth,(req,res)=>res.json({success:true,batches:db.prepare("SELECT * FROM honey_batches ORDER BY id DESC").all().map(safeBatch)}));
app.post("/api/batches",role("admin","beekeeper"),rateLimit,(req,res)=>{
 const {beekeeper,honeyType,quantity,harvestDate,location,hiveId=null,apiaryId=null}=req.body||{};
 if(!text(beekeeper)||!text(honeyType)||!text(location)||!dateOk(harvestDate)||!Number.isFinite(quantity)||quantity<=0||quantity>1000000)return res.status(400).json({success:false,message:"Enter valid beekeeper, honey type, quantity, harvest date and location."});
 if(hiveId!==null&&hiveId!==""&&!db.prepare("SELECT id FROM hives WHERE id=?").get(Number(hiveId)))return res.status(400).json({success:false,message:"Selected hive does not exist."});
 if(apiaryId!==null&&apiaryId!==""&&!db.prepare("SELECT id FROM apiaries WHERE id=?").get(Number(apiaryId)))return res.status(400).json({success:false,message:"Selected apiary does not exist."});
 const last=db.prepare("SELECT record_hash FROM honey_batches ORDER BY id DESC LIMIT 1").get();
 const r={batch_id:"HC-"+crypto.randomUUID(),beekeeper:beekeeper.trim(),honey_type:honeyType.trim(),quantity:Number(quantity),harvest_date:harvestDate,location:location.trim(),hive_id:hiveId?Number(hiveId):null,apiary_id:apiaryId?Number(apiaryId):null,previous_hash:last?last.record_hash:"GENESIS",created_at:new Date().toISOString()};
 const recordHash=hashRecord(r);
 db.prepare(`INSERT INTO honey_batches(batch_id,beekeeper,honey_type,quantity,harvest_date,location,hive_id,apiary_id,previous_hash,record_hash,created_at) VALUES(@batch_id,@beekeeper,@honey_type,@quantity,@harvest_date,@location,@hive_id,@apiary_id,@previous_hash,@record_hash,@created_at)`).run({...r,record_hash:recordHash});
 audit(req,"create","batch",r.batch_id);res.status(201).json({success:true,batch:{...r,record_hash:recordHash}});
});
app.get("/api/batches/:batchId",(req,res)=>{
 const b=getBatch(req.params.batchId);if(!b)return res.status(404).json({success:false,message:"Honey batch not found."});
 const stagesRows=db.prepare("SELECT s.*,u.name actor_name FROM batch_stages s LEFT JOIN users u ON u.id=s.user_id WHERE batch_id=? ORDER BY id ASC").all(b.batch_id);
 const reports=db.prepare("SELECT id,batch_id,report_title,inspection_result,notes,file_name,created_at FROM quality_reports WHERE batch_id=? ORDER BY id DESC").all(b.batch_id);
 res.json({success:true,batch:safeBatch(b),stages:stagesRows,reports});
});
app.get("/api/batches/:batchId/qr",async(req,res)=>{
 const b=getBatch(req.params.batchId);if(!b)return res.status(404).json({success:false,message:"Honey batch not found."});
 const base=(process.env.PUBLIC_BASE_URL||`${req.protocol}://${req.get("host")}`).replace(/\/+$/,"");
 const url=`${base}/track/${encodeURIComponent(b.batch_id)}`;
 try{res.json({success:true,batchId:b.batch_id,url,qr:await QRCode.toDataURL(url,{width:320,margin:2})});}catch{res.status(500).json({success:false,message:"QR generation failed."});}
});
app.get("/api/batches/:batchId/verify",(req,res)=>{
 const b=getBatch(req.params.batchId);if(!b)return res.status(404).json({success:false,message:"Honey batch not found."});
 const calculated=hashRecord(batchData(b));
 const prior=db.prepare("SELECT record_hash FROM honey_batches WHERE id < ? ORDER BY id DESC LIMIT 1").get(b.id);
 const previousLinkOk=b.previous_hash===(prior?prior.record_hash:"GENESIS");
 const integrityVerified=calculated===b.record_hash&&previousLinkOk;
 res.json({success:true,batchId:b.batch_id,integrityVerified,recordHashValid:calculated===b.record_hash,previousLinkValid:previousLinkOk,storedHash:b.record_hash,calculatedHash:calculated,previousHash:b.previous_hash,message:integrityVerified?"Record hash and previous-record link verified":"Integrity check failed: hash or previous-record link mismatch"});
});
app.post("/api/batches/:batchId/stages",role("admin","beekeeper","processing"),rateLimit,(req,res)=>{
 const b=getBatch(req.params.batchId);if(!b)return res.status(404).json({success:false,message:"Batch not found."});
 const {stageName,stageDate,location="",notes=""}=req.body||{};
 if(!stages.includes(stageName)||!dateOk(stageDate)||typeof location!=="string"||location.length>160||typeof notes!=="string"||notes.length>500)return res.status(400).json({success:false,message:"Choose a valid stage and date. Location max 160, notes max 500 characters."});
 const info=db.prepare("INSERT INTO batch_stages(batch_id,stage_name,notes,location,stage_date,created_at,user_id) VALUES(?,?,?,?,?,?,?)").run(b.batch_id,stageName,notes.trim(),location.trim(),stageDate,new Date().toISOString(),req.session.user.id);
 audit(req,"create","stage",info.lastInsertRowid);res.status(201).json({success:true,stage:db.prepare("SELECT * FROM batch_stages WHERE id=?").get(info.lastInsertRowid)});
});
app.get("/api/batches/:batchId/stages",(req,res)=>{
 const b=getBatch(req.params.batchId);if(!b)return res.status(404).json({success:false,message:"Batch not found."});
 res.json({success:true,stages:db.prepare("SELECT * FROM batch_stages WHERE batch_id=? ORDER BY id ASC").all(b.batch_id)});
});
app.post("/api/batches/:batchId/reports",role("admin","processing"),rateLimit,upload.single("reportFile"),(req,res)=>{
 const b=getBatch(req.params.batchId);if(!b){if(req.file)fs.unlinkSync(req.file.path);return res.status(404).json({success:false,message:"Batch not found."});}
 const {reportTitle,inspectionResult,notes=""}=req.body||{};
 if(!text(reportTitle,140)||!["Passed","Failed","Pending","Needs review"].includes(inspectionResult)||typeof notes!=="string"||notes.length>1000){if(req.file)fs.unlinkSync(req.file.path);return res.status(400).json({success:false,message:"Enter report title, valid result and notes under 1000 characters."});}
 const info=db.prepare("INSERT INTO quality_reports(batch_id,report_title,inspection_result,notes,file_name,stored_file,uploaded_by,created_at) VALUES(?,?,?,?,?,?,?,?)").run(b.batch_id,reportTitle.trim(),inspectionResult,notes.trim(),req.file?.originalname||null,req.file?.filename||null,req.session.user.id,new Date().toISOString());
 audit(req,"create","quality_report",info.lastInsertRowid);res.status(201).json({success:true,report:db.prepare("SELECT id,batch_id,report_title,inspection_result,notes,file_name,created_at FROM quality_reports WHERE id=?").get(info.lastInsertRowid)});
});
app.get("/api/reports/:id/file",auth,(req,res)=>{
 const r=db.prepare("SELECT * FROM quality_reports WHERE id=?").get(Number(req.params.id));
 if(!r||!r.stored_file)return res.status(404).json({success:false,message:"Report file not found."});
 res.download(path.join(uploadDir,path.basename(r.stored_file)),r.file_name||"quality-report");
});
app.get("/api/reports/batches.csv",auth,(req,res)=>{
 const rows=db.prepare(`SELECT b.batch_id,b.beekeeper,b.honey_type,b.quantity,b.harvest_date,b.location,a.name apiary_name,h.hive_code,b.previous_hash,b.record_hash,b.created_at FROM honey_batches b LEFT JOIN apiaries a ON a.id=b.apiary_id LEFT JOIN hives h ON h.id=b.hive_id ORDER BY b.id DESC`).all();
 const esc=v=>{let s=String(v??"");if(/^[=+\-@\t\r]/.test(s))s="'"+s;return '"'+s.replace(/"/g,'""')+'"';};
 const headers=["batch_id","beekeeper","honey_type","quantity_kg","harvest_date","location","apiary","hive_code","previous_hash","record_hash","created_at"];
 const csv=[headers,...rows.map(r=>[r.batch_id,r.beekeeper,r.honey_type,r.quantity,r.harvest_date,r.location,r.apiary_name,r.hive_code,r.previous_hash,r.record_hash,r.created_at])].map(r=>r.map(esc).join(",")).join("\r\n");
 res.setHeader("Content-Type","text/csv; charset=utf-8");res.setHeader("Content-Disposition",'attachment; filename="honeychain-batches.csv"');res.send("\uFEFF"+csv);
});
app.get("/api/reports/summary",auth,(req,res)=>{
 const summary=db.prepare(`SELECT b.batch_id,b.honey_type,b.quantity,b.harvest_date,
 (SELECT COUNT(*) FROM batch_stages s WHERE s.batch_id=b.batch_id) event_count,
 (SELECT COUNT(*) FROM quality_reports q WHERE q.batch_id=b.batch_id) report_count
 FROM honey_batches b ORDER BY b.id DESC`).all();
 res.json({success:true,summary});
});
app.get("/api/audit",role("admin"),(req,res)=>res.json({success:true,events:db.prepare("SELECT a.*,u.name user_name FROM audit_log a LEFT JOIN users u ON u.id=a.user_id ORDER BY a.id DESC LIMIT 250").all()}));
app.get("/api/admin/users",role("admin"),(req,res)=>res.json({success:true,users:db.prepare("SELECT id,name,email,role,created_at FROM users ORDER BY id ASC").all()}));
app.patch("/api/admin/users/:id/role",role("admin"),rateLimit,(req,res)=>{
 const {role:nextRole}=req.body||{};if(!roles.includes(nextRole))return res.status(400).json({success:false,message:"Invalid role."});
 if(Number(req.params.id)===req.session.user.id&&nextRole!=="admin")return res.status(400).json({success:false,message:"You cannot remove your own admin role."});
 const info=db.prepare("UPDATE users SET role=? WHERE id=?").run(nextRole,Number(req.params.id));if(!info.changes)return res.status(404).json({success:false,message:"User not found."});
 audit(req,"change_role","user",req.params.id);res.json({success:true,message:"Role updated."});
});
app.use("/api",(req,res)=>res.status(404).json({success:false,message:"API endpoint not found."}));
app.use((err,req,res,next)=>{
 if(res.headersSent)return next(err);
 if(err instanceof SyntaxError&&"body" in err)return res.status(400).json({success:false,message:"Invalid JSON."});
 if(err instanceof multer.MulterError)return res.status(400).json({success:false,message:err.code==="LIMIT_FILE_SIZE"?"File must be 5 MB or smaller.":err.message});
 if(err.message==="Only PDF, JPG, PNG or WEBP files are allowed.")return res.status(400).json({success:false,message:err.message});
 console.error(err);res.status(500).json({success:false,message:"Internal server error."});
});
app.listen(PORT,"0.0.0.0",()=>console.log(`HoneyChain running at http://localhost:${PORT}`));