(() => {
  const face = document.getElementById("face-mode");
  const facePrompt = document.getElementById("face-prompt");
  const mainPrompt = document.getElementById("prompt");
  const composer = document.getElementById("composer");
  const faceStatus = document.getElementById("face-status");
  const faceState = document.getElementById("face-state");
  const faceMoodState = document.getElementById("face-mood-state");
  const orb = document.getElementById("face-orb");
  const statusText = document.getElementById("status-text");
  const moodButton = document.getElementById("mood-button");
  const moodPopover = document.getElementById("mood-popover");
  const moodLabel = document.getElementById("mood-label");
  const moodSwatch = document.getElementById("mood-swatch");

  const moods = {
    calm: { label: "Calm", state: "Calm · composed" },
    focused: { label: "Focused", state: "Focused · precise" },
    alert: { label: "Alert", state: "Alert · vigilant" },
    angry: { label: "Angry", state: "Angry · intense" }
  };

  if (!face || !moodButton) return;

  const validMood = value => (Object.prototype.hasOwnProperty.call(moods, value) ? value : "calm");

  const closeMoodPopover = () => {
    moodPopover?.classList.remove("visible");
    moodPopover?.setAttribute("aria-hidden", "true");
    moodButton.setAttribute("aria-expanded", "false");
  };

  const syncMood = () => {
    const mood = validMood(localStorage.getItem("friday_mood") || "calm");
    const info = moods[mood];

    document.body.dataset.mood = mood;
    face.dataset.mood = mood;

    if (moodLabel) moodLabel.textContent = info.label;
    if (moodSwatch) moodSwatch.dataset.mood = mood;
    if (faceMoodState) faceMoodState.textContent = info.state;

    document.querySelectorAll("[data-mood]").forEach(button => {
      button.classList.toggle("active", button.dataset.mood === mood);
      if (button.classList.contains("mood-option")) {
        button.setAttribute("aria-current", button.dataset.mood === mood ? "true" : "false");
      }
    });
  };

  const setMood = (nextMood, persist = true) => {
    const mood = validMood(nextMood);
    if (persist) localStorage.setItem("friday_mood", mood);
    syncMood();
    syncStatus();
  };

  const syncStatus = () => {
    const value = (statusText?.textContent || "Friday online").trim();
    const busy = /working|thinking|running|processing/i.test(value);
    const error = /error|failed|offline|unavailable|required/i.test(value);
    orb?.classList.toggle("is-working", busy);
    orb?.classList.toggle("is-error", error);
    if (faceStatus) faceStatus.textContent = value;
    if (faceState) {
      faceState.textContent = busy
        ? "Working on your request…"
        : error
          ? "Waiting for your attention"
          : moods[validMood(localStorage.getItem("friday_mood") || "calm")].state;
    }
  };

  const showFace = () => {
    closeMoodPopover();
    face.classList.add("visible");
    face.setAttribute("aria-hidden", "false");
    document.body.classList.add("face-open");
    syncMood();
    syncStatus();
    facePrompt?.focus();
  };

  const hideFace = () => {
    face.classList.remove("visible");
    face.setAttribute("aria-hidden", "true");
    document.body.classList.remove("face-open");
  };

  moodButton.addEventListener("click", event => {
    event.stopPropagation();
    const visible = moodPopover?.classList.toggle("visible");
    moodPopover?.setAttribute("aria-hidden", visible ? "false" : "true");
    moodButton.setAttribute("aria-expanded", visible ? "true" : "false");
  });

  moodPopover?.addEventListener("click", event => {
    const option = event.target.closest("[data-mood]");
    if (!option) return;
    setMood(option.dataset.mood);
    closeMoodPopover();
  });

  document.querySelectorAll("#face-mood-picker [data-mood]").forEach(option => {
    option.addEventListener("click", () => setMood(option.dataset.mood));
  });

  face.addEventListener("click", event => {
    if (event.target === face) hideFace();
  });

  facePrompt?.addEventListener("input", () => {
    if (mainPrompt) {
      mainPrompt.value = facePrompt.value;
      mainPrompt.dispatchEvent(new Event("input", { bubbles: true }));
    }
  });

  facePrompt?.addEventListener("keydown", event => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      if (mainPrompt && composer && facePrompt.value.trim()) {
        mainPrompt.value = facePrompt.value;
        mainPrompt.dispatchEvent(new Event("input", { bubbles: true }));
        composer.requestSubmit();
        facePrompt.value = "";
      }
    }
  });

  document.addEventListener("click", event => {
    if (event.target.closest('[data-action="face"]')) {
      showFace();
      return;
    }
    if (event.target.closest('[data-action="close-face"]')) {
      hideFace();
      return;
    }
    if (!event.target.closest("#mood-popover") && !event.target.closest("#mood-button")) {
      closeMoodPopover();
    }
    if (event.target.closest('[data-action="voice"]')) {
      face.classList.add("voice-pulse");
      setTimeout(() => face.classList.remove("voice-pulse"), 900);
    }
  });

  if (statusText) {
    new MutationObserver(syncStatus).observe(statusText, {
      childList: true,
      characterData: true,
      subtree: true
    });
  }

  document.addEventListener("keydown", event => {
    if (event.key === "Escape") {
      closeMoodPopover();
      if (face.classList.contains("visible")) hideFace();
    }
  });

  syncMood();
  syncStatus();
})();
