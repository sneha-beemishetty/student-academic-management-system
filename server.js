require('dotenv').config();
if (!process.env.SESSION_SECRET) throw new Error('Set SESSION_SECRET in your .env file before starting the server.');
const express = require('express');
const session = require('express-session');
const path = require('path');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const db = require('./config/db');
const auth = require('./middleware/auth');
const app = express();

if (process.env.NODE_ENV === 'production') app.set('trust proxy', 1);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({ secret: process.env.SESSION_SECRET, resave: false, saveUninitialized: false, cookie: { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', maxAge: 8 * 60 * 60 * 1000 } }));
app.use(express.static(path.join(__dirname, 'public')));

app.get('/healthz', (req, res) => res.status(200).json({ ok: true }));

async function ensureProductionAdmin() {
  if (process.env.NODE_ENV !== 'production') return;
  const username = process.env.ADMIN_USERNAME;
  const password = process.env.ADMIN_PASSWORD;
  if (!username || !password || password.length < 16) {
    throw new Error('Production requires ADMIN_USERNAME and an ADMIN_PASSWORD of at least 16 characters.');
  }
  const [admins] = await db.execute('SELECT id, username FROM admins');
  if (admins.some(admin => admin.username !== username)) {
    throw new Error('The production database contains an unexpected admin account. Use a fresh demo database; existing accounts were not changed.');
  }
  if (!admins.length) {
    await db.execute('INSERT INTO admins (username, password_hash) VALUES (?, ?)', [username, await bcrypt.hash(password, 12)]);
    console.log(`Created production admin account: ${username}`);
  }
}

const asyncRoute = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const clean = value => typeof value === 'string' ? value.trim() : value;
const required = (body, keys) => keys.filter(key => body[key] === undefined || body[key] === null || String(body[key]).trim() === '');
const validateRecord = (name, body) => {
  if (body.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email)) return 'Enter a valid email address.';
  if (body.phone && !/^[+\d() .-]{7,25}$/.test(body.phone)) return 'Enter a valid phone number.';
  if (body.year !== undefined && body.year !== '' && (!Number.isInteger(Number(body.year)) || Number(body.year) < 1 || Number(body.year) > 8)) return 'Year must be a number from 1 to 8.';
  if (name === 'courses' && body.credits !== undefined && body.credits !== '' && (!Number.isInteger(Number(body.credits)) || Number(body.credits) < 1 || Number(body.credits) > 10)) return 'Credits must be a number from 1 to 10.';
  return null;
};

app.post('/api/login', asyncRoute(async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Enter your username and password.' });
  const [rows] = await db.execute('SELECT id, username, password_hash FROM admins WHERE username = ?', [clean(username)]);
  if (!rows.length) return res.status(401).json({ error: 'Incorrect username or password.' });
  const admin = rows[0];
  let match = false;
  if (/^[a-f0-9]{64}$/i.test(admin.password_hash)) {
    const digest = crypto.createHash('sha256').update(password).digest('hex');
    match = crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(admin.password_hash));
    if (match) await db.execute('UPDATE admins SET password_hash = ? WHERE id = ?', [await bcrypt.hash(password, 12), admin.id]);
  } else match = await bcrypt.compare(password, admin.password_hash);
  if (!match) return res.status(401).json({ error: 'Incorrect username or password.' });
  req.session.admin = { id: admin.id, username: admin.username };
  res.json({ username: admin.username });
}));
app.post('/api/logout', (req, res) => req.session.destroy(() => res.json({ ok: true })));
app.get('/api/me', (req, res) => req.session.admin ? res.json(req.session.admin) : res.status(401).json({ error: 'Not signed in' }));

app.use('/api', auth);

// Used by the dashboard voice assistant to look up real student records.
app.get('/api/voice/students', asyncRoute(async (req, res) => {
  const query = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  if (query.length < 2) return res.status(400).json({ error: 'Enter at least two characters to search for a student.' });
  if (query.length > 100) return res.status(400).json({ error: 'Student search is limited to 100 characters.' });
  const term = `%${query}%`;
  const [rows] = await db.execute(
    'SELECT roll_number, full_name, email, phone, department, year FROM students WHERE full_name LIKE ? OR roll_number LIKE ? OR email LIKE ? ORDER BY full_name LIMIT 5',
    [term, term, term]
  );
  res.json(rows);
}));

