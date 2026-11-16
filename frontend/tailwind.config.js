/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Warm ivory and off-white background canvas
        ivory: {
          25: "#FDFAF5",
          50: "#FAF7F2",
          100: "#F5F0E8",
          200: "#EAE2D5",
          300: "#DDD2C0",
          400: "#C8BAA3",
          500: "#AC9B82",
        },
        // Deep emerald & charcoal navigation
        charcoal: {
          700: "#243229",
          800: "#1A261F",
          900: "#121C16",
          950: "#0C140F",
        },
        forest: {
          700: "#047857",
          800: "#065F46",
          900: "#064E3B",
          950: "#022C22",
        },
        // Elegant teal accents
        teal: {
          50: "#F0FDFA",
          100: "#CCFBF1",
          200: "#99F6E4",
          300: "#5EEAD4",
          400: "#2DD4BF",
          500: "#14B8A6",
          600: "#0D9488",
          700: "#0F766E",
          800: "#115E59",
          900: "#134E4A",
          950: "#042F2E",
        },
        // Soft sage status indicators
        sage: {
          50: "#F4F8F5",
          100: "#E3EFE6",
          200: "#C8DFCE",
          300: "#A5CBB0",
          500: "#5B9E6D",
          600: "#458256",
          700: "#326641",
          800: "#224A2D",
          900: "#16331E",
        },
        // Muted coral for overdue / due today / alert indicators
        coral: {
          50: "#FFF7F5",
          100: "#FFEBE5",
          200: "#FFD5CA",
          300: "#FFB5A3",
          400: "#FA8A70",
          500: "#E06346",
          600: "#C8492C",
          700: "#A8361C",
          800: "#862813",
          900: "#691E0D",
        },
        // Preserve existing tokens for backward compatibility
        navy: {
          50: "#f0f4f8",
          100: "#d9e2ec",
          800: "#102a43",
          900: "#0b1727",
          950: "#070c18",
        },
        royal: {
          50: "#eff6ff",
          100: "#dbeafe",
          500: "#3b82f6",
          600: "#2563eb",
          700: "#1d4ed8",
        },
        cyan: {
          50: "#ecfeff",
          100: "#cffafe",
          500: "#06b6d4",
          600: "#0891b2",
        },
        brand: {
          50: "#F0FDFA",
          100: "#CCFBF1",
          500: "#0D9488",
          600: "#0F766E",
          700: "#115E59",
        },
      },
      boxShadow: {
        xs: "0 1px 2px 0 rgba(0, 0, 0, 0.04)",
        card: "0 1px 3px 0 rgba(28, 25, 23, 0.04), 0 1px 2px -1px rgba(28, 25, 23, 0.04)",
        "card-hover": "0 10px 25px -4px rgba(28, 25, 23, 0.07), 0 4px 10px -3px rgba(28, 25, 23, 0.04)",
        elevated: "0 16px 32px -8px rgba(28, 25, 23, 0.09), 0 6px 14px -4px rgba(28, 25, 23, 0.04)",
        teal: "0 0 20px -3px rgba(13, 148, 136, 0.25)",
      },
    },
  },
  plugins: [],
};
