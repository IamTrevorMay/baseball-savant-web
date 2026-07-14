// Pin Tailwind's resolve base to this project dir. A stray ~/package.json makes
// Next infer a parent workspace root, so `@import "tailwindcss"` would otherwise
// resolve from the wrong directory and fail (pages hang on CSS compile).
const config = {
  plugins: {
    "@tailwindcss/postcss": {
      base: import.meta.dirname,
    },
  },
};

export default config;
