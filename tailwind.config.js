/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        cream: { DEFAULT: '#FFF8EE', 100: '#FFF3E0', 200: '#FBE7CC' },
        coffee: { 50: '#F6EEE8', 100: '#EADBCF', 300: '#B48C72', 500: '#7B4B2A', 700: '#4E2E1A', 900: '#2B1A10' },
        coral: { 50: '#FFF1EC', 100: '#FFDCCF', 400: '#FF8A65', 500: '#F4683F', 600: '#E0522A', 700: '#B83F1F' },
        mint: { 50: '#E9FBF6', 100: '#C9F3E7', 400: '#34C9A3', 500: '#14B08A', 600: '#0E8F70', 700: '#0B6E57' },
      },
      fontFamily: {
        sans: ['Nunito', 'system-ui', 'sans-serif'],
        display: ['Poppins', 'Nunito', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        soft: '0 4px 20px -6px rgba(78, 46, 26, 0.18)',
        lift: '0 10px 30px -10px rgba(78, 46, 26, 0.30)',
      },
      keyframes: {
        bounceIn: { '0%': { transform: 'scale(1)' }, '40%': { transform: 'scale(1.18)' }, '70%': { transform: 'scale(0.94)' }, '100%': { transform: 'scale(1)' } },
        slideUp: { '0%': { transform: 'translateY(110%)', opacity: 0 }, '100%': { transform: 'translateY(0)', opacity: 1 } },
        fadeIn: { '0%': { opacity: 0, transform: 'translateY(6px)' }, '100%': { opacity: 1, transform: 'translateY(0)' } },
        pop: { '0%': { transform: 'scale(0)', opacity: 0 }, '60%': { transform: 'scale(1.15)', opacity: 1 }, '100%': { transform: 'scale(1)' } },
        draw: { '0%': { strokeDashoffset: 48 }, '100%': { strokeDashoffset: 0 } },
        glow: { '0%,100%': { boxShadow: '0 0 0 0 rgba(244,104,63,0.55)' }, '50%': { boxShadow: '0 0 0 10px rgba(244,104,63,0)' } },
      },
      animation: {
        bounceIn: 'bounceIn 0.45s ease-out',
        slideUp: 'slideUp 0.35s cubic-bezier(.2,.9,.3,1.2)',
        fadeIn: 'fadeIn 0.3s ease-out',
        pop: 'pop 0.5s ease-out',
        draw: 'draw 0.5s 0.35s ease-out forwards',
        glow: 'glow 1.4s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};
