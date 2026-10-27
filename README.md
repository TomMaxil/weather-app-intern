# Weather Forecast Dashboard

A responsive, glassmorphism-styled weather dashboard built with semantic HTML, custom CSS and vanilla JavaScript. It shows live conditions, hourly and 7-day forecasts, and detailed atmospheric metrics for any city, using the free Open-Meteo APIs.

**Live demo:** [https://weather-app-intern-six.vercel.app/]
**Repository:** [https://github.com/TomMaxil/weather-app-intern]
- **Author:** Muhammad Bilal
- **Program:** Web Development Internship at Taviq AI Solutions

---

## Table of Contents

1. [Project Overview & Objective](#1-project-overview--objective)
2. [Key Features & Functionality](#2-key-features--functionality)
3. [Tech Stack Used](#3-tech-stack-used)
4. [Technical Challenges & Solutions](#4-technical-challenges--solutions)
5. [Local Setup Instructions](#5-local-setup-instructions)
6. [Project Structure](#6-project-structure)
7. [Future Improvements](#7-future-improvements)
8. [Credits](#8-credits)

---

## 1. Project Overview & Objective

The Weather Forecast Dashboard is a single-page web application that lets a user search for any city in the world and instantly see its current weather, an hourly forecast, a weekly forecast and a set of detailed metrics such as wind, humidity, UV index, pressure and visibility.

**Objective.** The project was built during my web development internship to demonstrate that I can deliver a production-quality interface without a framework. The goals were to:
- Integrate multiple REST APIs and handle asynchronous data safely.
- Translate a modern UI reference (glassmorphism with soft shadows) into clean, maintainable CSS.
- Keep the application fast, accessible, and optimized for 60 FPS scrolling performance.

---

## 2. Key Features & Functionality

### Search and Data Flow
- Search any city by pressing **Enter** or clicking **Search** (defaults to Karachi on startup).
- Two-step data flow using free **Open-Meteo Geocoding** and **Forecast APIs** (no API key required).
- Built-in quick select panel for major global cities.

### Forecast & Weather Metrics
- Current conditions (temperature, condition label, high/low, local time).
- 24-hour horizontal scrollable hourly forecast and 7-day weekly outlook.
- Detailed atmospheric grid (wind speed, humidity, UV index, pressure, visibility) and sunrise/sunset sun-arc tracking.

### UI/UX & Performance
- Translucent glassmorphism panels with backdrop blur and dynamic night/day background palettes.
- Fully responsive design engineered with mobile-first CSS units (`clamp()`).
- High accessibility standards with semantic HTML landmarks, keyboard navigation, and `aria-live` regions.

---

## 3. Tech Stack Used

| Category | Technology |
| --- | --- |
| Markup | Semantic HTML5 |
| Styling | Custom CSS3 (Variables, Grid, Flexbox, `backdrop-filter`, animations) |
| Logic | Vanilla JavaScript (ES2020+, `fetch`, `async/await`, `AbortController`) |
| Icons | Font Awesome 6 via cdnjs |
| APIs | Open-Meteo Geocoding and Forecast APIs |
| Deployment | Vercel |

---

## 4. Technical Challenges & Solutions

### 1. Scroll Lag on Glassmorphism Layers
**Challenge:** Heavy usage of `backdrop-filter: blur()` over animated gradient backgrounds caused noticeable frame drops and scrolling lag on desktop and mobile viewports.
**Solution:** Optimized CSS rendering layers by isolating animations, removing redundant container blurring, establishing proper layout containment (`contain: strict`), and ensuring butter-smooth 60 FPS scrolling performance.

### 2. Preventing Race Conditions with In-Flight API Requests
**Challenge:** Rapid typing or repeated clicks could trigger overlapping requests and overwrite newer data with older responses.
**Solution:** Implemented `AbortController` to automatically cancel previous active fetch requests whenever a new search query is initiated.

---

## 5. Local Setup Instructions

```bash
# 1. Clone repository
git clone [https://github.com/your-username/your-repo.git](https://github.com/your-username/your-repo.git)

# 2. Navigate to folder
cd your-repo

# 3. Run locally via Live Server or static server (Node.js/Python)
npx serve .

## 6. Project Structure

```text
.
├── index.html    # Semantic page structure and accessibility landmarks
├── style.css     # Design tokens, glassmorphism theme, layout and animations
├── app.js        # API calls, state handling, rendering and event wiring
└── README.md
```

**API endpoints used**

```text
Geocoding: https://geocoding-api.open-meteo.com/v1/search?name={city}&count=1&language=en&format=json
Forecast:  https://api.open-meteo.com/v1/forecast?latitude={lat}&longitude={lon}&current=...&hourly=...&daily=...&timezone=auto
```

---

## 7. Future Improvements

- Temperature unit toggle (°C and °F) and a remembered last-searched city using `localStorage`.
- Search suggestions with debounced autocomplete.
- Geolocation to load the visitor's local weather automatically.
- Air quality and precipitation probability from additional Open-Meteo endpoints.
- Automated tests for the data-mapping helpers, and a Lighthouse CI check in the deployment pipeline.

---

## 8. Credits

- Weather data by [Open-Meteo](https://open-meteo.com/), licensed under CC BY 4.0.
- Icons by [Font Awesome](https://fontawesome.com/) (Free license).
- Built by Muhammad Bilal as part of the Web Development Internship at Taviq AI Solutions.
