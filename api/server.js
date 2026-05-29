import server from "../dist/server/index.js";
import { Readable } from "node:stream";

export default async function handler(req, res) {
  try {
    const protocol = req.headers['x-forwarded-proto'] || 'http';
    const url = `${protocol}://${req.headers.host}${req.url}`;
    
    const headers = new Headers();
    for (const [key, value] of Object.entries(req.headers)) {
      if (value) {
        if (Array.isArray(value)) {
          value.forEach(v => headers.append(key, v));
        } else {
          headers.set(key, value);
        }
      }
    }

    const requestInit = {
      method: req.method,
      headers,
    };

    if (req.method !== 'GET' && req.method !== 'HEAD') {
      const chunks = [];
      for await (const chunk of req) {
        chunks.push(chunk);
      }
      requestInit.body = Buffer.concat(chunks);
    }

    const webRequest = new Request(url, requestInit);
    const webResponse = await server.fetch(webRequest, {}, {});

    res.statusCode = webResponse.status;
    webResponse.headers.forEach((value, key) => {
      res.setHeader(key, value);
    });

    if (webResponse.body) {
      const nodeReadable = Readable.fromWeb(webResponse.body);
      nodeReadable.pipe(res);
    } else {
      res.end();
    }
  } catch (error) {
    console.error("Vercel Serverless SSR Error:", error);
    res.statusCode = 500;
    res.end("Internal Server Error");
  }
}
