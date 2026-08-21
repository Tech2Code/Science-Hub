const { execSync } = require("child_process");

const MAX_ATTEMPTS = 5;
const DELAY_MS = 5000;

function sleep(ms) {
  execSync(`node -e "setTimeout(()=>{}, ${ms})"`, { stdio: "ignore" });
}

for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
  try {
    execSync("npx prisma migrate deploy", { stdio: "inherit" });
    process.exit(0);
  } catch (err) {
    const isLastAttempt = attempt === MAX_ATTEMPTS;
    if (isLastAttempt) {
      console.error(`prisma migrate deploy failed after ${MAX_ATTEMPTS} attempts`);
      process.exit(1);
    }
    console.warn(
      `prisma migrate deploy failed (attempt ${attempt}/${MAX_ATTEMPTS}) — likely a transient Neon cold-start connection blip, retrying in ${DELAY_MS / 1000}s...`
    );
    sleep(DELAY_MS);
  }
}
