// npm run setup  -  creates the placement_portal database, tables, logic, accounts, permissions, sample data
// and the MongoDB documents. Root (from .env.local) is used for setup only. Nothing is ever dropped and no other
// database (MySQL or MongoDB) is touched. Safe to run again: it detects what already exists.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import mysql from 'mysql2/promise';
import { MongoClient } from 'mongodb';
import { appendEnv, die, hostPort, loadEnv, projectRoot, runMysql } from './_env.mjs';

const DB = 'placement_portal';
const MONGO_DB = process.env.MONGODB_DB || 'placement_portal_docs';
const OUR_TABLES = ['users', 'students', 'companies', 'jobs', 'skills', 'student_skills', 'job_skills', 'applications', 'placements', 'audit_log'];
const sqlFile = (n) => path.join(projectRoot, 'sql', n);

if (!loadEnv()) die('.env.local was not found. Copy .env.local.example to .env.local and enter your MySQL root password in it.');
const rootUser = process.env.MYSQL_ROOT_USER || 'root';
const rootPw = process.env.MYSQL_ROOT_PASSWORD;
if (!rootPw || rootPw.includes('PUT_YOUR_ROOT_PASSWORD')) die('MYSQL_ROOT_PASSWORD is not set in .env.local.');
const { host, port } = hostPort();

let root;
try { root = await mysql.createConnection({ host, port, user: rootUser, password: rootPw }); }
catch (e) { die(`Could not log in to MySQL at ${host}:${port} as ${rootUser} (${e.code}).`); }
const [[{ v: version }]] = await root.query('SELECT VERSION() AS v');
console.log(`Connected to MySQL ${version}.`);

function runFile(file, what) {
  const r = runMysql({ user: rootUser, password: rootPw, input: fs.readFileSync(sqlFile(file)) });
  if (r.status !== 0) die(`${what} failed:\n${(r.stderr || '').trim()}`);
  console.log(`  ok  ${file}  (${what})`);
}

// ---------------------------------------------------------------- 1. database objects
const [exists] = await root.query('SELECT SCHEMA_NAME FROM information_schema.SCHEMATA WHERE SCHEMA_NAME = ?', [DB]);
let fresh = false;
if (exists.length === 0) {
  console.log(`Creating database ${DB}.`);
  runFile('01_schema.sql', 'tables and constraints');
  runFile('02_logic.sql', 'functions, procedures, triggers, views');
  fresh = true;
} else {
  const [t] = await root.query('SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = ?', [DB]);
  const have = new Set(t.map((r) => r.TABLE_NAME));
  if (!OUR_TABLES.every((n) => have.has(n))) die(`A database called ${DB} already exists but is not this project's. Nothing was changed.`);
  console.log(`Database ${DB} already exists with this project's tables: leaving it as it is.`);
}

// ---------------------------------------------------------------- 2. accounts
const ACCOUNTS = [['pp_auth', 'PP_AUTH_PASSWORD'], ['pp_admin', 'PP_ADMIN_PASSWORD'], ['pp_student', 'PP_STUDENT_PASSWORD']];
const newLines = [];
for (const [user, key] of ACCOUNTS) {
  const [[{ c }]] = await root.query("SELECT COUNT(*) AS c FROM mysql.user WHERE User = ? AND Host = 'localhost'", [user]);
  let pw = process.env[key];
  if (c > 0) {
    if (!pw) die(`MySQL account ${user} already exists but ${key} is not in .env.local. It was not modified.`);
    continue;
  }
  if (!pw) { pw = crypto.randomBytes(18).toString('base64url'); process.env[key] = pw; newLines.push(`${key}=${pw}`); }
  await root.query(`CREATE USER '${user}'@'localhost' IDENTIFIED BY ${root.escape(pw)}`);
  console.log(`  account ${user} created`);
}
if (!process.env.AUTH_SECRET) { process.env.AUTH_SECRET = crypto.randomBytes(32).toString('hex'); newLines.push(`AUTH_SECRET=${process.env.AUTH_SECRET}`); }
if (newLines.length) appendEnv(newLines);
runFile('03_roles.sql', 'roles and grants');

