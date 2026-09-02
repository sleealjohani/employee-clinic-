import assert from "node:assert/strict";
import { syntheticId } from "./fixtures.mjs";

// Disposable synthetic database only, called by the real HTTP integration suite.
export async function checkEmployeeLogin({
  prisma,
  page,
  action,
  employee,
  admin,
  password,
}) {
  const login = await page("/login");
  assert.ok(login.html.includes('name="nationalId"'));
  assert.ok(!login.html.includes('name="password"'));
  assert.ok((await page("/login?mode=staff")).html.includes('name="password"'));
  const employeeForm = [
    ...login.html.matchAll(/<form\b[^>]*>[\s\S]*?<\/form>/g),
  ]
    .map((match) => match[0])
    .find((form) => form.includes('name="nationalId"'));
  assert.ok(employeeForm);
  const decode = (value) =>
    value
      .replaceAll("&quot;", '"')
      .replaceAll("&#x27;", "'")
      .replaceAll("&amp;", "&")
      .replaceAll("&lt;", "<")
      .replaceAll("&gt;", ">");
  async function loginWith(nationalId, fields = {}) {
    // Submit the real rendered form, including React's action-state key.
    const body = new FormData();
    for (const [input] of employeeForm.matchAll(/<input\b[^>]*>/g)) {
      const name = /name="([^"]+)"/.exec(input)?.[1];
      if (name)
        body.append(
          decode(name),
          decode(/value="([^"]*)"/.exec(input)?.[1] || ""),
        );
    }
    for (const [name, value] of Object.entries({ nationalId, ...fields }))
      body.set(name, value);
    const response = await fetch(login.response.url, {
      method: "POST",
      body,
      headers: { Origin: new URL(login.response.url).origin },
      redirect: "manual",
    });
    assert.ok(response.status < 500);
    return { response, html: await response.text() };
  }
  const noSession = (result) => {
    assert.notEqual(result.response.status, 303);
    assert.ok(
      !result.response.headers
        .getSetCookie()
        .some((s) => s.startsWith("clinic_session=")),
    );
  };
  const cookie = (result) =>
    result.response.headers
      .getSetCookie()
      .map((s) => s.split(";")[0])
      .join("; ");
  const claims = (result) =>
    JSON.parse(
      Buffer.from(cookie(result).split("=")[1].split(".")[1], "base64url"),
    );

  const totalEmployees = await prisma.employee.count();
  for (const value of ["", "123", "9999999999", "test.admin", "19990000180"])
    noSession(await loginWith(value));
  assert.equal(await prisma.employee.count(), totalEmployees);
  const arabic = await loginWith(
    syntheticId(2).replace(/\d/g, (d) => "٠١٢٣٤٥٦٧٨٩"[Number(d)]),
  );
  assert.equal(arabic.response.status, 303);
  assert.equal(claims(arabic).sub, "test_account_2");
  assert.equal(claims(arabic).role, "EMPLOYEE");
  const forged = await loginWith(syntheticId(1), {
    role: "ADMIN",
    employeeId: "test_employee_2",
    next: "//evil.test",
  });
  assert.equal(claims(forged).sub, "test_account_1");
  assert.equal(claims(forged).role, "EMPLOYEE");
  assert.equal(forged.response.headers.get("location"), "/portal");
  assert.equal(
    (await page("/users", cookie(forged))).response.headers.get("location"),
    "/denied",
  );
  assert.equal(
    (
      await loginWith(syntheticId(1), { next: "/portal/records" })
    ).response.headers.get("location"),
    "/portal/records",
  );
  noSession(
    await action("/login?mode=staff", "loginAction", "", {
      username: "test.admin",
      password: "",
    }),
  );

  for (const role of ["ADMIN", "STAFF", "VIEWER"]) {
    await prisma.user.update({
      where: { id: "test_account_3" },
      data: { role },
    });
    noSession(await loginWith(syntheticId(3)));
    assert.equal(
      (await prisma.user.findUniqueOrThrow({ where: { id: "test_account_3" } }))
        .role,
      role,
    );
  }
  await prisma.user.update({
    where: { id: "test_account_3" },
    data: { role: "EMPLOYEE" },
  });
  await prisma.user.update({
    where: { id: "test_account_2" },
    data: { isActive: false },
  });
  noSession(await loginWith(syntheticId(2)));
  assert.equal(
    (await page("/portal", cookie(arabic))).response.headers.get("location"),
    "/login",
  );
  await prisma.user.update({
    where: { id: "test_account_2" },
    data: { isActive: true },
  });
  for (const data of [
    { isArchived: true },
    { employmentStatus: "TERMINATED" },
    { employmentStatus: "SUSPENDED" },
  ]) {
    await prisma.employee.update({ where: { id: "test_employee_2" }, data });
    noSession(await loginWith(syntheticId(2)));
    assert.equal(
      (await page("/portal", cookie(arabic))).response.headers.get("location"),
      "/login",
    );
    await prisma.employee.update({
      where: { id: "test_employee_2" },
      data: { isArchived: false, employmentStatus: "ACTIVE" },
    });
  }
  await prisma.user.update({
    where: { id: "test_account_2" },
    data: { lockedUntil: new Date(Date.now() + 60000) },
  });
  noSession(await loginWith(syntheticId(2)));
  await prisma.user.update({
    where: { id: "test_account_2" },
    data: { lockedUntil: null, mustChangePassword: true, totpEnabled: true },
  });
  const legacy = await loginWith(syntheticId(2));
  assert.equal(legacy.response.status, 303);
  assert.equal((await page("/portal", cookie(legacy))).response.status, 200);
  const account = await page("/account", employee);
  assert.ok(!account.html.includes('href="/account/password"'));
  assert.equal(
    (await page("/account/password", employee)).response.headers.get(
      "location",
    ),
    "/account",
  );
  await action("/account/password", "changePasswordAction", employee, {
    current: password,
    next: "Another-Strong-Password9!",
    confirm: "Another-Strong-Password9!",
  });
  const beforeTotp = await prisma.user.findUniqueOrThrow({
    where: { id: "test_account_1" },
  });
  await action("/account", "confirmTotpAction", employee, { code: "000000" });
  assert.equal(
    (await prisma.user.findUniqueOrThrow({ where: { id: "test_account_1" } }))
      .totpEnabled,
    beforeTotp.totpEnabled,
  );

  const fresh = await prisma.employee.create({
    data: {
      id: "test_employee_id_only",
      nationalId: syntheticId(7),
      name: "Synthetic ID-only employee",
    },
  });
  const signups = await Promise.all([
    loginWith(fresh.nationalId),
    loginWith(fresh.nationalId),
  ]);
  for (const result of signups) assert.equal(result.response.status, 303);
  assert.equal(await prisma.user.count({ where: { employeeId: fresh.id } }), 1);
  assert.equal(await prisma.employee.count(), totalEmployees + 1);
  const provisioned = await prisma.user.findUniqueOrThrow({
    where: { employeeId: fresh.id },
  });
  assert.equal(provisioned.role, "EMPLOYEE");
  assert.equal(provisioned.mustChangePassword, false);
  assert.ok(!provisioned.username.includes(fresh.nationalId));
  const log = await prisma.auditLog.findFirstOrThrow({
    where: { entityId: provisioned.id, action: "LOGIN" },
  });
  assert.equal(log.meta.method, "NATIONAL_ID");
  assert.equal(log.meta.identityVerified, false);
  // Disabling a provisioned account must not cause another account to be created.
  await action("/users", "toggleUserActiveAction", admin, {
    id: provisioned.id,
  });
  noSession(await loginWith(fresh.nationalId));
  assert.equal(await prisma.user.count({ where: { employeeId: fresh.id } }), 1);
  assert.equal(
    (await page("/portal", cookie(signups[0]))).response.headers.get(
      "location",
    ),
    "/login",
  );

  // Distributed throttle is persisted, not an in-process counter. Append-only logs.
  for (let i = 0; i < 31; i++) noSession(await loginWith("9999999999"));
  const limited = await loginWith(syntheticId(1));
  noSession(limited);
  assert.ok(
    limited.html.includes("auth.employeeRateLimit") ||
      limited.html.includes("محاولات دخول كثيرة"),
  );
}