const configs = {
  students: { table: 'students', fields: ['roll_number','full_name','email','phone','department','year','gender','date_of_birth','address'], required: ['roll_number','full_name','email','department','year'], select: 'id, roll_number, full_name, email, phone, department, year, gender, date_of_birth, address, created_at', search: ['roll_number','full_name','email'] },
  faculty: { table: 'faculty', fields: ['full_name','email','phone','department','specialization'], required: ['full_name','email','department'], select: 'id, full_name, email, phone, department, specialization' },
  courses: { table: 'courses', fields: ['course_code','course_name','department','year','credits','faculty_id'], required: ['course_code','course_name','department'], select: 'c.id, c.course_code, c.course_name, c.department, c.year, c.credits, c.faculty_id, f.full_name AS faculty_name', joins: ' LEFT JOIN faculty f ON c.faculty_id = f.id' }
};

for (const [name, cfg] of Object.entries(configs)) {
  const alias = name === 'courses' ? 'c' : cfg.table;
  app.get(`/api/${name}`, asyncRoute(async (req, res) => {
    let sql = `SELECT ${cfg.select} FROM ${cfg.table} ${alias}${cfg.joins || ''}`;
    const params = [];
    if (req.query.search && cfg.search) {
      const term = `%${clean(req.query.search)}%`;
      sql += ' WHERE (' + cfg.search.map(f => `${f} LIKE ?`).join(' OR ') + ')';
      params.push(...cfg.search.map(() => term));
    }
    sql += name === 'students' ? ' ORDER BY created_at DESC' : ` ORDER BY ${name === 'courses' ? 'c.course_name' : 'full_name'}`;
    const [rows] = await db.execute(sql, params); res.json(rows);
  }));
  app.post(`/api/${name}`, asyncRoute(async (req, res) => {
    const missing = required(req.body, cfg.required); if (missing.length) return res.status(400).json({ error: `Required: ${missing.join(', ')}` });
    const invalid = validateRecord(name, req.body); if (invalid) return res.status(400).json({ error: invalid });
    const values = cfg.fields.map(k => clean(req.body[k]) || null);
    const [result] = await db.execute(`INSERT INTO ${cfg.table} (${cfg.fields.join(',')}) VALUES (${cfg.fields.map(() => '?').join(',')})`, values);
    res.status(201).json({ id: result.insertId, message: 'Record added.' });
  }));
  app.put(`/api/${name}/:id`, asyncRoute(async (req, res) => {
    const missing = required(req.body, cfg.required); if (missing.length) return res.status(400).json({ error: `Required: ${missing.join(', ')}` });
    const invalid = validateRecord(name, req.body); if (invalid) return res.status(400).json({ error: invalid });
    const values = cfg.fields.map(k => clean(req.body[k]) || null);
    const [result] = await db.execute(`UPDATE ${cfg.table} SET ${cfg.fields.map(k => `${k} = ?`).join(', ')} WHERE id = ?`, [...values, req.params.id]);
    if (!result.affectedRows) return res.status(404).json({ error: 'Record not found.' }); res.json({ message: 'Record updated.' });
  }));
  app.delete(`/api/${name}/:id`, asyncRoute(async (req, res) => {
    const [result] = await db.execute(`DELETE FROM ${cfg.table} WHERE id = ?`, [req.params.id]);
    if (!result.affectedRows) return res.status(404).json({ error: 'Record not found.' }); res.json({ message: 'Record deleted.' });
  }));
}

app.get('/api/enrollments', asyncRoute(async (req,res) => { const [rows] = await db.execute('SELECT e.id,e.student_id,e.course_id,s.full_name AS student_name,s.roll_number,c.course_name,c.course_code FROM enrollments e JOIN students s ON e.student_id=s.id JOIN courses c ON e.course_id=c.id ORDER BY s.full_name,c.course_name'); res.json(rows); }));
app.post('/api/enrollments', asyncRoute(async (req,res) => { if (!req.body.student_id || !req.body.course_id) return res.status(400).json({error:'Choose a student and course.'}); const [r] = await db.execute('INSERT INTO enrollments(student_id,course_id) VALUES(?,?)',[req.body.student_id,req.body.course_id]); res.status(201).json({id:r.insertId}); }));
app.delete('/api/enrollments/:id', asyncRoute(async(req,res)=>{const [r]=await db.execute('DELETE FROM enrollments WHERE id=?',[req.params.id]); if(!r.affectedRows)return res.status(404).json({error:'Enrollment not found.'});res.json({ok:true});}));

