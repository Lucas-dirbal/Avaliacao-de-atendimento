const totalNode = document.querySelector("#dashboard-total");
const averageNode = document.querySelector("#dashboard-average");
const lastUpdateNode = document.querySelector("#dashboard-last-update");
const tableBody = document.querySelector("#attendant-table-body");
const historyNode = document.querySelector("#dashboard-history");
const refreshButton = document.querySelector("#refresh-button");

const dateFormatter = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "short",
  timeStyle: "short",
});

const request = async (url) => {
  const response = await fetch(url);
  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || "Nao foi possivel carregar o dashboard.");
  }

  return data;
};

const escapeHtml = (value) =>
  String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

const formatStars = (rating) => "\u2605".repeat(rating) + "\u2606".repeat(5 - rating);

const renderTotals = (totals) => {
  totalNode.textContent = String(totals.feedbackCount);
  averageNode.textContent = Number(totals.averageRating).toFixed(1);
  lastUpdateNode.textContent = totals.lastEntryAt
    ? dateFormatter.format(new Date(totals.lastEntryAt))
    : "-";
};

const renderTable = (attendants) => {
  tableBody.innerHTML = attendants
    .map((item) => {
      return `
        <tr>
          <td><strong>${escapeHtml(item.name)}</strong></td>
          <td>${item.feedbackCount}</td>
          <td>${item.averageRating.toFixed(1)}</td>
        </tr>
      `;
    })
    .join("");
};

const renderHistory = (recentFeedback) => {
  if (!recentFeedback.length) {
    historyNode.innerHTML = `
      <article class="empty-state">
        <h3>Sem avaliacoes</h3>
        <p>Nenhum dado foi enviado ainda.</p>
      </article>
    `;
    return;
  }

  historyNode.innerHTML = recentFeedback
    .map((item) => {
      return `
        <article class="recent-item">
          <div class="recent-item-head">
            <strong>${escapeHtml(item.attendant)}</strong>
            <span class="badge badge-stars">${formatStars(item.rating)}</span>
            <span class="badge">${escapeHtml(dateFormatter.format(new Date(item.createdAt)))}</span>
          </div>
        </article>
      `;
    })
    .join("");
};

const loadDashboard = async () => {
  refreshButton.disabled = true;
  refreshButton.textContent = "Atualizando...";

  try {
    const data = await request("/api/dashboard");
    renderTotals(data.totals);
    renderTable(data.attendants);
    renderHistory(data.recentFeedback);
  } catch (error) {
    historyNode.innerHTML = `
      <article class="empty-state">
        <h3>Erro ao carregar</h3>
        <p>${escapeHtml(error.message)}</p>
      </article>
    `;
  } finally {
    refreshButton.disabled = false;
    refreshButton.textContent = "Atualizar dados";
  }
};

refreshButton.addEventListener("click", loadDashboard);
loadDashboard();
