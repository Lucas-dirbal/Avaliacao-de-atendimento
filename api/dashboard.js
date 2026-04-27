const { buildDashboard, readDatabase } = require("./_store");

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

module.exports = async (request, response) => {
  try {
    if (request.method !== "GET") {
      sendJson(response, 405, { error: "Metodo nao permitido." });
      return;
    }

    const database = await readDatabase();
    sendJson(response, 200, buildDashboard(database.feedback));
  } catch (error) {
    console.error("Dashboard API error:", error);
    sendJson(response, 500, { error: "Erro interno do servidor." });
  }
};