app.get('/api/attendance', asyncRoute(async (req,res) => {
 const [rows] = await db.execute(`SELECT a.id,a.student_id,a.course_id,a.attendance_date,a.status,s.full_name AS student_name,s.roll_number,c.course_name FROM attendance a JOIN students s ON a.student_id=s.id JOIN courses c ON a.course_id=c.id ORDER BY a.attendance_date DESC,s.full_name`); res.json(rows);
}));
app.post('/api/attendance/bulk', asyncRoute(async(req,res)=>{
 const {course_id,attendance_date,records}=req.body; if(!course_id||!attendance_date||!Array.isArray(records)||!records.length)return res.status(400).json({error:'Choose a course, date and at least one student.'});
 const connection=await db.getConnection(); try { await connection.beginTransaction(); for(const row of records){if(!row.student_id||!['Present','Absent'].includes(row.status))throw new Error('Invalid attendance record.'); await connection.execute('INSERT INTO attendance(student_id,course_id,attendance_date,status) VALUES(?,?,?,?) ON DUPLICATE KEY UPDATE status=VALUES(status)',[row.student_id,course_id,attendance_date,row.status]);} await connection.commit(); res.json({message:'Attendance saved.'});}catch(e){await connection.rollback();throw e;}finally{connection.release();}
}));
app.delete('/api/attendance/:id',asyncRoute(async(req,res)=>{const[r]=await db.execute('DELETE FROM attendance WHERE id=?',[req.params.id]);if(!r.affectedRows)return res.status(404).json({error:'Attendance record not found.'});res.json({ok:true});}));

app.get('/api/marks', asyncRoute(async(req,res)=>{const[rows]=await db.execute(`SELECT m.id,m.student_id,m.course_id,m.internal_marks,m.external_marks,m.total_marks,m.grade,s.full_name AS student_name,s.roll_number,c.course_name FROM marks m JOIN students s ON m.student_id=s.id JOIN courses c ON m.course_id=c.id ORDER BY s.full_name,c.course_name`);res.json(rows);}));
app.post('/api/marks', asyncRoute(async(req,res)=>saveMarks(req,res)));
app.put('/api/marks/:id', asyncRoute(async(req,res)=>saveMarks(req,res,req.params.id)));
async function saveMarks(req,res,id){ const {student_id,course_id,internal_marks,external_marks}=req.body; const i=Number(internal_marks),e=Number(external_marks); if(!student_id||!course_id||!Number.isFinite(i)||!Number.isFinite(e)||i<0||i>40||e<0||e>60)return res.status(400).json({error:'Select student and course. Internal marks must be 0–40 and external marks 0–60.'}); const total=i+e,grade=total>=90?'A+':total>=80?'A':total>=70?'B':total>=60?'C':total>=50?'D':'F'; if(id){const[r]=await db.execute('UPDATE marks SET student_id=?,course_id=?,internal_marks=?,external_marks=?,total_marks=?,grade=? WHERE id=?',[student_id,course_id,i,e,total,grade,id]);if(!r.affectedRows)return res.status(404).json({error:'Marks record not found.'});}else{const[r]=await db.execute('INSERT INTO marks(student_id,course_id,internal_marks,external_marks,total_marks,grade) VALUES(?,?,?,?,?,?)',[student_id,course_id,i,e,total,grade]);return res.status(201).json({id:r.insertId,total,grade});} res.json({message:'Marks saved.',total,grade}); }
app.delete('/api/marks/:id',asyncRoute(async(req,res)=>{const[r]=await db.execute('DELETE FROM marks WHERE id=?',[req.params.id]);if(!r.affectedRows)return res.status(404).json({error:'Marks record not found.'});res.json({ok:true});}));

