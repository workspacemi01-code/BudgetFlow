import type { MetadataRoute } from "next"

// Lets phones "Add to Home Screen" with the BudgetFlow name and icon.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "BudgetFlow — Budget planning & spend tracking",
    short_name: "BudgetFlow",
    description: "Plan department budgets, approve spend and see what is committed and available in real time.",
    start_url: "/dashboard",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#0f766e",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml" },
      { src: "/apple-icon", sizes: "180x180", type: "image/png" },
    ],
  }
}
