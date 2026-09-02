// Synthetic development/integration environment. Never connects to a hosted database.
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import bcrypt from "bcryptjs";
import { splitSql } from "./sql-statements.mjs";
const root = process.cwd(),
  state = path.join(root, ".test-database");
await fs.mkdir(state, { recursive: true, mode: 0o700 });
const db = new PGlite();
await db.waitReady;
for (const name of (
  await fs.readdir(path.join(root, "prisma/migrations"))
).sort()) {
  if (name === "migration_lock.toml") continue;
  for (const sql of splitSql(
    await fs.readFile(
      path.join(root, "prisma/migrations", name, "migration.sql"),
      "utf8",
    ),
  ))
    await db.exec(sql);
  console.log("Applied synthetic migration", name);
}
const databaseUrl = "postgresql://postgres:postgres@127.0.0.1:5140/postgres";
const socket = new PGLiteSocketServer({
  db,
  host: "0.0.0.0",
  port: 5140,
  maxConnections: 20,
});
await socket.start();
const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: databaseUrl, max: 1 }),
});
const password = "Test-" + randomBytes(16).toString("hex") + "9",
  passwordHash = await bcrypt.hash(password, 12);
const admin = await prisma.user.create({
  data: {
    id: "test_admin",
    username: "test.admin",
    name: "مدير تجريبي",
    role: "ADMIN",
    passwordHash,
  },
});
await prisma.user.create({
  data: {
    id: "test_staff",
    username: "test.staff",
    name: "ممارس تجريبي",
    role: "STAFF",
    passwordHash,
  },
});
await prisma.user.create({
  data: {
    id: "test_viewer",
    username: "test.viewer",
    name: "مراقب تجريبي",
    role: "VIEWER",
    passwordHash,
  },
});
function nationalId(i) {
  const body = "19990000" + i;
  let sum = 0;
  for (let n = 0; n < 9; n++) {
    const v = Number(body[n]) * (n % 2 === 0 ? 2 : 1);
    sum += Math.floor(v / 10) + (v % 10);
  }
  return body + ((10 - (sum % 10)) % 10);
}
for (let i = 1; i <= 3; i++) {
  const employee = await prisma.employee.create({
    data: {
      id: "test_employee_" + i,
      nationalId: nationalId(i),
      name: ["موظف تجريبي أول", "موظفة تجريبية ثانية", "موظف تجريبي ثالث"][
        i - 1
      ],
      employeeNo: "TEST-" + i,
      gender: i === 2 ? "FEMALE" : "MALE",
      department: "قسم الاختبار",
      jobTitle: "اختبار",
      phone: "050000000" + i,
      dob: new Date("1990-01-01"),
      hireDate: new Date("2020-01-01"),
      createdById: admin.id,
    },
  });
  await prisma.user.create({
    data: {
      id: "test_account_" + i,
      username: "test.employee" + i,
      name: employee.name,
      role: "EMPLOYEE",
      employeeId: employee.id,
      passwordHash,
    },
  });
  await prisma.employmentHistory.create({
    data: {
      employeeId: employee.id,
      status: "ACTIVE",
      department: employee.department,
    },
  });
}
await fs.writeFile(
  path.join(state, "credentials.json"),
  JSON.stringify({ username: "test.admin", password }),
  { mode: 0o600 },
);
await prisma.$disconnect();
console.log("Synthetic database ready; no real employee data.");
let child;
if (process.argv.includes("--app")) {
  child = spawn(
    process.execPath,
    [
      "node_modules/next/dist/bin/next",
      process.argv.includes("--production") ? "start" : "dev",
      "--hostname",
      "0.0.0.0",
      "--port",
      "3000",
    ],
    {
      cwd: root,
      stdio: "inherit",
      env: {
        ...process.env,
        DATABASE_URL: databaseUrl,
        DIRECT_URL: databaseUrl,
        AUTH_SECRET:
          process.env.AUTH_SECRET || randomBytes(48).toString("base64"),
        NEXT_TELEMETRY_DISABLED: "1",
      },
    },
  );
  child.on("exit", (code) => {
    console.log("Next exited", code);
  });
}
if (process.argv.includes("--test")) {
  const { runIntegration } = await import("./integration.mjs");
  try {
    await runIntegration({
      prisma: new PrismaClient({
        adapter: new PrismaPg({ connectionString: databaseUrl, max: 1 }),
      }),
      database: db,
      password,
      baseUrl: "http://127.0.0.1:3000",
    });
  } catch (e) {
    console.error(e);
    process.exitCode = 1;
  } finally {
    child?.kill("SIGTERM");
    await socket.stop();
    await db.close();
  }
}
for (const signal of ["SIGTERM", "SIGINT"])
  process.on(signal, async () => {
    child?.kill("SIGTERM");
    await socket.stop();
    await db.close();
    process.exit(0);
  });
