const fs = require("fs/promises");
const path = require("path");
const { randomUUID } = require("crypto");

const ATTENDANTS = ["Lucas", "Nicolas", "Leandro", "Pedro", "Willian"];
const SEED_DB_PATH = path.join(__dirname, "..", "db.json");
const RUNTIME_DB_PATH = path.join("/tmp", "avaliacao-feedback-db.json");

const emptyDatabase = () => ({ feedback: [] });

const getDatabasePath = () =>
  process.env.VERCEL ? RUNTIME_DB_PATH : path.join(__dirname, "..", "db.json");

const ensureDatabase = async () => {
  const databasePath = getDatabasePath();

  try {
    await fs.access(databasePath);
  } catch (error) {
    await fs.mkdir(path.dirname(databasePath), { recursive: true });

    try {
      await fs.copyFile(SEED_DB_PATH, databasePath);
    } catch (copyError) {
      await fs.writeFile(databasePath, JSON.stringify(emptyDatabase(), null, 2));
    }
  }
};

const readDatabase = async () => {
  await ensureDatabase();

  try {
    const raw = await fs.readFile(getDatabasePath(), "utf8");
    const data = JSON.parse(raw);

    if (!Array.isArray(data.feedback)) {
      return emptyDatabase();
    }

    return data;
  } catch (error) {
    return emptyDatabase();
  }
};

const writeDatabase = async (database) => {
  await fs.writeFile(getDatabasePath(), JSON.stringify(database, null, 2));
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