app.get('/api/dashboard',asyncRoute(async(req,res)=>{const [[s]]=await db.execute('SELECT COUNT(*) AS count FROM students');const[[f]]=await db.execute('SELECT COUNT(*) AS count FROM faculty');const[[c]]=await db.execute('SELECT COUNT(*) AS count FROM courses');const[[a]]=await db.execute('SELECT ROUND(COALESCE(100*AVG(is_present),0),1) AS average FROM (SELECT status="Present" AS is_present FROM attendance) x');const[recent]=await db.execute('SELECT id,roll_number,full_name,department,year,created_at FROM students ORDER BY created_at DESC LIMIT 5');const[performance]=await db.execute('SELECT c.course_name,ROUND(AVG(m.total_marks),1) AS average,COUNT(m.id) AS students FROM marks m JOIN courses c ON c.id=m.course_id GROUP BY c.id,c.course_name ORDER BY average DESC LIMIT 6');res.json({students:s.count,faculty:f.count,courses:c.count,attendance:a.average,recent,performance});}));
app.get('/api/reports/:type',asyncRoute(async(req,res)=>{const queries={students:'SELECT roll_number,full_name,email,phone,department,year FROM students ORDER BY department,full_name',attendance:'SELECT s.roll_number,s.full_name,c.course_name,COUNT(*) AS classes,SUM(a.status="Present") AS present,ROUND(100*SUM(a.status="Present")/COUNT(*),1) AS percentage FROM attendance a JOIN students s ON s.id=a.student_id JOIN courses c ON c.id=a.course_id GROUP BY s.id,c.id ORDER BY s.full_name,c.course_name',marks:'SELECT s.roll_number,s.full_name,c.course_code,c.course_name,m.internal_marks,m.external_marks,m.total_marks,m.grade FROM marks m JOIN students s ON s.id=m.student_id JOIN courses c ON c.id=m.course_id ORDER BY c.course_name,s.full_name',performance:'SELECT s.roll_number,s.full_name,COUNT(m.id) AS subjects,ROUND(AVG(m.total_marks),1) AS average,CASE WHEN AVG(m.total_marks)>=90 THEN "A+" WHEN AVG(m.total_marks)>=80 THEN "A" WHEN AVG(m.total_marks)>=70 THEN "B" WHEN AVG(m.total_marks)>=60 THEN "C" WHEN AVG(m.total_marks)>=50 THEN "D" WHEN AVG(m.total_marks) IS NOT NULL THEN "F" ELSE "—" END AS grade FROM students s LEFT JOIN marks m ON s.id=m.student_id GROUP BY s.id ORDER BY average DESC'};if(!queries[req.params.type])return res.status(404).json({error:'Report not found.'});const[rows]=await db.execute(queries[req.params.type]);res.json(rows);}));

app.get('/api/options',asyncRoute(async(req,res)=>{const[students]=await db.execute('SELECT id,roll_number,full_name FROM students ORDER BY full_name');const[courses]=await db.execute('SELECT id,course_code,course_name FROM courses ORDER BY course_name');const[faculty]=await db.execute('SELECT id,full_name FROM faculty ORDER BY full_name');res.json({students,courses,faculty});}));

app.get('/',(req,res)=>req.session.admin?res.redirect('/dashboard'):res.sendFile(path.join(__dirname,'views','login.html')));
app.get('/:page', (req,res,next)=>{const pages=['dashboard','students','faculty','courses','attendance','marks','reports']; if(pages.includes(req.params.page)){if(!req.session.admin)return res.redirect('/');return res.sendFile(path.join(__dirname,'views',`${req.params.page}.html`));}next();});
app.use((err,req,res,next)=>{console.error(err);let message=err.code==='ER_DUP_ENTRY'?'That value already exists. Check unique fields and try again.':err.code==='ER_ROW_IS_REFERENCED_2'?'This record is linked to other data. Remove its enrollments, attendance or marks first.':(process.env.NODE_ENV==='production'?'Something went wrong.':err.message);res.status(500).json({error:message});});
const port=Number(process.env.PORT||3000);
ensureProductionAdmin().then(() => app.listen(port,()=>console.log(`Student Academic Management System listening on port ${port}`))).catch(error => { console.error(error); process.exit(1); });
