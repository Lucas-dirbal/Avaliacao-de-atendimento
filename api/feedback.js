const {
  getFeedbackByAttendant,
  normalizeFeedback,
  readDatabase,
  validateFeedback,
  writeDatabase,
} = require("./_store");

module.exports = async (request, response) => {
  if (request.method === "GET") {
    const database = await readDatabase();
    const attendant = request.query.attendant;
    const feedback = getFeedbackByAttendant(database.feedback, attendant);

    response.status(200).json({ feedback });
    return;
  }

  if (request.method === "POST") {
    const payload = request.body || {};
    const validationError = validateFeedback(payload);

    if (validationError) {
      response.status(400).json({ error: validationError });
      return;
    }

    const database = await readDatabase();
    database.feedback.push(normalizeFeedback(payload));
    await writeDatabase(database);

    response.status(201).json({ success: true });
    return;
  }

  response.status(405).json({ error: "Metodo nao permitido." });
};
