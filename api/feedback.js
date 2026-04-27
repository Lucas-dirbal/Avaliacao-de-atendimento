const {
  getFeedbackByAttendant,
  normalizeFeedback,
  readDatabase,
  validateFeedback,
  writeDatabase,
} = require("./_store");

const sendJson = (response, statusCode, payload) => {
  if (typeof response.status === "function") {
    response.status(statusCode).json(payload);
    return;
  }

  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
  });
  response.end(JSON.stringify(payload));
};

const parseBody = async (request) => {
  if (request.body && typeof request.body === "object") {
    return request.body;
  }

  if (typeof request.body === "string") {
    return JSON.parse(request.body);
  }

  const chunks = [];

  for await (const chunk of request) {
    chunks.push(chunk);
  }

  if (!chunks.length) {
    return {};
  }

  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
};

module.exports = async (request, response) => {
  try {
    if (request.method === "GET") {
      const database = await readDatabase();
      const attendant = request.query && request.query.attendant;
      const feedback = getFeedbackByAttendant(database.feedback, attendant);

      sendJson(response, 200, { feedback });
      return;
    }

    if (request.method === "POST") {
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

    sendJson(response, 405, { error: "Metodo nao permitido." });
  } catch (error) {
    console.error("Feedback API error:", error);
    sendJson(response, 500, { error: "Erro interno do servidor." });
  }
};
