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
  const chunks = [];

  for await (const chunk of request) {
    chunks.push(chunk);
  }

  if (chunks.length) {
    const rawBody = Buffer.concat(chunks).toString("utf8").replace(/^\uFEFF/, "");
    return rawBody ? JSON.parse(rawBody) : {};
  }

  if (Object.prototype.hasOwnProperty.call(request, "body")) {
    if (request.body && typeof request.body === "object") {
      return request.body;
    }

    if (typeof request.body === "string") {
      return JSON.parse(request.body.replace(/^\uFEFF/, ""));
    }
  }

  return {};
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
      let payload;

      try {
        payload = await parseBody(request);
      } catch (error) {
        sendJson(response, 400, { error: "JSON invalido." });
        return;
      }

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
