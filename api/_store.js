const fs = require("fs/promises");
const path = require("path");
const { randomUUID } = require("crypto");
const { get: getBlob, list: listBlobs, put: putBlob } = require("@vercel/blob");

const ATTENDANTS = ["Lucas", "Nicolas", "Leandro", "Pedro", "Willian"];
const DB_PATH = path.join(__dirname, "..", "db.json");
const FEEDBACK_PREFIX = "feedback/items/";
const FEEDBACK_LINK_PREFIX = "feedback/links/";

const emptyDatabase = () => ({ feedback: [], feedbackLinks: {} });

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
  return {
    feedback: Array.isArray(data?.feedback)
      ? data.feedback.filter((item) => {
          return item && ATTENDANTS.includes(item.attendant) && Number.isInteger(item.rating);
        })
      : [],
    feedbackLinks: data?.feedbackLinks && typeof data.feedbackLinks === "object"
      ? Object.fromEntries(
          Object.entries(data.feedbackLinks)
            .filter(([token, item]) => {
              return token && item && ATTENDANTS.includes(item.attendant);
            })
            .map(([token, item]) => [
              token,
              {
                token,
                attendant: item.attendant,
                conversationId: String(item.conversationId || ""),
                conversationTitle: String(item.conversationTitle || ""),
                createdAt: String(item.createdAt || new Date().toISOString()),
                usedAt: item.usedAt ? String(item.usedAt) : "",
                feedbackId: item.feedbackId ? String(item.feedbackId) : "",
              },
            ])
        )
      : {},
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

const getBlobJson = async (pathname) => {
  ensureWritableStorage();

  const result = await getBlob(pathname, { access: "private" });

  if (!result || result.statusCode !== 200) {
    return null;
  }

  try {
    return JSON.parse(await streamToText(result.stream));
  } catch (error) {
    return null;
  }
};

const putBlobJson = async (pathname, payload) => {
  ensureWritableStorage();

  await putBlob(pathname, JSON.stringify(payload, null, 2), {
    access: "private",
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: "application/json; charset=utf-8",
  });
};

const feedbackBlobPath = (id) => `${FEEDBACK_PREFIX}${encodeURIComponent(id)}.json`;

const feedbackLinkBlobPath = (token) => `${FEEDBACK_LINK_PREFIX}${encodeURIComponent(token)}.json`;

const readBlobDatabase = async () => {
  ensureWritableStorage();

  const result = await listBlobs({ prefix: FEEDBACK_PREFIX });
  const items = result?.blobs?.length
    ? await Promise.all(result.blobs.map((blob) => getBlobJson(blob.pathname)))
    : [];

  return normalizeDatabase({
    feedback: items.filter(Boolean),
    feedbackLinks: {},
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
    const normalized = normalizeDatabase(database);
    await Promise.all(
      normalized.feedback.map((feedback) => putBlobJson(feedbackBlobPath(feedback.id), feedback))
    );
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

  if (!String(payload.token || "").trim()) {
    return "Link de avaliacao invalido. Solicite um novo link ao atendente.";
  }

  if (!Number.isInteger(payload.rating) || payload.rating < 0 || payload.rating > 5) {
    return "A nota deve estar entre 0 e 5.";
  }

  return "";
};

const createFeedbackLink = (payload) => {
  const attendant = String(payload.attendant || "").trim();

  if (!ATTENDANTS.includes(attendant)) {
    return null;
  }

  const token = randomUUID();

  return {
    token,
    attendant,
    conversationId: String(payload.conversationId || ""),
    conversationTitle: String(payload.conversationTitle || ""),
    createdAt: new Date().toISOString(),
    usedAt: "",
    feedbackId: "",
  };
};

const saveFeedbackLink = async (link) => {
  if (hasBlobStorage()) {
    await putBlobJson(feedbackLinkBlobPath(link.token), link);
    return link;
  }

  const database = await readLocalDatabase();
  database.feedbackLinks[link.token] = link;
  await writeLocalDatabase(database);
  return link;
};

const getFeedbackLink = async (token) => {
  const normalizedToken = String(token || "").trim();
  if (!normalizedToken) return null;

  if (hasBlobStorage()) {
    const link = await getBlobJson(feedbackLinkBlobPath(normalizedToken));
    return normalizeDatabase({ feedback: [], feedbackLinks: { [normalizedToken]: link } })
      .feedbackLinks[normalizedToken] || null;
  }

  const database = await readLocalDatabase();
  return database.feedbackLinks[normalizedToken] || null;
};

const saveFeedback = async (feedback) => {
  if (hasBlobStorage()) {
    await putBlobJson(feedbackBlobPath(feedback.id), feedback);
    return feedback;
  }

  const database = await readLocalDatabase();
  database.feedback.push(feedback);
  await writeLocalDatabase(database);
  return feedback;
};

const normalizeFeedback = (payload, link) => ({
  id: payload.id || randomUUID(),
  attendant: payload.attendant,
  rating: payload.rating,
  token: String(payload.token || ""),
  conversationId: String(link?.conversationId || payload.conversationId || ""),
  conversationTitle: String(link?.conversationTitle || payload.conversationTitle || ""),
  createdAt: new Date().toISOString(),
});

const validateFeedbackLink = (link, payload) => {
  if (!link) {
    return { error: "Link de avaliacao invalido ou expirado." };
  }

  if (link.usedAt) {
    return { error: "Este link de avaliacao ja foi usado." };
  }

  if (link.attendant !== payload.attendant) {
    return { error: "Este link pertence a outro atendente." };
  }

  return { link };
};

const markFeedbackLinkUsed = (database, token, feedbackId) => {
  database.feedbackLinks[token] = {
    ...database.feedbackLinks[token],
    usedAt: new Date().toISOString(),
    feedbackId,
  };
};

const saveUsedFeedbackLink = async (link, feedbackId) => {
  const usedLink = {
    ...link,
    usedAt: new Date().toISOString(),
    feedbackId,
  };

  if (hasBlobStorage()) {
    await putBlobJson(feedbackLinkBlobPath(link.token), usedLink);
    return usedLink;
  }

  const database = await readLocalDatabase();
  database.feedbackLinks[link.token] = usedLink;
  await writeLocalDatabase(database);
  return usedLink;
};

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
  createFeedbackLink,
  getFeedbackLink,
  getFeedbackByAttendant,
  markFeedbackLinkUsed,
  normalizeFeedback,
  readDatabase,
  saveFeedback,
  saveFeedbackLink,
  saveUsedFeedbackLink,
  validateFeedback,
  validateFeedbackLink,
  writeDatabase,
};
