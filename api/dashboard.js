const { buildDashboard, readDatabase } = require("./_store");

module.exports = async (request, response) => {
  if (request.method !== "GET") {
    response.status(405).json({ error: "Metodo nao permitido." });
    return;
  }

  const database = await readDatabase();
  response.status(200).json(buildDashboard(database.feedback));
};
