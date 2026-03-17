(function () {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

  function dispatchFieldEvents(field) {
    field.dispatchEvent(new Event("input", { bubbles: true }));
    field.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function appendTranscript(field, transcript) {
    const cleanTranscript = String(transcript || "").trim();
    if (!cleanTranscript) return;

    const currentValue = String(field.value || "").trim();
    const spacer = currentValue && !currentValue.endsWith(" ") ? " " : "";
    field.value = `${currentValue}${spacer}${cleanTranscript}`.trim();
    dispatchFieldEvents(field);
  }

  function createRecognition(field, button, options) {
    const recognition = new SpeechRecognition();
    recognition.lang = options.lang || document.documentElement.lang || "fr-FR";
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    let finalTranscript = "";

    recognition.onstart = function () {
      button.classList.add("is-listening");
      button.setAttribute("aria-pressed", "true");
      button.title = "Ecoute en cours";
    };

    recognition.onresult = function (event) {
      finalTranscript = "";
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        finalTranscript += event.results[i][0].transcript;
      }
    };

    recognition.onerror = function (event) {
      console.warn("Reconnaissance vocale indisponible :", event.error);
    };

    recognition.onend = function () {
      button.classList.remove("is-listening");
      button.setAttribute("aria-pressed", "false");
      button.title = "Dicter";
      appendTranscript(field, finalTranscript);
      field.focus();
    };

    return recognition;
  }

  function attach(selector, options) {
    const field = document.querySelector(selector);
    if (!field || field.dataset.voiceEnhanced === "true") return;

    field.dataset.voiceEnhanced = "true";

    if (!SpeechRecognition) return;

    const wrapper = document.createElement("div");
    wrapper.className = "voice-input-wrapper";
    field.parentNode.insertBefore(wrapper, field);
    wrapper.appendChild(field);

    const button = document.createElement("button");
    button.type = "button";
    button.className = "voice-input-btn";
    button.textContent = "Mic";
    button.title = "Dicter";
    button.setAttribute("aria-label", options.ariaLabel || "Demarrer la dictee");
    button.setAttribute("aria-pressed", "false");
    wrapper.appendChild(button);

    const recognition = createRecognition(field, button, options || {});

    button.addEventListener("click", function () {
      try {
        recognition.start();
      } catch (error) {
        console.warn("Impossible de demarrer la reconnaissance vocale :", error);
      }
    });
  }

  window.VoiceInputEnhancer = {
    attach
  };
})();