// ---------------------------------------------------------------- 3. sample data (only on a fresh database)
function rng(seed) { let a = seed; return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const rand = rng(42);
const pick = (arr) => arr[Math.floor(rand() * arr.length)];
const sample = (arr, n) => { const a = [...arr]; const out = []; while (out.length < n && a.length) out.push(a.splice(Math.floor(rand() * a.length), 1)[0]); return out; };

const SKILLS = [['python','language'],['java','language'],['javascript','language'],['typescript','language'],['react','web'],['nodejs','web'],['sql','database'],['mysql','database'],['mongodb','database'],['postgresql','database'],['html','web'],['css','web'],['c++','language'],['c','language'],['machine learning','data'],['deep learning','data'],['data analysis','data'],['statistics','data'],['excel','tools'],['power bi','tools'],['tableau','tools'],['aws','cloud'],['docker','cloud'],['kubernetes','cloud'],['git','tools'],['linux','tools'],['django','web'],['spring','web'],['rest api','web'],['testing','tools'],['networking','other'],['cybersecurity','other']];
const TRACKS = {
  web: { core: ['javascript','react','html','css','nodejs','rest api','git','typescript'], titles: ['Frontend Developer','Full Stack Developer'] },
  data: { core: ['python','sql','data analysis','statistics','excel','power bi','tableau'], titles: ['Data Analyst','Business Intelligence Analyst'] },
  ml: { core: ['python','machine learning','deep learning','statistics','sql','git'], titles: ['Machine Learning Engineer','AI Research Associate'] },
  backend: { core: ['java','spring','mysql','sql','rest api','git','docker'], titles: ['Backend Developer','Software Engineer'] },
  devops: { core: ['linux','docker','kubernetes','aws','git','python','networking'], titles: ['DevOps Engineer','Cloud Engineer'] },
  security: { core: ['cybersecurity','networking','linux','python','c','testing'], titles: ['Security Analyst','Network Security Engineer'] },
};
const TRACK_NAMES = Object.keys(TRACKS);
const FIRST = ['Aarav','Anaya','Rohan','Diya','Kabir','Meera','Arjun','Isha','Vivaan','Saanvi','Aditya','Riya','Karan','Tara','Neil','Pooja','Dev','Nisha','Yash','Kavya'];
const LAST = ['Sharma','Verma','Iyer','Nair','Reddy','Patil','Kulkarni','Gupta','Mehta','Rao','Shetty','Joshi','Menon','Bose','Desai'];
const BRANCHES = ['Computer Science','Information Science','Electronics','Electrical','Mechanical'];
const COMPANIES = [['Nimbus Systems','Cloud','Bengaluru'],['BlueOrbit Tech','Software','Pune'],['Quanta Labs','AI Research','Hyderabad'],['Helios Software','Software','Chennai'],['Kestrel Analytics','Analytics','Mumbai'],['Vertex Cloud','Cloud','Bengaluru'],['Orchid Digital','Web Services','Kochi'],['Ironwood Security','Security','Delhi'],['Lumen Data','Analytics','Pune'],['Cobalt Networks','Networking','Hyderabad'],['Pioneer Apps','Mobile and Web','Ahmedabad'],['Zenith Infotech','IT Services','Chennai']];

if (fresh) {
  console.log('Loading sample data ...');
  const c = await mysql.createConnection({ host, port, user: rootUser, password: rootPw, database: DB });
  const adminHash = await bcrypt.hash('admin123', 8);
  const studentHash = await bcrypt.hash('student123', 8);
  const [a1] = await c.query("INSERT INTO users (username, password_hash, role) VALUES ('admin', ?, 'admin')", [adminHash]);
  await c.query("INSERT INTO users (username, password_hash, role) VALUES ('admin2', ?, 'admin')", [adminHash]);
  const adminId = a1.insertId;
  await c.query('SET @app_user_id = ?', [adminId]);

  for (const [name, cat] of SKILLS) await c.query('INSERT INTO skills (name, category) VALUES (?, ?)', [name, cat]);
  for (const [name, industry, loc] of COMPANIES) {
    await c.query('INSERT INTO companies (name, industry, location, website, created_by) VALUES (?,?,?,?,?)',
      [name, industry, loc, `https://${name.toLowerCase().replace(/\s+/g, '')}.example`, adminId]);
  }

  // 40 jobs, 6 tracks
  const jobs = [];
  for (let i = 0; i < 40; i++) {
    const track = TRACK_NAMES[i % 6];
    const skills = sample(TRACKS[track].core, 4 + Math.floor(rand() * 2));
    const title = TRACKS[track].titles[i % 2];
    const company = COMPANIES[i % COMPANIES.length][0];
    const description = `${company} is hiring a ${title}. Required skills: ${skills.join(', ')}. You will build and maintain production systems, work with a small team and review code regularly.`;
    const minCgpa = pick([6, 6.5, 7, 7.5, 8]);
    const [r] = await c.query(
      'INSERT INTO jobs (company_id, title, description, min_cgpa, vacancies, package_lpa, deadline, created_by) VALUES (?,?,?,?,?,?,DATE_ADD(CURDATE(), INTERVAL ? DAY),?)',
      [(i % COMPANIES.length) + 1, title, description, minCgpa, 1 + Math.floor(rand() * 4), (4 + rand() * 20).toFixed(2), 20 + Math.floor(rand() * 160), adminId]);
    jobs.push({ id: r.insertId, track, minCgpa });
  }

  // 300 students
  const students = [];
  for (let i = 1; i <= 300; i++) {
    const track = TRACK_NAMES[Math.floor(rand() * 6)];
    const extra = rand() < 0.4 ? [pick(SKILLS)[0]] : [];
    const skills = [...new Set([...sample(TRACKS[track].core, 4 + Math.floor(rand() * 3)), ...extra])];
    const fullName = `${pick(FIRST)} ${pick(LAST)}`;
    const branch = pick(BRANCHES);
    const cgpa = (5.5 + rand() * 4.3).toFixed(2);
    const username = `student${String(i).padStart(3, '0')}`;
    const [u] = await c.query("INSERT INTO users (username, password_hash, role) VALUES (?, ?, 'student')", [username, studentHash]);
    const projects = [
      `Built a ${pick(['campus event portal','expense tracker','chat service','inventory dashboard','library tool'])} using ${skills[0]}`,
      `Developed a ${pick(['recommendation engine','monitoring tool','report generator','booking system'])} with ${skills[skills.length - 1]}`,
    ];
    const resume = `${fullName} is a ${branch} student. Skills: ${skills.join(', ')}. Projects: ${projects.join('; ')}.`;
    const [s] = await c.query(
      'INSERT INTO students (user_id, full_name, email, branch, cgpa, graduation_year, resume_text, created_by) VALUES (?,?,?,?,?,?,?,?)',
      [u.insertId, fullName, `${username}@college.test`, branch, cgpa, 2026 + Math.floor(rand() * 2), resume, adminId]);
    students.push({ id: s.insertId, userId: u.insertId, track, cgpa: Number(cgpa) });
  }

  // about 10 applications per student, preferring jobs of the student's track and only jobs they are eligible for
  let applied = 0;
  await c.query('START TRANSACTION');
  for (const s of students) {
    const same = jobs.filter((j) => j.track === s.track && j.minCgpa <= s.cgpa);
    const other = jobs.filter((j) => j.track !== s.track && j.minCgpa <= s.cgpa);
    const chosen = [...sample(same, 6), ...sample(other, 4)];
    await c.query('SET @app_user_id = ?', [s.userId]);
    for (const j of chosen) {
      await c.query('INSERT INTO applications (student_id, job_id, created_by) VALUES (?,?,?)', [s.id, j.id, s.userId]);
      applied++;
    }
  }
  await c.query('COMMIT');
  await c.query('SET @app_user_id = ?', [adminId]);
  await c.query("UPDATE applications SET status = 'SHORTLISTED' WHERE application_id % 9 = 0");
  await c.query("UPDATE applications SET status = 'INTERVIEW'   WHERE application_id % 9 = 1");
  await c.query("UPDATE applications SET status = 'REJECTED'    WHERE application_id % 9 = 2");

  // place about 25 students through the real stored procedure (a transaction)
  const [cands] = await c.query("SELECT application_id FROM applications WHERE status IN ('INTERVIEW','SHORTLISTED') ORDER BY match_score DESC LIMIT 400");
  let placed = 0;
  for (const { application_id } of cands) {
    if (placed >= 25) break;
    try { await c.query('CALL sp_place_student(?, ?)', [application_id, adminId]); placed++; } catch { /* already placed or no vacancy */ }
  }
  console.log(`  users: ${students.length + 2}, companies: ${COMPANIES.length}, jobs: ${jobs.length}, students: ${students.length}, applications: ${applied}, placements: ${placed}`);
  await c.end();
}

// ---------------------------------------------------------------- 4. MongoDB documents (one resume document per student)
let mc;
try {
  mc = await new MongoClient(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017', { serverSelectionTimeoutMS: 3000 }).connect();
  const col = mc.db(MONGO_DB).collection('resumes');
  await col.createIndex({ student_id: 1 }, { unique: true, name: 'uq_student_id' });
  await col.createIndex({ skills: 1 }, { name: 'ix_skills' });                       // multikey: one entry per skill in the array
  await col.createIndex({ branch: 1, cgpa: -1 }, { name: 'ix_branch_cgpa' });
  await col.createIndex({ resume_text: 'text', full_name: 'text' }, { name: 'tx_resume' });
  await mc.db(MONGO_DB).collection('events').createIndex({ at: -1 }, { name: 'ix_events_time' });
  if ((await col.countDocuments()) === 0) {
    const [rows] = await root.query(`SELECT s.student_id, s.full_name, s.branch, s.cgpa, s.resume_text,
        (SELECT JSON_ARRAYAGG(k.name) FROM ${DB}.student_skills ss JOIN ${DB}.skills k ON k.skill_id = ss.skill_id WHERE ss.student_id = s.student_id) AS skills
      FROM ${DB}.students s ORDER BY s.student_id`);
    const CERTS = [['AWS Cloud Practitioner','AWS'],['Google Data Analytics','Google'],['Oracle Java SE','Oracle'],['Meta Front-End Developer','Meta'],['CompTIA Security+','CompTIA']];
    const docs = rows.map((r) => {
      const skills = r.skills ?? [];
      const text = r.resume_text;
      const projects = (text.split('Projects: ')[1] ?? '').replace(/\.$/, '').split('; ').filter(Boolean).map((t) => ({ title: t, tech: skills.slice(0, 2) }));
      return { student_id: r.student_id, full_name: r.full_name, branch: r.branch, cgpa: Number(r.cgpa), skills, resume_text: text, projects,
        certifications: rand() < 0.5 ? [{ name: CERTS[r.student_id % 5][0], issuer: CERTS[r.student_id % 5][1], year: 2024 + (r.student_id % 3) }] : [], updated_at: new Date() };
    });
    await col.insertMany(docs);
    console.log(`  MongoDB ${MONGO_DB}.resumes: ${docs.length} documents`);
  } else {
    console.log(`  MongoDB ${MONGO_DB}.resumes already holds documents: left as they are`);
  }
} catch (e) {
  console.error(`  MongoDB step skipped (${e.message}). Start the MongoDB service and run npm run setup again.`);
} finally {
  await mc?.close();
}

// ---------------------------------------------------------------- 5. check that each account can log in
for (const [user, key] of ACCOUNTS) {
  try {
    const c = await mysql.createConnection({ host, port, user, password: process.env[key], database: DB });
    const [[r]] = await c.query('SELECT CURRENT_USER() AS u, CURRENT_ROLE() AS r');
    console.log(`  login ok: ${r.u}  active role: ${r.r}`);
    await c.end();
  } catch (e) { die(`Account ${user} could not log in (${e.code}).`); }
}
await root.end();
console.log('\nSetup finished. Start the portal with: npm run dev   (admin / admin123, student001 / student123)');
