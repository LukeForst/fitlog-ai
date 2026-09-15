import { toDashboardViewModel, type DashboardViewInput } from "./dashboard-model.ts";

export function renderDashboard(root: HTMLElement, payload: DashboardViewInput): void {
  const view = toDashboardViewModel(payload);
  root.replaceChildren();

  const cards = document.createElement("section");
  cards.className = "cards";
  for (const card of view.cards) {
    const cardElement = document.createElement("article");
    const label = document.createElement("span");
    label.textContent = card.label;
    const value = document.createElement("strong");
    value.textContent = card.value;
    cardElement.append(label, value);
    cards.append(cardElement);
  }

  const trend = document.createElement("section");
  trend.className = "trend";
  const title = document.createElement("h2");
  title.textContent = "动作趋势";
  trend.append(title, createTrendSvg(view.exercisePoints));

  const recent = document.createElement("section");
  recent.className = "recent";
  const recentTitle = document.createElement("h2");
  recentTitle.textContent = "最近训练";
  recent.append(recentTitle);
  for (const workout of view.recentWorkouts) {
    const row = document.createElement("p");
    row.textContent = `${workout.date} · ${workout.title} · ${workout.volumeKg} kg`;
    recent.append(row);
  }

  root.append(cards, trend, recent);
}

function createTrendSvg(points: Array<{ date: string; value: number }>): SVGSVGElement {
  const namespace = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(namespace, "svg");
  svg.setAttribute("viewBox", "0 0 300 120");
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-label", "动作训练量趋势");
  if (points.length === 0) {
    return svg;
  }
  const maximum = Math.max(...points.map((point) => point.value), 1);
  const coordinates = points.map((point, index) => {
    const x = points.length === 1 ? 150 : 20 + (260 * index) / (points.length - 1);
    const y = 100 - (80 * point.value) / maximum;
    return `${x},${y}`;
  }).join(" ");
  const polyline = document.createElementNS(namespace, "polyline");
  polyline.setAttribute("points", coordinates);
  polyline.setAttribute("fill", "none");
  polyline.setAttribute("stroke", "#2f7d64");
  polyline.setAttribute("stroke-width", "4");
  svg.append(polyline);
  return svg;
}
