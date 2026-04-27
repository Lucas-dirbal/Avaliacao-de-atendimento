const http = require("http");
const fs = require("fs/promises");
const path = require("path");
const { randomUUID } = require("crypto");

const HOST = "127.0.0.1";
const PORT = Number(process.env.PORT || 3000);
const ROOT_DIR = __dirname;
const DB_PATH = path.join(ROOT_DIR, "db.json");
const ATTENDANTS = ["Lucas", "Nicolas", "Leandro", "Pedro", "Willian"];
const STATIC_EXTENSIONS = new Set([".html", ".css", ".js"]);

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
};

const emptyDatabase = () => ({ feedback: [] });

const sendJson = (response, statusCode, payload) => {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
  });
  response.end(JSON.stringify(payload));
};

const sendText = (response, statusCode, message) => {
  response.writeHead(statusCode, {
    "Content-Type": "text/plain; charset=utf-8",
  });
  response.end(message);
};

const ensureDatabase = async () => {
  try {
    await fs.access(DB_PATH);
  } catch (error) {
    await fs.writeFile(DB_PATH, JSON.stringify(emptyDatabase(), null, 2));
  }
};

const readDatabase = async () => {
  await ensureDatabase();

  try {
    const raw = await fs.readFile(DB_PATH, "utf8");
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
  await fs.writeFile(DB_PATH, JSON.stringify(database, null, 2));
};

const parseBody = async (request) => {
  const chunks = [];

  for await (const chunk of request) {
    chunks.push(chunk);
  }

  if (!chunks.length) {
    return {};
  }

  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
};

const getFeedbackByAttendant = (feedback, attendant) => {
  if (!attendant) {
    return feedback;
  }

  return feedback.filter((item) => item.attendant === attendant);
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

const serveStaticFile = async (response, pathname) => {
  const requestedFile = pathname === "/" ? "index.html" : pathname.slice(1);
  const filePath = path.resolve(ROOT_DIR, requestedFile);
  const extension = path.extname(filePath).toLowerCase();

  if (!filePath.startsWith(ROOT_DIR) || !STATIC_EXTENSIONS.has(extension)) {
    sendText(response, 404, "Arquivo nao encontrado.");
    return;
  }

  try {
    const content = await fs.readFile(filePath);
    response.writeHead(200, {
      "Content-Type": MIME_TYPES[extension] || "application/octet-stream",
    });
    response.end(content);
  } catch (error) {
    sendText(response, 404, "Arquivo nao encontrado.");
  }
};

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url, `http://${request.headers.host}`);

  try {
    if (request.method === "GET" && url.pathname === "/api/feedback") {
      const database = await readDatabase();
      const attendant = url.searchParams.get("attendant");
      const feedback = getFeedbackByAttendant(database.feedback, attendant);
      sendJson(response, 200, { feedback });
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/feedback") {
      const payload = await parseBody(request);
      const validationError = validateFeedback(payload);

      if (validationError) {
        sendJson(response, 400, { error: validationError });
        return;
      }

      const database = await readDatabase();
      database.feedback.push(normalizeFeedback(payload));
      await writeDatabase(database);
      sendJson(response, 201, { success: true });
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/dashboard") {
      const database = await readDatabase();
      sendJson(response, 200, buildDashboard(database.feedback));
      return;
    }

    if (request.method === "GET") {
      await serveStaticFile(response, url.pathname);
      return;
    }

    sendText(response, 405, "Metodo nao permitido.");
  } catch (error) {
    sendJson(response, 500, { error: "Erro interno do servidor." });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Servidor ativo em http://${HOST}:${PORT}`);
});
