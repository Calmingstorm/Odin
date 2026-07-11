/** Tailwind v3 pinned deliberately: the UI was written against the v3 Play
 * CDN; v3 content scanning over the template strings reproduces it exactly. */
export default {
  content: ['./ui/index.html', './ui/js/**/*.js'],
  // Runtime state maps assemble these names dynamically; keep them visible to
  // Tailwind even when no literal template token exists. Custom CSS owns most
  // styling, but this prevents future utility migrations from vanishing in prod.
  safelist: [
    { pattern: /^(text|bg|border)-(red|green|yellow|blue|gray|amber|indigo|purple|emerald|cyan|orange)-(300|400|500|600|700|800|900|950)$/ },
    { pattern: /^(opacity)-(0|50|100)$/ },
  ],
  theme: { extend: {} },
  plugins: [],
};
