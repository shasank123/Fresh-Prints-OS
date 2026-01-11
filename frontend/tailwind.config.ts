import type { Config } from "tailwindcss";

const config: Config = {
    content: [
        "./pages/**/*.{js,ts,jsx,tsx,mdx}",
        "./components/**/*.{js,ts,jsx,tsx,mdx}",
        "./app/**/*.{js,ts,jsx,tsx,mdx}",
        "./src/**/*.{js,ts,jsx,tsx,mdx}",
    ],
    theme: {
        extend: {
            colors: {
                fp: {
                    navy: "#0a192f",    // Deep background
                    lightNavy: "#112240", // Card background
                    gold: "#64ffda",    // Accent (Cyberpunk Gold/Cyan)
                    slate: "#8892b0",   // Muted text
                    white: "#e6f1ff",   // Primary text
                }
            },
            fontFamily: {
                mono: ['"Fira Code"', 'monospace'], // For the terminal
            }
        },
    },
    plugins: [],
};
export default config;