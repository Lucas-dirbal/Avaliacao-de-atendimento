const attendant = document.body.dataset.attendant;
const form = document.querySelector("#feedback-form");
const statusNode = document.querySelector("#form-status");
const ratingValueNode = document.querySelector("#rating-value");
const clearRatingButton = document.querySelector("[data-clear-rating]");

const request = async (url, options = {}) => {
  const response = await fetch(url, {
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
    ...options,
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || "Nao foi possivel concluir a operacao.");
  }

  return data;
};

const setStatus = (message, type = "") => {
  statusNode.textContent = message;
  statusNode.className = "status";

  if (type) {
    statusNode.classList.add(`is-${type}`);
  }
};

const getNumericValue = (value) => {
  if (value === "" || value === null || value === undefined) {
    return Number.NaN;
  }

  return Number(value);
};

const updateRatingValue = (value) => {
  if (!ratingValueNode) {
    return;
  }

  if (!Number.isInteger(value) || value < 0 || value > 5) {
    ratingValueNode.textContent = "Nenhuma nota selecionada.";
    return;
  }

  const label = value === 1 ? "estrela" : "estrelas";
  ratingValueNode.textContent = `Nota selecionada: ${value} ${label}.`;
};

const setSelectedValue = (group, value) => {
  const hiddenInput = form.elements[group.dataset.choiceGroup];
  hiddenInput.value = value;

  const numericValue = getNumericValue(value);

  [...group.querySelectorAll("button")].forEach((button) => {
    const buttonValue = Number(button.dataset.value);
    const isFilled =
      Number.isInteger(numericValue) && numericValue > 0 && buttonValue <= numericValue;
    const isCurrent = button.dataset.value === value;

    button.classList.toggle("is-selected", isFilled);
    button.classList.toggle("is-current", isCurrent);
    button.setAttribute("aria-pressed", String(isCurrent));
  });

  if (clearRatingButton) {
    const isZeroSelected = numericValue === 0;
    clearRatingButton.classList.toggle("is-selected", isZeroSelected);
    clearRatingButton.setAttribute("aria-pressed", String(isZeroSelected));
  }

  updateRatingValue(Number.isInteger(numericValue) ? numericValue : null);
};

const setupButtonGroups = () => {
  document.querySelectorAll("[data-choice-group]").forEach((group) => {
    [...group.querySelectorAll("button")].forEach((button) => {
      button.addEventListener("click", () => {
        setSelectedValue(group, button.dataset.value);
      });
    });
  });
};

const setupClearRating = () => {
  if (!clearRatingButton) {
    return;
  }

  clearRatingButton.addEventListener("click", () => {
    const ratingGroup = document.querySelector('[data-choice-group="rating"]');

    if (ratingGroup) {
      setSelectedValue(ratingGroup, "0");
    }
  });
};

const resetGroups = () => {
  document.querySelectorAll("[data-choice-group]").forEach((group) => {
    const hiddenInput = form.elements[group.dataset.choiceGroup];
    hiddenInput.value = "";

    [...group.querySelectorAll("button")].forEach((button) => {
      button.classList.remove("is-selected");
      button.classList.remove("is-current");
      button.setAttribute("aria-pressed", "false");
    });
  });

  if (clearRatingButton) {
    clearRatingButton.classList.remove("is-selected");
    clearRatingButton.setAttribute("aria-pressed", "false");
  }

  updateRatingValue(null);
};

const validatePayload = (payload) => {
  if (!Number.isInteger(payload.rating) || payload.rating < 0 || payload.rating > 5) {
    return "Selecione uma nota de 0 a 5 estrelas.";
  }

  return "";
};

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  const formData = new FormData(form);
  const payload = {
    attendant,
    rating: getNumericValue(formData.get("rating")),
  };

  const validationMessage = validatePayload(payload);

  if (validationMessage) {
    setStatus(validationMessage, "error");
    return;
  }

  try {
    await request("/api/feedback", {
      method: "POST",
      body: JSON.stringify(payload),
    });

    form.reset();
    resetGroups();
    setStatus("Obrigado. Sua avaliacao foi enviada com sucesso.", "success");
  } catch (error) {
    setStatus(error.message, "error");
  }
});

setupButtonGroups();
setupClearRating();
resetGroups();
