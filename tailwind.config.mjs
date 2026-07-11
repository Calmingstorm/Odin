/** Tailwind v3 pinned deliberately: the UI was written against the v3 Play
 * CDN; v3 content scanning over the template strings reproduces it exactly. */
export default {
  content: ['./ui/index.html', './ui/js/**/*.js'],
  theme: { extend: {} },
  plugins: [],
};
