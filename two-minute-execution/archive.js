const menuToggle = document.querySelector(".menu-toggle");
const mobileMenu = document.querySelector("#mobile-menu");

if (menuToggle && mobileMenu) {
  const closeMenu = () => {
    menuToggle.setAttribute("aria-expanded", "false");
    mobileMenu.classList.remove("is-open");
    mobileMenu.hidden = true;
  };

  menuToggle.addEventListener("click", () => {
    const isOpen = menuToggle.getAttribute("aria-expanded") === "true";
    menuToggle.setAttribute("aria-expanded", String(!isOpen));
    mobileMenu.hidden = isOpen;
    mobileMenu.classList.toggle("is-open", !isOpen);
  });

  mobileMenu.querySelectorAll("a").forEach((link) => link.addEventListener("click", closeMenu));
  window.addEventListener("resize", () => {
    if (window.matchMedia("(min-width: 1101px)").matches) closeMenu();
  });
}

const searchInput = document.querySelector("#message-search");
const categoryFilter = document.querySelector("#category-filter");
const clearButton = document.querySelector("#clear-filters");
const archiveList = document.querySelector("#archive-list");
const archiveEmpty = document.querySelector("#archive-empty");
const resultsStatus = document.querySelector("#results-status");
const loadMoreButton = document.querySelector("#load-more");
const featuredList = document.querySelector("#featured-messages");
const featuredEmpty = document.querySelector("#featured-empty");

const pageSize = 9;
let messages = [];
let visibleCount = pageSize;

const escapeHtml = (value) => String(value)
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&#039;");

const formatDate = (value) => new Intl.DateTimeFormat("en-US", {
  month: "long",
  day: "numeric",
  year: "numeric"
}).format(new Date(`${value}T12:00:00`));

const messageCard = (message) => `
  <article class="message-card">
    <div class="message-meta">
      ${message.preview ? "<span>Draft preview</span>" : ""}
      <span>${escapeHtml(message.category)}</span>
      <time datetime="${escapeHtml(message.publishDate)}">${escapeHtml(formatDate(message.publishDate))}</time>
    </div>
    <h3>${escapeHtml(message.title)}</h3>
    <p>${escapeHtml(message.summary)}</p>
    <a class="text-link" href="/two-minute-execution/${encodeURIComponent(message.slug)}/">Read the message</a>
  </article>
`;

const archiveItem = (message) => `
  <article class="archive-item">
    <div>
      <div class="message-meta">
        ${message.preview ? "<span>Draft preview</span>" : ""}
        <span>${escapeHtml(message.category)}</span>
        <time datetime="${escapeHtml(message.publishDate)}">${escapeHtml(formatDate(message.publishDate))}</time>
      </div>
      <h3>${escapeHtml(message.title)}</h3>
    </div>
    <p>${escapeHtml(message.summary)}</p>
    <a class="text-link" href="/two-minute-execution/${encodeURIComponent(message.slug)}/">Read</a>
  </article>
`;

const filteredMessages = () => {
  const query = searchInput.value.trim().toLocaleLowerCase();
  const category = categoryFilter.value;

  return messages.filter((message) => {
    const searchable = `${message.title} ${message.summary} ${message.category}`.toLocaleLowerCase();
    return (!query || searchable.includes(query)) && (!category || message.category === category);
  });
};

const renderArchive = () => {
  const matches = filteredMessages();
  const visible = matches.slice(0, visibleCount);

  archiveList.innerHTML = visible.map(archiveItem).join("");
  archiveEmpty.hidden = matches.length !== 0;
  loadMoreButton.hidden = visible.length >= matches.length;

  if (messages.length === 0) {
    resultsStatus.textContent = "No messages have been published yet. The first entries will appear here soon.";
    archiveEmpty.hidden = true;
    return;
  }

  resultsStatus.textContent = `${matches.length} ${matches.length === 1 ? "message" : "messages"} found`;
};

const renderFeatured = () => {
  const featured = messages.filter((message) => message.featured).slice(0, 3);
  const fallback = messages.filter((message) => !message.featured).slice(0, 3 - featured.length);
  const selected = [...featured, ...fallback];

  featuredList.innerHTML = selected.map(messageCard).join("");
  featuredEmpty.hidden = selected.length !== 0;
};

const resetAndRender = () => {
  visibleCount = pageSize;
  renderArchive();
};

searchInput.addEventListener("input", resetAndRender);
categoryFilter.addEventListener("change", resetAndRender);
clearButton.addEventListener("click", () => {
  searchInput.value = "";
  categoryFilter.value = "";
  searchInput.focus();
  resetAndRender();
});
loadMoreButton.addEventListener("click", () => {
  visibleCount += pageSize;
  renderArchive();
});

Promise.all([
  fetch("messages.json").then((response) => {
    if (!response.ok) throw new Error("Unable to load messages");
    return response.json();
  }),
  fetch("categories.json").then((response) => {
    if (!response.ok) throw new Error("Unable to load categories");
    return response.json();
  })
])
  .then(([messageData, categoryData]) => {
    messages = Array.isArray(messageData) ? messageData : [];
    const categories = Array.isArray(categoryData) ? categoryData : [];
    categoryFilter.insertAdjacentHTML("beforeend", categories
      .map((category) => `<option value="${escapeHtml(category)}">${escapeHtml(category)}</option>`)
      .join(""));
    renderFeatured();
    renderArchive();
  })
  .catch(() => {
    resultsStatus.textContent = "The message library could not be loaded. Please try again later.";
    archiveEmpty.textContent = "The archive is temporarily unavailable.";
    archiveEmpty.hidden = false;
    featuredEmpty.textContent = "Featured messages are temporarily unavailable.";
  });
