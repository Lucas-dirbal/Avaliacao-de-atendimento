const {
  createFeedbackLink,
  saveFeedbackLink,
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

  if (request.body && typeof request.body === "object") {
    return request.body;
  }

  if (typeof request.body === "string") {
    return JSON.parse(request.body.replace(/^\uFEFF/, ""));
  }

  return {};
};

const slugify = (value) =>
  String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

const getBaseUrl = (request) => {
  const proto = request.headers["x-forwarded-proto"] || "https";
  const host = request.headers["x-forwarded-host"] || request.headers.host;
  return `${proto}://${host}`;
};

module.exports = async (request, response) => {
  try {
    if (request.method !== "POST") {
      sendJson(response, 405, { error: "Metodo nao permitido." });
      return;
    }

    let payload;

    try {
      payload = await parseBody(request);
    } catch (error) {
      sendJson(response, 400, { error: "JSON invalido." });
      return;
    }

    const link = createFeedbackLink(payload);

    if (!link) {
      sendJson(response, 400, { error: "Atendente invalido." });
      return;
    }

    await saveFeedbackLink(link);

    const attendantSlug = slugify(link.attendant);
    const url = new URL(`${attendantSlug}.html`, `${getBaseUrl(request)}/`);
    url.searchParams.set("token", link.token);

    sendJson(response, 201, {
      token: link.token,
      url: url.toString(),
    });
  } catch (error) {
    console.error("Feedback link API error:", error);
    sendJson(response, 500, { error: "Erro interno do servidor." });
  }
};
