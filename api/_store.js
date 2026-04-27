const fs = require("fs/promises");
const path = require("path");
const { randomUUID } = require("crypto");
const { get: getBlob, put: putBlob } = require("@vercel/blob");

const ATTENDANTS = ["Lucas", "Nicolas", "Leandro", "Pedro", "Willian"];
const DB_PATH = path.join(__dirname, "..", "db.json");
const BLOB_DB_PATH = "feedback/database.json";

const emptyDatabase = () => ({ feedback: [] });

const hasBlobStorage = () => Boolean(process.env.BLOB_READ_WRITE_TOKEN);

const isVercelRuntime = () => Boolean(process.env.VERCEL || process.env.VERCEL_URL);

const ensureWritableStorage = () => {
  if (hasBlobStorage() || !isVercelRuntime()) {
    return;
  }

  const error = new Error(
    "A publicacao na Vercel precisa da variavel BLOB_READ_WRITE_TOKEN para salvar avaliacoes."
  );
  error.statusCode = 500;
  throw error;
};

const ensureDatabase = async () => {
  try {
    await fs.access(DB_PATH);
  } catch (error) {
    await fs.mkdir(path.dirname(DB_PATH), { recursive: true });
    await fs.writeFile(DB_PATH, JSON.stringify(emptyDatabase(), null, 2));
  }
};

const normalizeDatabase = (data) => {
  if (!data || !Array.isArray(data.feedback)) {
    return emptyDatabase();
  }

  return {
    feedback: data.feedback.filter((item) => {
      return item && ATTENDANTS.includes(item.attendant) && Number.isInteger(item.rating);
    }),
  };
};

const streamToText = async (stream) => {
  if (!stream) {
    return "";
  }

  if (typeof stream.getReader === "function") {
    return new Response(stream).text();
  }

  const chunks = [];

  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  return Buffer.concat(chunks).toString("utf8");
};

const readBlobDatabase = async () => {
  ensureWritableStorage();

  const result = await getBlob(BLOB_DB_PATH, { access: "private" });

  if (!result || result.statusCode !== 200) {
    return emptyDatabase();
  }

  try {
    return normalizeDatabase(JSON.parse(await streamToText(result.stream)));
  } catch (error) {
    return emptyDatabase();
  }
};

const writeBlobDatabase = async (database) => {
  ensureWritableStorage();

  await putBlob(BLOB_DB_PATH, JSON.stringify(normalizeDatabase(database), null, 2), {
    access: "private",
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: "application/json; charset=utf-8",
  });
};

const readLocalDatabase = async () => {
  await ensureDatabase();

  try {
    const raw = await fs.readFile(DB_PATH, "utf8");
    return normalizeDatabase(JSON.parse(raw));
  } catch (error) {
    return emptyDatabase();
  }
};

const writeLocalDatabase = async (database) => {
  await fs.writeFile(DB_PATH, JSON.stringify(normalizeDatabase(database), null, 2));
};

const readDatabase = async () => {
  if (hasBlobStorage()) {
    return readBlobDatabase();
  }

  return readLocalDatabase();
};

const writeDatabase = async (database) => {
  if (hasBlobStorage()) {
    await writeBlobDatabase(database);
    return;
  }

  ensureWritableStorage();
  await writeLocalDatabase(database);
};

const getFeedbackByAttendant = (feedback, attendant) => {
  if (!attendant) {
    return feedback;
  }

  return feedback.filter((item) => item.attendant === attendant);
};

const validateFeedback = (payload) => {
  if (!ATTENDANTS.includes(payload.attendant)) {
    return "Atendente invalido.";
  }

  if (!Number.isInteger(payload.rating) || payload.rating < 0 || payload.rating > 5) {
    return "A nota deve estar entre 0 e 5.";
  }

  return "";
};

const normalizeFeedback = (payload) => ({
  id: randomUUID(),
  attendant: payload.attendant,
  rating: payload.rating,
  createdAt: new Date().toISOString(),
});

const buildDashboard = (feedback) => {
  const feedbackCount = feedback.length;
  const ratingTotal = feedback.reduce((sum, item) => sum + item.rating, 0);
  const averageRating = feedbackCount ? ratingTotal / feedbackCount : 0;
  const lastEntryAt = feedbackCount ? feedback[feedbackCount - 1].createdAt : null;

  const attendants = ATTENDANTS.map((name) => {
    const items = feedback.filter((item) => item.attendant === name);
    const count = items.length;
    const total = items.reduce((sum, item) => sum + item.rating, 0);

    return {
      name,
      feedbackCount: count,
      averageRating: count ? total / count : 0,
    };
  });

  return {
    totals: {
      feedbackCount,
      averageRating,
      lastEntryAt,
    },
    attendants,
    recentFeedback: feedback.slice().reverse().slice(0, 10),
  };
};

module.exports = {
  buildDashboard,
  getFeedbackByAttendant,
  normalizeFeedback,
  readDatabase,
  validateFeedback,
  writeDatabase,
};
