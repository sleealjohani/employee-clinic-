// Real HTTP forms and API requests against Next.js and disposable PostgreSQL.
// All identities are synthetic; this suite never connects to the hosted database.
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import { syntheticId, syntheticPdf } from "../tests/fixtures.mjs";
import ExcelJS from "exceljs";
import otplib from "otplib";

const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const unescape = (s) =>
  s
    .replaceAll("&quot;", '"')
    .replaceAll("&#x27;", "'")
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">");
const day = (date) =>
  new Date(date.getTime() + 3 * 3600000).toISOString().slice(0, 10);

export async function runIntegration({ prisma, baseUrl, password }) {
  let passed = 0;
  const pass = (label) => {
    passed++;
    console.log("PASS", label);
  };
  async function page(path, cookie = "") {
    const response = await fetch(baseUrl + path, {
      headers: { Cookie: cookie },
      redirect: "manual",
    });
    return { response, html: await response.text() };
  }
  async function action(path, name, cookie, fields = {}) {
    const manifest = JSON.parse(
      await fs.readFile(".next/server/server-reference-manifest.json", "utf8"),
    );
    const id = Object.keys(manifest.node).find(
      (key) => manifest.node[key].exportedName === name,
    );
    assert.ok(id, `compiled action ${name}`);
    const body = new FormData();
    // React progressive-enhancement encoding, with useActionState's previous state bound.
    body.set("$ACTION_REF_1", "");
    body.set("$ACTION_1:0", JSON.stringify({ id, bound: "$@1" }));
    body.set("$ACTION_1:1", "[{}]");
    for (const [key, value] of Object.entries(fields)) {
      for (const item of Array.isArray(value) ? value : [value])
        body.append(key, item instanceof Blob ? item : String(item));
    }
    const response = await fetch(baseUrl + path, {
      method: "POST",
      body,
      headers: { Cookie: cookie, Origin: baseUrl },
      redirect: "manual",
    });
    const html = await response.text();
    assert.ok(
      response.status < 500,
      `${name} returned HTTP ${response.status}`,
    );
    return { response, html };
  }
  async function api(path, cookie, body, extra = {}) {
    return fetch(baseUrl + path, {
      method: "POST",
      headers: {
        Cookie: cookie,
        Origin: baseUrl,
        "Content-Type": "application/json",
        ...extra,
      },
      body: JSON.stringify(body),
      redirect: "manual",
    });
  }
  try {
    let health;
    for (let attempt = 0; attempt < 80; attempt++) {
      try {
        health = await fetch(baseUrl + "/api/health", {
          signal: AbortSignal.timeout(10000),
        });
        if (health.status === 200) break;
      } catch {}
      await pause(1000);
    }
    assert.equal(health?.status, 200);
    const login = await page("/login");
    assert.equal(login.response.status, 200);
    const loginForm = [...login.html.matchAll(/<form\b[^>]*>[\s\S]*?<\/form>/g)]
      .map((x) => x[0])
      .find((f) => f.includes('name="username"'));
    assert.ok(loginForm);
    async function signIn(username) {
      const body = new FormData();
      for (const input of loginForm.matchAll(/<input\b[^>]*>/g)) {
        const name = /name="([^"]+)"/.exec(input[0])?.[1],
          value = /value="([^"]*)"/.exec(input[0])?.[1] || "";
        if (name) body.append(unescape(name), unescape(value));
      }
      body.set("username", username);
      body.set("password", password);
      const response = await fetch(baseUrl + "/login", {
        method: "POST",
        body,
        headers: { Origin: baseUrl },
        redirect: "manual",
      });
      await response.text();
      assert.equal(response.status, 303, `sign in ${username}`);
      const cookie = response.headers
        .getSetCookie()
        .map((s) => s.split(";")[0])
        .join("; ");
      assert.ok(cookie.includes("clinic_session="));
      return cookie;
    }
    const admin = await signIn("test.admin"),
      staff = await signIn("test.staff");
    const viewer = await signIn("test.viewer"),
      employee = await signIn("test.employee1"),
      employee2 = await signIn("test.employee2");
    assert.equal((await page("/dashboard", admin)).response.status, 200);
    assert.equal((await page("/portal", employee)).response.status, 200);
    assert.equal((await fetch(baseUrl + "/api/export/employees")).status, 401);
    assert.equal(
      (await api("/api/import/upload?step=init", employee, {})).status,
      403,
    );
    const forbidden = await page("/employees/test_employee_2", employee);
    assert.match(forbidden.response.headers.get("location") || "", /denied/);
    assert.ok(!forbidden.html.includes(syntheticId(2)));
    const aggregate = await page("/reports", viewer);
    assert.equal(aggregate.response.status, 200);
    assert.ok(
      !aggregate.html.includes(syntheticId(1)) &&
        !aggregate.html.includes("موظف تجريبي أول"),
    );
    pass(
      "real sign-in, employee ownership, aggregate privacy and unauthenticated API rejection",
    );

    await page("/settings", admin);
    const settings = {
      nameAr: "عيادة الاختبار",
      nameEn: "Synthetic clinic",
      welcomeAr: "رعاية الموظفين",
      welcomeEn: "Employee care",
      contactPhone: "",
      locationAr: "العيادة",
      locationEn: "Clinic",
      accent: "teal",
      motion: "on",
      employeeBooking: "on",
      autoConfirm: "on",
      workingDays: [0, 1, 2, 3, 4, 5, 6],
      opensAt: "08:00",
      closesAt: "18:00",
      slotMinutes: 20,
      capacity: 1,
      bookingDays: 30,
      minimumNoticeHours: 0,
      cancellationHours: 0,
      maxActiveBookings: 10,
      requiredProfileFields: ["phone", "email"],
    };
    await action("/settings", "saveClinicSettings", admin, settings);
    assert.equal(
      JSON.parse(
        (
          await prisma.setting.findUniqueOrThrow({
            where: { key: "clinic.config.v2" },
          })
        ).value,
      ).nameEn,
      settings.nameEn,
    );
    await action("/settings", "saveClinicSettings", staff, {
      ...settings,
      nameEn: "Unauthorized change",
    });
    assert.equal(
      JSON.parse(
        (
          await prisma.setting.findUniqueOrThrow({
            where: { key: "clinic.config.v2" },
          })
        ).value,
      ).nameEn,
      settings.nameEn,
    );
    pass("manager configuration persists and staff cannot change it");

    await page("/portal/appointments/new", employee);
    await page("/appointments/new", admin);
    const tomorrow = day(new Date(Date.now() + 86400000));
    const startsAt = new Date(tomorrow + "T09:00:00+03:00").toISOString(),
      requestKey = randomUUID();
    await action("/portal/appointments/new", "bookAppointment", employee, {
      serviceId: "svc_consultation",
      startsAt,
      employeeId: "test_employee_2",
      reason: "Synthetic visit",
      requestKey,
    });
    const booked = await prisma.appointment.findUniqueOrThrow({
      where: { requestKey },
    });
    assert.equal(booked.employeeId, "test_employee_1");
    await action("/portal/appointments/new", "bookAppointment", employee, {
      serviceId: "svc_consultation",
      startsAt,
      requestKey,
    });
    assert.equal(await prisma.appointment.count({ where: { requestKey } }), 1);
    await action("/portal/appointments/new", "bookAppointment", employee2, {
      serviceId: "svc_consultation",
      startsAt,
      requestKey: randomUUID(),
    });
    assert.equal(
      await prisma.appointment.count({
        where: { startsAt: new Date(startsAt) },
      }),
      1,
    );
    const contested = new Date(tomorrow + "T10:00:00+03:00").toISOString();
    await Promise.all([
      action("/appointments/new", "bookAppointment", admin, {
        employeeId: "test_employee_2",
        serviceId: "svc_consultation",
        startsAt: contested,
        requestKey: randomUUID(),
      }),
      action("/appointments/new", "bookAppointment", admin, {
        employeeId: "test_employee_3",
        serviceId: "svc_consultation",
        startsAt: contested,
        requestKey: randomUUID(),
      }),
    ]);
    assert.equal(
      await prisma.appointment.count({
        where: { startsAt: new Date(contested) },
      }),
      1,
    );
    await action(
      "/portal/appointments/new",
      "changeAppointmentStatus",
      employee2,
      { id: booked.id, status: "CANCELLED", reason: "Wrong owner" },
    );
    assert.equal(
      (await prisma.appointment.findUniqueOrThrow({ where: { id: booked.id } }))
        .status,
      "CONFIRMED",
    );
    await action("/settings", "saveScheduleBlock", admin, {
      startsAt: tomorrow + "T09:00",
      endsAt: tomorrow + "T09:30",
      reason: "Existing booking",
    });
    assert.equal(await prisma.scheduleBlock.count(), 0);
    pass(
      "booking ownership, retry idempotency, concurrent capacity and closure conflicts",
    );

    // Move only this synthetic appointment into today's session for the check-in flow.
    const now = new Date(),
      later = new Date(now.getTime() + 20 * 60000);
    await prisma.appointment.update({
      where: { id: booked.id },
      data: { startsAt: now, endsAt: later },
    });
    await page("/appointments", staff);
    await action("/appointments", "changeAppointmentStatus", staff, {
      id: booked.id,
      status: "CHECKED_IN",
    });
    await action("/appointments", "changeAppointmentStatus", staff, {
      id: booked.id,
      status: "CHECKED_IN",
    });
    const arrived = await prisma.appointment.findUniqueOrThrow({
      where: { id: booked.id },
    });
    assert.ok(arrived.visitId);
    assert.equal(
      await prisma.visit.count({ where: { employeeId: "test_employee_1" } }),
      1,
    );
    const visitPath = "/visits/" + arrived.visitId;
    assert.equal((await page(visitPath, staff)).response.status, 200);
    const visitFields = {
      id: arrived.visitId,
      revision: 0,
      employeeId: "test_employee_1",
      type: "CONSULTATION",
      visitDate: day(now),
      chiefComplaint: "Synthetic complaint",
      diagnosis: "Synthetic assessment",
      plan: "Synthetic follow up",
      tempC: "36.8",
      pulse: "72",
      complete: "on",
    };
    await action(visitPath, "saveVisitAction", staff, visitFields);
    const completed = await prisma.visit.findUniqueOrThrow({
      where: { id: arrived.visitId },
    });
    assert.ok(completed.completedAt);
    assert.equal(completed.revision, 1);
    assert.equal(
      (await prisma.appointment.findUniqueOrThrow({ where: { id: booked.id } }))
        .status,
      "COMPLETED",
    );
    await action(visitPath, "saveVisitAction", staff, {
      ...visitFields,
      plan: "Stale overwrite",
      amendReason: "Synthetic amendment",
    });
    assert.equal(
      (await prisma.visit.findUniqueOrThrow({ where: { id: arrived.visitId } }))
        .plan,
      "Synthetic follow up",
    );
    pass(
      "check-in creates one visit; completion updates appointments; stale edits are rejected",
    );

    const labFields = {
      employeeId: "test_employee_1",
      visitId: arrived.visitId,
      testCode: "FBS",
      resultType: "QUANTITATIVE",
      valueNum: "95",
      comparator: "EQ",
      unit: "mg/dL",
      collectedAt: day(now),
      orderNo: "SYNTHETIC-NORMAL-001",
    };
    await action(visitPath, "createLabAction", staff, labFields);
    const normal = await prisma.labResult.findFirstOrThrow({
      where: { orderNo: labFields.orderNo },
    });
    await action(visitPath, "releaseLabAction", staff, {
      id: normal.id,
      release: "yes",
    });
    assert.equal(
      (await prisma.labResult.findUniqueOrThrow({ where: { id: normal.id } }))
        .releasedAt,
      null,
    );
    await action(visitPath, "reviewLabAction", staff, { id: normal.id });
    await action(visitPath, "releaseLabAction", staff, {
      id: normal.id,
      release: "yes",
    });
    assert.ok(
      (await prisma.labResult.findUniqueOrThrow({ where: { id: normal.id } }))
        .releasedAt,
    );
    await action(visitPath, "createLabAction", staff, {
      ...labFields,
      valueNum: "500",
      orderNo: "SYNTHETIC-CRITICAL-001",
    });
    const critical = await prisma.labResult.findFirstOrThrow({
      where: { orderNo: "SYNTHETIC-CRITICAL-001" },
    });
    assert.equal(critical.flag, "CRITICAL_HIGH");
    await action(visitPath, "reviewLabAction", staff, { id: critical.id });
    await action(visitPath, "releaseLabAction", staff, {
      id: critical.id,
      release: "yes",
    });
    assert.equal(
      (await prisma.labResult.findUniqueOrThrow({ where: { id: critical.id } }))
        .releasedAt,
      null,
    );
    await action(visitPath, "notifyCriticalAction", staff, {
      id: critical.id,
      notifiedTo: "Synthetic clinician",
      action: "Synthetic notification and follow up",
    });
    await action(visitPath, "releaseLabAction", staff, {
      id: critical.id,
      release: "yes",
    });
    assert.ok(
      (await prisma.labResult.findUniqueOrThrow({ where: { id: critical.id } }))
        .releasedAt,
    );
    const ownRecords = await page("/portal/records", employee),
      otherRecords = await page("/portal/records", employee2);
    assert.equal(ownRecords.response.status, 200);
    assert.equal(otherRecords.response.status, 200);
    assert.ok(ownRecords.html.includes("سكر الدم الصائم"));
    assert.ok(!otherRecords.html.includes("سكر الدم الصائم"));
    pass(
      "clinical review and critical notification gate sharing; employees see only their records",
    );

    await page("/portal/profile", employee);
    const originalProfile = await prisma.employee.findUniqueOrThrow({
      where: { id: "test_employee_1" },
    });
    await action("/portal/profile", "requestProfileUpdate", employee, {
      email: "employee@example.invalid",
      employeeId: "test_employee_2",
    });
    const request = await prisma.serviceRequest.findFirstOrThrow({
      where: { kind: "PROFILE_UPDATE", employeeId: "test_employee_1" },
    });
    await page("/requests", staff);
    await action("/requests", "respondToRequest", staff, {
      id: request.id,
      status: "COMPLETED",
      response: "Checked synthetic details",
    });
    const updatedProfile = await prisma.employee.findUniqueOrThrow({
      where: { id: "test_employee_1" },
    });
    assert.equal(updatedProfile.email, "employee@example.invalid");
    assert.equal(updatedProfile.phone, originalProfile.phone);
    assert.equal(
      updatedProfile.dob.toISOString(),
      originalProfile.dob.toISOString(),
    );
    await action("/portal/profile", "requestProfileUpdate", employee, {
      dob: "2024-02-31",
    });
    assert.equal(
      await prisma.serviceRequest.count({
        where: { kind: "PROFILE_UPDATE", status: "OPEN" },
      }),
      0,
    );
    await page("/portal/requests", employee);
    await action("/portal/requests", "createServiceRequest", employee, {
      serviceId: "svc_records",
      message: "Synthetic records request",
    });
    await action("/portal/requests", "createServiceRequest", employee, {
      serviceId: "svc_records",
      message: "Duplicate synthetic request",
    });
    assert.equal(
      await prisma.serviceRequest.count({
        where: { serviceId: "svc_records", status: "OPEN" },
      }),
      1,
    );
    pass(
      "profile requests preserve omitted data and validate dates; service requests prevent duplicates",
    );

    const bytes = syntheticPdf(
      [
        "National ID: " + syntheticId(1),
        "Patient Name: Synthetic Employee",
        "Collection Date: 01/09/2025",
        "Fasting glucose 95 mg/dL 70-99",
        "HBsAg Non-Reactive",
      ],
      3 * 1024 * 1024,
    );
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    const initialized = await api("/api/import/upload?step=init", admin, {
      filename: "synthetic-large.pdf",
      mimeType: "application/pdf",
      size: bytes.length,
      sha256,
    });
    assert.equal(initialized.status, 200);
    const upload = await initialized.json();
    async function sendChunk(offset, data) {
      return fetch(
        baseUrl +
          `/api/import/upload?step=chunk&id=${upload.attachmentId}&offset=${offset}`,
        {
          method: "POST",
          headers: {
            Cookie: admin,
            Origin: baseUrl,
            "Content-Type": "application/octet-stream",
          },
          body: data,
        },
      );
    }
    const first = bytes.subarray(0, upload.chunkBytes);
    assert.equal((await sendChunk(0, first)).status, 200);
    assert.equal((await sendChunk(0, first)).status, 200);
    assert.equal(
      (
        await prisma.attachment.findUniqueOrThrow({
          where: { id: upload.attachmentId },
        })
      ).size,
      first.length,
    );
    const conflicting = Buffer.from(first);
    conflicting[20] ^= 1;
    assert.equal((await sendChunk(0, conflicting)).status, 409);
    assert.equal(
      (
        await api("/api/import/upload?step=finish", admin, {
          batchId: upload.batchId,
        })
      ).status,
      409,
    );
    for (
      let offset = upload.chunkBytes;
      offset < bytes.length;
      offset += upload.chunkBytes
    )
      assert.equal(
        (
          await sendChunk(
            offset,
            bytes.subarray(offset, offset + upload.chunkBytes),
          )
        ).status,
        200,
      );
    assert.equal(
      (
        await api("/api/import/upload?step=finish", admin, {
          batchId: upload.batchId,
        })
      ).status,
      200,
    );
    const imported = await prisma.labImportBatch.findUniqueOrThrow({
      where: { id: upload.batchId },
      include: {
        items: true,
        attachment: { select: { isComplete: true, sha256: true } },
      },
    });
    assert.equal(imported.attachment.isComplete, true);
    assert.equal(imported.attachment.sha256, sha256);
    assert.equal(imported.status, "NEEDS_REVIEW");
    assert.ok(imported.items.length >= 2);
    assert.ok(
      imported.items.every(
        (item) =>
          item.matchedEmployeeId === "test_employee_1" &&
          item.review === "PENDING",
      ),
    );
    assert.equal(
      await prisma.attachmentChunk.count({
        where: { attachmentId: upload.attachmentId },
      }),
      0,
    );
    const duplicateUpload = await (
      await api("/api/import/upload?step=init", admin, {
        filename: "same-source.pdf",
        mimeType: "application/pdf",
        size: bytes.length,
        sha256,
      })
    ).json();
    assert.equal(duplicateUpload.batchId, upload.batchId);
    const range = await fetch(
      baseUrl + "/api/attachments/" + upload.attachmentId,
      { headers: { Cookie: admin, Range: "bytes=0-1023" }, redirect: "manual" },
    );
    assert.equal(range.status, 206);
    assert.deepEqual(
      Buffer.from(await range.arrayBuffer()),
      bytes.subarray(0, 1024),
    );
    assert.equal(
      (
        await fetch(baseUrl + "/api/attachments/" + upload.attachmentId, {
          headers: { Cookie: employee },
          redirect: "manual",
        })
      ).status,
      403,
    );
    assert.equal(
      (
        await api(
          "/api/import/upload?step=init",
          admin,
          {},
          { Origin: "https://untrusted.invalid" },
        )
      ).status,
      403,
    );
    pass(
      "chunked PDFs: retries, incomplete rejection, extraction, deduplication and private ranged viewing",
    );

    const reviewPath = "/labs/import/" + upload.batchId;
    assert.equal((await page(reviewPath, admin)).response.status, 200);
    await action(reviewPath, "commitBatchAction", admin, {
      batchId: upload.batchId,
    });
    assert.equal(
      await prisma.labResult.count({
        where: { sourceAttachmentId: upload.attachmentId },
      }),
      0,
    );
    for (const item of imported.items) {
      await action(reviewPath, "reviewItemAction", admin, {
        id: item.id,
        decision: "approve",
        employeeId: "test_employee_1",
        testCode: item.testCode,
        resultType: item.resultType,
        valueNum: item.valueNum ?? "",
        valueText: item.valueText ?? "",
        comparator: item.comparator,
        unit: item.unit || "",
        collectedAt: item.collectedAt?.toISOString().slice(0, 10) || "",
        refLow: item.refLow ?? "",
        refHigh: item.refHigh ?? "",
      });
    }
    await action(reviewPath, "commitBatchAction", admin, {
      batchId: upload.batchId,
    });
    await action(reviewPath, "commitBatchAction", admin, {
      batchId: upload.batchId,
    });
    assert.equal(
      await prisma.labResult.count({
        where: { sourceAttachmentId: upload.attachmentId },
      }),
      imported.items.length,
    );
    assert.ok(
      (
        await prisma.labImportItem.findMany({
          where: { batchId: upload.batchId },
        })
      ).every(
        (item) =>
          item.reviewedById === "test_admin" && item.committedLabResultId,
      ),
    );
    pass(
      "human import review is mandatory; repeated commits cannot duplicate results",
    );

    const beforeDuplicate = await prisma.labResult.count();
    const legacyFile = await prisma.attachment.create({
      data: {
        filename: "synthetic-legacy-copy.pdf",
        mimeType: "application/pdf",
        size: bytes.length,
        data: bytes,
        sha256,
        uploadedById: "test_admin",
      },
    });
    const legacyBatch = await prisma.labImportBatch.create({
      data: {
        filename: legacyFile.filename,
        attachmentId: legacyFile.id,
        status: "NEEDS_REVIEW",
        uploadedById: "test_admin",
      },
    });
    for (const original of imported.items) {
      const copy = { ...original };
      delete copy.id;
      delete copy.createdAt;
      await prisma.labImportItem.create({
        data: {
          ...copy,
          batchId: legacyBatch.id,
          review: "APPROVED",
          reviewedAt: new Date(),
          reviewedById: "test_admin",
          committedLabResultId: null,
        },
      });
    }
    const legacyPath = "/labs/import/" + legacyBatch.id;
    await page(legacyPath, admin);
    await action(legacyPath, "commitBatchAction", admin, {
      batchId: legacyBatch.id,
    });
    assert.equal(await prisma.labResult.count(), beforeDuplicate);
    assert.equal(
      await prisma.labImportItem.count({
        where: {
          batchId: legacyBatch.id,
          review: "REJECTED",
          rejectReason: "v2.duplicateSource",
        },
      }),
      imported.items.length,
    );
    pass(
      "legacy copies of the same report cannot duplicate previously saved results",
    );

    const workbook = new ExcelJS.Workbook(),
      sheet = workbook.addWorksheet("Synthetic employees");
    sheet.addRow(["name", "national id", "email", "employment type"]);
    sheet.addRow([
      "Existing synthetic employee",
      syntheticId(1),
      "conflict@example.invalid",
      "Synthetic contract",
    ]);
    sheet.addRow([
      "New synthetic employee",
      syntheticId(4),
      "new@example.invalid",
      "Synthetic contract",
    ]);
    const spreadsheet = new File(
      [await workbook.xlsx.writeBuffer()],
      "synthetic-employees.xlsx",
      {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      },
    );
    await page("/employees/import", admin);
    const employeeCount = await prisma.employee.count();
    await action("/employees/import", "importEmployeesAction", admin, {
      file: spreadsheet,
      mode: "preview",
    });
    assert.equal(await prisma.employee.count(), employeeCount);
    await action("/employees/import", "importEmployeesAction", admin, {
      file: spreadsheet,
      mode: "commit",
    });
    assert.equal(await prisma.employee.count(), employeeCount + 1);
    const mergedEmployee = await prisma.employee.findUniqueOrThrow({
      where: { id: "test_employee_1" },
    });
    assert.equal(mergedEmployee.email, "employee@example.invalid");
    assert.equal(mergedEmployee.employmentType, "Synthetic contract");
    assert.ok(
      await prisma.setting.findUnique({
        where: { key: "employees.import.latest" },
      }),
    );
    const newEmployee = await prisma.employee.findUniqueOrThrow({
      where: { nationalId: syntheticId(4) },
    });
    await page("/users", admin);
    await action("/users", "createUserAction", admin, {
      username: "test.newemployee",
      name: newEmployee.name,
      role: "EMPLOYEE",
      employeeId: newEmployee.id,
    });
    const account = await prisma.user.findUniqueOrThrow({
      where: { username: "test.newemployee" },
    });
    assert.equal(account.employeeId, newEmployee.id);
    assert.equal(account.mustChangePassword, true);
    await action("/users", "createUserAction", admin, {
      username: "test.duplicatelink",
      name: "Duplicate link",
      role: "EMPLOYEE",
      employeeId: newEmployee.id,
    });
    assert.equal(
      await prisma.user.count({ where: { employeeId: newEmployee.id } }),
      1,
    );
    await action("/users", "toggleUserActiveAction", admin, {
      id: "test_admin",
    });
    assert.equal(
      (await prisma.user.findUniqueOrThrow({ where: { id: "test_admin" } }))
        .isActive,
      true,
    );
    pass(
      "spreadsheet preview/merge preserves existing data and the manager creates one linked employee account",
    );

    for (const path of [
      "/employees",
      "/employees/test_employee_1",
      "/visits",
      "/labs",
      "/vaccinations",
      "/due",
      "/reports",
      "/users",
      "/audit",
      "/notifications",
      "/account",
      "/documents/" + upload.attachmentId,
    ])
      assert.equal(
        (await page(path, admin)).response.status,
        200,
        `staff screen ${path}`,
      );
    for (const path of [
      "/portal",
      "/portal/appointments",
      "/portal/profile",
      "/portal/records",
      "/portal/requests",
      "/notifications",
    ])
      assert.equal(
        (await page(path, employee)).response.status,
        200,
        `employee screen ${path}`,
      );
    const audit = await prisma.auditLog.findFirstOrThrow();
    await assert.rejects(
      prisma.auditLog.update({
        where: { id: audit.id },
        data: { summary: "Forbidden rewrite" },
      }),
    );
    await assert.rejects(prisma.auditLog.delete({ where: { id: audit.id } }));
    await assert.rejects(
      prisma.employee.delete({ where: { id: "test_employee_1" } }),
    );
    await assert.rejects(
      prisma.$executeRawUnsafe('TRUNCATE "LabResult" CASCADE'),
    );
    const unprotected =
      await prisma.$queryRaw`SELECT tablename::text FROM pg_tables WHERE schemaname='public' AND NOT rowsecurity`;
    assert.equal(unprotected.length, 0);
    assert.ok(
      (await prisma.notification.count({
        where: { userId: "test_account_1" },
      })) > 0,
    );
    await prisma.user.update({
      where: { id: "test_account_1" },
      data: { tokenVersion: { increment: 1 } },
    });
    assert.equal((await api("/api/auth/refresh", employee, {})).status, 401);
    await prisma.user.update({
      where: { id: "test_staff" },
      data: { mustChangePassword: true },
    });
    assert.equal(
      (await api("/api/import/upload?step=init", staff, {})).status,
      401,
    );
    pass(
      "screens render; immutable audit, clinical deletion guards, RLS and session revocation hold",
    );
    const mfaManifest = JSON.parse(
      await fs.readFile(".next/server/server-reference-manifest.json", "utf8"),
    );
    const setupId = Object.keys(mfaManifest.node).find(
      (id) => mfaManifest.node[id].exportedName === "beginTotpSetup",
    );
    assert.ok(setupId);
    const setupResponse = await fetch(baseUrl + "/account", {
      method: "POST",
      headers: {
        Cookie: admin,
        Origin: baseUrl,
        "Next-Action": setupId,
        "Content-Type": "text/plain;charset=UTF-8",
      },
      body: JSON.stringify([password]),
    });
    await setupResponse.text();
    assert.equal(setupResponse.status, 200);
    const pending = await prisma.user.findUniqueOrThrow({
      where: { id: "test_admin" },
    });
    assert.ok(pending.pendingTotpSecret);
    assert.equal(pending.totpEnabled, false);
    const confirmation = await action("/account", "confirmTotpAction", admin, {
      code: otplib.authenticator.generate(pending.pendingTotpSecret),
    });
    const secured = await prisma.user.findUniqueOrThrow({
      where: { id: "test_admin" },
    });
    assert.equal(secured.totpEnabled, true);
    assert.equal(secured.pendingTotpSecret, null);
    assert.ok(secured.tokenVersion > pending.tokenVersion);
    assert.ok(
      confirmation.response.headers
        .getSetCookie()
        .some((cookie) => cookie.startsWith("clinic_session=")),
    );
    assert.equal((await api("/api/auth/refresh", admin, {})).status, 401);
    pass(
      "password-verified two-factor setup activates only after a valid code and revokes previous sessions",
    );
    console.log("Completed", passed, "HTTP/database integration flows.");
  } finally {
    await prisma.$disconnect();
  }
}
