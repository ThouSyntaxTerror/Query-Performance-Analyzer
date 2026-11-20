// NoSQL side: resumes (flexible nested documents) and an event log live in MongoDB, database placement_portal_docs.
import { MongoClient } from 'mongodb';

const g = globalThis;
export const MONGO_DB = () => process.env.MONGODB_DB || 'placement_portal_docs';

async function database() {
  if (!g.__ppMongo) {
    g.__ppMongo = new MongoClient(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017', { serverSelectionTimeoutMS: 2500 })
      .connect().catch((e) => { g.__ppMongo = null; throw e; });
  }
  return (await g.__ppMongo).db(MONGO_DB());
}

export async function getResume(studentId) {
  return (await database()).collection('resumes').findOne({ student_id: studentId }, { projection: { _id: 0 } });
}

export async function saveResume(studentId, fields) {
  await (await database()).collection('resumes').updateOne({ student_id: studentId }, { $set: { ...fields, updated_at: new Date() } }, { upsert: true });
}

export async function logEvent(event) {
  try { await (await database()).collection('events').insertOne({ ...event, at: new Date() }); } catch { /* the log must never break a request */ }
}

// NoSQL aggregation: the most common skills across all resumes
export async function topSkills(limit = 8) {
  return (await database()).collection('resumes').aggregate([
    { $unwind: '$skills' },
    { $group: { _id: '$skills', students: { $sum: 1 }, avg_cgpa: { $avg: '$cgpa' } } },
    { $sort: { students: -1 } }, { $limit: limit },
    { $project: { _id: 0, skill: '$_id', students: 1, avg_cgpa: { $round: ['$avg_cgpa', 2] } } },
  ]).toArray();
}

export async function searchResumes(text, limit = 10) {
  return (await database()).collection('resumes')
    .find({ $text: { $search: text } }, { projection: { _id: 0, student_id: 1, full_name: 1, branch: 1, cgpa: 1, skills: 1 } }).limit(limit).toArray();
}

export async function recentEvents(limit = 10) {
  return (await database()).collection('events').find({}, { projection: { _id: 0 } }).sort({ at: -1 }).limit(limit).toArray();
}

export async function resumeCount() {
  return (await database()).collection('resumes').countDocuments();
}
