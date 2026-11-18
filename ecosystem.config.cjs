module.exports = {
  apps: [{
    name: "parlanext",
    cwd: "/home/jure/parlanext",
    script: "node_modules/next/dist/bin/next",
    args: "start -H 127.0.0.1 -p 3000",
    env: { NODE_ENV: "production" },
    node_args: "--max-old-space-size=3072",
    max_memory_restart: "3G",
  }]
};