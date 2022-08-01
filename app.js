import url from "url";
const __dirname = url.fileURLToPath(new URL('.', import.meta.url));

import express from "express";
import proxy from "express-http-proxy";
import path from "node:path";
import child_process from "node:child_process";
import { promises as fs } from "node:fs";
import chalk from "chalk";
import { format } from "date-fns";

const colors = [chalk.red, chalk.green, chalk.yellow, chalk.blue, chalk.magenta, chalk.cyan];

const coloredLoggerWithPrefix = (prefix, color) => (message) => {
  const date = format(new Date(), "HH:mm:ss.SSS");
  const datePrefix = chalk.white(`[${date}]`);
  const log = `${message}`.split("\n").map(line => {
    const coloredLine = color(`${prefix}: ${line}`);
    return `${datePrefix} ${coloredLine}`;
  }).join("\n");
  console.log(log);
};

const app = express();

const port = process.env.PORT || 3000;

(async () => {

  const files = await fs.readdir(__dirname, { withFileTypes: true });
  const samples = files
    .filter(file => file.isDirectory())
    .map(file => file.name)
    .filter(name => name !== "node_modules");

  app.get("/", (req, res) => {
    res.type("text/plain");
    res.send("Root");
  })


  const promises = samples.map((sample, i) => {
    return new Promise((resolve, reject) => {
      let resolved = false;
      const port = 3001 + i;
      console.log(`Starting child server at ${path.join(__dirname, sample)}`);
      const child = child_process.spawn("npm", ["run", "start"], {
        cwd: path.join(__dirname, sample),
        env: { ...process.env, PORT: port },
        shell: true
      });
      const logger = coloredLoggerWithPrefix(sample, colors[i % colors.length]);
      child.on("error", err => {
        logger(`Failed to start server ${err}`);
      });
      child.stdout.on('data', data => {
        if (!resolved && /ready/i.test(data)) {
          resolve();
          resolved = true;
        }
        logger(data);
      });
      child.stderr.on('data', logger);
      setTimeout(() => {
        if (!resolved) {
          logger("Not started after 2 seconds");
          resolve();
          resolved = true;
        }
      }, 2000);

      app.get(`/${sample}(/*)?`, proxy(`localhost:${port}`, {
        proxyReqPathResolver(req) {
          return req.url.substring(sample.length + 1);
        }
      }));
    });
  });

  try {
    await Promise.all(promises)

    // custom 404 page
    app.use((req, res) => {
      res.type('text/plain')
      res.status(404)
      res.send('Root - 404 - Not Found')
    })

    // custom 500 page
    app.use((err, req, res, next) => {
      console.error(err.message)
      res.type('text/plain')
      res.status(500)
      res.send('Root - 500 - Server Error')
    })

    app.listen(port, () => console.log(
      `Express started on http://localhost:${port}; ` +
      `press Ctrl-C to terminate.`));

  } catch(e) {
    console.log(e);
  }
})();
