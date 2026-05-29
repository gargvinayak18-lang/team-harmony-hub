import server from "../dist/server/index.js";

export const config = {
  runtime: "edge",
};

export default async function handler(request: Request) {
  // Call the fetch method of the Cloudflare Pages/Worker entry compiled by Vite
  return server.fetch(request, {}, {});
}
