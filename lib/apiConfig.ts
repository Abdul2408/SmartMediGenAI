// For local development: Backend runs on localhost:8001
// For production (Vercel): Set NEXT_PUBLIC_API_URL environment variable to your deployed backend URL
// Example: NEXT_PUBLIC_API_URL=https://your-backend.herokuapp.com

export const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8001";

console.log("📡 API Base URL:", API_BASE_URL);
