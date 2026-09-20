# CV Audit Responsive Follow-Up

- After the first CV audit promotion, an independent 390 px production-browser check found dashboard
  cards retained a desktop minimum width and overflowed the viewport.
- The cause was automatic minimum sizing of CSS Grid children containing MapLibre and chart content.
- `.dashboard-grid > * { min-width: 0; }` allows the single-column mobile grid to constrain every card.
  Removed CSS belonged only to retired mock AQI, comparison, saved-location, search, and settings UI.
- The browser test now asserts the document does not exceed the viewport after switching to the mobile
  layout and opening navigation.
- A local production-server smoke at a 390 px viewport measured a 375 px document width with no console
  errors. The updated public production check follows protected promotion.
