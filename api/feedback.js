const {
  getFeedbackByAttendant,
  getFeedbackLink,
  normalizeFeedback,
  readDatabase,
  saveFeedback,
  saveUsedFeedbackLink,
  validateFeedback,
  validateFeedbackLink,
} = require("./_store");

const sendJson = (response, statusCode, payload) => {
  if (typeof response.status === "function") {
    response.setHeader("Cache-Control", "no-store, max-age=0");
    response.status(statusCode).json(payload);
    return;
  }

  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store, max-age=0",
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

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const readDatabaseWithFreshLink = async (token) => {
  let link = await getFeedbackLink(token);

  if (!token || link) {
    return link;
  }

  for (let attempt = 0; attempt < 6; attempt += 1) {
    await wait(500);
    link = await getFeedbackLink(token);

    if (link) {
      return link;
    }
  }

  return link;
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

      const link = await readDatabaseWithFreshLink(String(payload.token || "").trim());
      const linkValidation = validateFeedbackLink(link, payload);

      if (linkValidation.error) {
        sendJson(response, 409, { error: linkValidation.error });
        return;
      }

      const feedback = normalizeFeedback(payload, linkValidation.link);
      await saveFeedback(feedback);
      await saveUsedFeedbackLink(linkValidation.link, feedback.id);

      sendJson(response, 201, { success: true });
      return;
    }

    sendJson(response, 405, { error: "Metodo nao permitido." });
  } catch (error) {
    console.error("Feedback API error:", error);
    sendJson(response, 500, { error: "Erro interno do servidor." });
  }
};
